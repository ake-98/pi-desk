use std::path::PathBuf;
use std::sync::Arc;

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Manager, State};

use crate::pi_process::{self, PiProcess, PiState, SharedProcess};
use crate::session_scan::{self, SessionSummary};
use crate::settings::{self, AppSettings};

pub struct ManagedState {
    pub process: SharedProcess,
}

impl ManagedState {
    pub fn new() -> Self {
        Self {
            process: Arc::new(PiProcess::new()),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartResult {
    pub ok: bool,
    pub error: Option<String>,
}

#[tauri::command]
pub fn pi_start(app: AppHandle, state: State<'_, ManagedState>, cwd: String) -> StartResult {
    match pi_process::spawn(app, state.process.clone(), PathBuf::from(&cwd)) {
        Ok(()) => StartResult {
            ok: true,
            error: None,
        },
        Err(e) => StartResult {
            ok: false,
            error: Some(e),
        },
    }
}

#[tauri::command]
pub fn pi_stop(app: AppHandle, state: State<'_, ManagedState>) {
    pi_process::stop(&state.process, &app);
}

/// Forward one RPC command record to pi's stdin.
#[tauri::command]
pub fn pi_command(state: State<'_, ManagedState>, record: Value) -> Result<(), String> {
    pi_process::send(&state.process, &record)
}

#[tauri::command]
pub fn pi_state(state: State<'_, ManagedState>) -> PiState {
    let process = &state.process;
    match process.cwd() {
        Some(cwd) if process.is_running() => PiState::Running { cwd },
        Some(cwd) => PiState::Starting { cwd },
        None => PiState::Stopped,
    }
}

#[tauri::command]
pub fn list_sessions() -> Result<Vec<SessionSummary>, String> {
    session_scan::list_sessions()
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> AppSettings {
    settings::load(&app)
}

#[tauri::command]
pub fn set_settings(app: AppHandle, settings: AppSettings) -> Result<(), String> {
    settings::save(&app, &settings)
}

/// Locate the pi binary (for the settings UI to validate the path).
#[tauri::command]
pub fn locate_pi(app: AppHandle, explicit: Option<String>) -> Result<String, String> {
    let path = pi_process::locate_pi(
        explicit
            .as_deref()
            .or(settings::load(&app).pi_path.as_deref()),
    )?;
    Ok(path.display().to_string())
}

/// Current git branch of `cwd` (walks up to find the repo root).
/// Returns None when there is no git repository or HEAD is unreadable.
#[tauri::command]
pub fn git_branch(cwd: String) -> Option<String> {
    let mut dir = std::path::PathBuf::from(&cwd);
    loop {
        let git_path = dir.join(".git");
        if git_path.exists() {
            // Regular repo: .git/HEAD contains "ref: refs/heads/<branch>".
            if let Ok(content) = std::fs::read_to_string(git_path.join("HEAD")) {
                let content = content.trim();
                if let Some(branch) = content.strip_prefix("ref: refs/heads/") {
                    return Some(branch.to_string());
                }
                // Detached HEAD: show a short sha.
                return Some(content.chars().take(7).collect());
            }
            // Worktree/link-style .git file or unreadable HEAD: no branch name.
            return None;
        }
        if !dir.pop() {
            return None;
        }
    }
}

/// Sync the native window chrome (titlebar etc.) with the UI theme.
#[tauri::command]
pub fn set_window_theme(app: AppHandle, theme: String) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    match theme.as_str() {
        "light" => {
            let _ = window.set_theme(Some(tauri::Theme::Light));
        }
        "dark" => {
            let _ = window.set_theme(Some(tauri::Theme::Dark));
        }
        // "system": reset to follow the OS setting.
        _ => {
            let _ = window.set_theme(None);
        }
    }
}
