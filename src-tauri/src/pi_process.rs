use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager};

use crate::settings;

pub const PI_EVENT: &str = "pi-event";
pub const PI_EXITED: &str = "pi-exited";
pub const PI_STATE: &str = "pi-state";

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase", tag = "state")]
pub enum PiState {
    Stopped,
    Starting { cwd: String },
    Running { cwd: String },
}

/// Handle owning the pi RPC subprocess.
pub struct PiProcess {
    child: Mutex<Option<Child>>,
    stdin: Mutex<Option<ChildStdin>>,
    cwd: Mutex<Option<String>>,
}

impl PiProcess {
    pub fn new() -> Self {
        Self {
            child: Mutex::new(None),
            stdin: Mutex::new(None),
            cwd: Mutex::new(None),
        }
    }

    pub fn is_running(&self) -> bool {
        self.child.lock().unwrap().is_some()
    }

    pub fn cwd(&self) -> Option<String> {
        self.cwd.lock().unwrap().clone()
    }
}

pub type SharedProcess = Arc<PiProcess>;

/// Locate the pi binary: explicit setting wins, then PATH, then the
/// managed-installer launcher `~/.pi/agent/bin/pi`, then well-known fallbacks.
/// GUI apps get a minimal PATH, so filesystem candidates matter most.
pub fn locate_pi(explicit: Option<&str>) -> Result<PathBuf, String> {
    if let Some(p) = explicit.filter(|p| !p.trim().is_empty()) {
        let path = PathBuf::from(shellexpand(p));
        if path.is_file() {
            return Ok(path);
        }
        return Err(format!("在配置的路径中未找到 pi 二进制：{p}"));
    }

    // PATH lookup (works when launched from a shell; augmented for GUI)
    for dir in std::env::split_paths(&augmented_path()) {
        let candidate = dir.join("pi");
        if candidate.is_file() {
            return Ok(candidate);
        }
    }

    // Filesystem candidates for GUI launches (minimal PATH):
    // 1. managed installer launcher (self-contained shell script)
    // 2. managed release bin via node_modules
    // 3. common install prefixes
    let home = std::env::var("HOME").map_err(|_| "环境变量 HOME 未设置".to_string())?;
    let mut candidates = vec![PathBuf::from(&home).join(".pi/agent/bin/pi")];

    let install_root = PathBuf::from(&home).join(".pi/agent/install/releases");
    if let Ok(entries) = std::fs::read_dir(&install_root) {
        let mut versions: Vec<_> = entries
            .filter_map(|e| e.ok())
            .filter(|e| e.path().is_dir())
            .map(|e| e.path())
            .collect();
        // Lexical sort is adequate for dotted versions; last = highest.
        versions.sort();
        if let Some(latest) = versions.last() {
            candidates.push(latest.join("node_modules/.bin/pi"));
        }
    }

    for dir in ["/opt/homebrew/bin", "/usr/local/bin", ".local/bin"] {
        let path = if dir.starts_with('/') {
            PathBuf::from(dir).join("pi")
        } else {
            PathBuf::from(&home).join(dir).join("pi")
        };
        candidates.push(path);
    }

    for candidate in &candidates {
        if candidate.is_file() {
            return Ok(candidate.clone());
        }
    }

    Err("在 PATH 或 ~/.pi/agent/bin 中均未找到 pi 二进制（可在设置中手动指定路径）".to_string())
}

fn shellexpand(p: &str) -> String {
    if let Some(rest) = p.strip_prefix("~/")
        && let Ok(home) = std::env::var("HOME")
    {
        return format!("{home}/{rest}");
    }
    p.to_string()
}

/// PATH for the pi child process. GUI apps inherit a minimal PATH
/// (`/usr/bin:/bin:…`) that misses version-manager node installs, which
/// breaks pi's `#!/usr/bin/env node` shebang chain. Augment with the
/// common node managers and install prefixes (pi-node, Volta, nvm,
/// Homebrew, ~/.local).
pub fn augmented_path() -> std::ffi::OsString {
    let home = std::env::var("HOME").unwrap_or_default();
    let mut dirs: Vec<PathBuf> = Vec::new();

    if let Ok(p) = std::env::var("PATH") {
        dirs.extend(std::env::split_paths(&p));
    }

    // pi managed node
    dirs.push(PathBuf::from(&home).join(".local/share/pi-node/current/bin"));
    // Volta: shims + newest installed toolchain
    dirs.push(PathBuf::from(&home).join(".volta/bin"));
    push_newest_glob_bin(
        &mut dirs,
        PathBuf::from(&home).join(".volta/tools/image/node"),
    );
    // nvm: newest installed toolchain
    push_newest_glob_bin(&mut dirs, PathBuf::from(&home).join(".nvm/versions/node"));
    // common prefixes
    for dir in ["/opt/homebrew/bin", "/usr/local/bin"] {
        dirs.push(PathBuf::from(dir));
    }
    dirs.push(PathBuf::from(&home).join(".local/bin"));

    std::env::join_paths(&dirs).unwrap_or_else(|_| std::env::var_os("PATH").unwrap_or_default())
}

/// If `base` has versioned subdirectories, append `<newest>/bin`.
fn push_newest_glob_bin(dirs: &mut Vec<PathBuf>, base: PathBuf) {
    let Ok(entries) = std::fs::read_dir(&base) else {
        return;
    };
    let mut versions: Vec<PathBuf> = entries
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.is_dir())
        .collect();
    versions.sort();
    if let Some(latest) = versions.last() {
        dirs.push(latest.join("bin"));
    }
}

/// Spawn `pi --mode rpc` in `cwd`, wire stdout/stderr readers, return.
pub fn spawn(app: AppHandle, process: SharedProcess, cwd: PathBuf) -> Result<(), String> {
    if process.is_running() {
        stop(&process, &app);
    }

    let settings = settings::load(&app);
    let binary = locate_pi(settings.pi_path.as_deref())?;

    if !cwd.is_dir() {
        return Err(format!("工作目录不存在：{}", cwd.display()));
    }

    emit_state(
        &app,
        &process,
        PiState::Starting {
            cwd: cwd.display().to_string(),
        },
    );

    let mut command = Command::new(&binary);
    command
        .arg("--mode")
        .arg("rpc")
        // Session persistence ON: pi writes session files under
        // ~/.pi/agent/sessions so conversations survive restarts and
        // show up in the sidebar session list.
        .current_dir(&cwd)
        .env("PATH", augmented_path())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        // Ensure pi receives SIGINT/SIGTERM and no lingering process group issues.
        command.process_group(0);
    }

    let mut child = command
        .spawn()
        .map_err(|e| format!("启动 pi 进程失败：{e}"))?;

    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "无法获取 pi 的标准输入".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "无法获取 pi 的标准输出".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "无法获取 pi 的标准错误".to_string())?;

    *process.cwd.lock().unwrap() = Some(cwd.display().to_string());

    // stderr -> log file (never parsed as protocol data)
    let app_for_err = app.clone();
    std::thread::spawn(move || {
        let log_path = stderr_log_path(&app_for_err);
        if let Some(dir) = log_path.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let reader = BufReader::new(stderr);
        if let Ok(mut file) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path)
        {
            let timestamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or_default();
            let _ = writeln!(file, "--- pi stderr session @ {timestamp} ---");
            for line in reader.lines().map_while(Result::ok) {
                let _ = writeln!(file, "{line}");
            }
        }
    });

    // stdout -> JSONL records -> emit to frontend
    let app_for_out = app.clone();
    let proc_for_out = process.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.split(b'\n') {
            let Ok(bytes) = line else { break };
            // Strip optional trailing CR (CRLF tolerance).
            let bytes = if bytes.last() == Some(&b'\r') {
                &bytes[..bytes.len() - 1]
            } else {
                &bytes[..]
            };
            if bytes.is_empty() {
                continue;
            }
            // Only LF is a record boundary; split(b'\n') on raw bytes never
            // splits on U+2028/U+2029, satisfying the protocol requirement.
            match serde_json::from_slice::<Value>(bytes) {
                Ok(record) => {
                    let _ = app_for_out.emit(PI_EVENT, &record);
                }
                Err(_) => {
                    // Not JSON: log it rather than crash the reader.
                    eprintln!(
                        "pi-desk: non-JSON stdout record: {}",
                        String::from_utf8_lossy(bytes)
                    );
                }
            }
        }
        // Reader ended: process is gone.
        let exited_cwd = proc_for_out.cwd();
        *proc_for_out.child.lock().unwrap() = None;
        *proc_for_out.stdin.lock().unwrap() = None;
        *proc_for_out.cwd.lock().unwrap() = None;
        let _ = app_for_out.emit(PI_EXITED, serde_json::json!({ "cwd": exited_cwd }));
        emit_state(&app_for_out, &proc_for_out, PiState::Stopped);
    });

    *process.stdin.lock().unwrap() = Some(stdin);
    *process.child.lock().unwrap() = Some(child);

    emit_state(
        &app,
        &process,
        PiState::Running {
            cwd: cwd.display().to_string(),
        },
    );
    Ok(())
}

/// Write one JSON record (already LF-terminated by us) to pi's stdin.
pub fn send(process: &SharedProcess, record: &Value) -> Result<(), String> {
    let mut guard = process.stdin.lock().unwrap();
    let Some(stdin) = guard.as_mut() else {
        return Err("pi 进程未运行".to_string());
    };
    let mut line = serde_json::to_vec(record).map_err(|e| e.to_string())?;
    line.push(b'\n');
    stdin
        .write_all(&line)
        .and_then(|_| stdin.flush())
        .map_err(|e| format!("写入 pi 标准输入失败：{e}"))
}

/// Graceful shutdown: close stdin, wait briefly, then kill.
pub fn stop(process: &SharedProcess, app: &AppHandle) {
    // Closing stdin requests orderly shutdown.
    *process.stdin.lock().unwrap() = None;

    let mut child_guard = process.child.lock().unwrap();
    if let Some(mut child) = child_guard.take() {
        // Give it a moment to exit on its own.
        for _ in 0..20 {
            match child.try_wait() {
                Ok(Some(_)) | Err(_) => break,
                Ok(None) => std::thread::sleep(Duration::from_millis(50)),
            }
        }
        let _ = child.kill();
        let _ = child.wait();
    }
    *process.cwd.lock().unwrap() = None;
    emit_state(app, process, PiState::Stopped);
}

fn emit_state(app: &AppHandle, _process: &SharedProcess, state: PiState) {
    let _ = app.emit(PI_STATE, &state);
}

pub fn stderr_log_path(app: &AppHandle) -> PathBuf {
    app.path()
        .app_log_dir()
        .map(|p| p.join("pi-rpc-stderr.log"))
        .unwrap_or_else(|_| std::env::temp_dir().join("pi-desk-pi-rpc-stderr.log"))
}
