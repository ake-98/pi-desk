use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

use serde::Serialize;

/// One row for the session list UI.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub path: String,
    pub file_name: String,
    pub session_id: Option<String>,
    pub cwd: Option<String>,
    /// ISO-8601 timestamp from the session header.
    pub timestamp: Option<String>,
    /// Display name from the newest `session_info` entry, if any.
    pub name: Option<String>,
    /// Preview title from the first user message (like common chat apps).
    pub title: Option<String>,
    pub message_count: usize,
    pub modified_ms: u128,
}

const MAX_NAME_SCAN_BYTES: u64 = 4 * 1024 * 1024;

/// Scan `~/.pi/agent/sessions/<encoded-cwd>/*.jsonl` and summarize each file.
/// Parsing is line-oriented string matching only (no per-line JSON parse)
/// to keep large sessions cheap.
pub fn list_sessions() -> Result<Vec<SessionSummary>, String> {
    let home = std::env::var("HOME").map_err(|_| "HOME not set".to_string())?;
    let root = PathBuf::from(home).join(".pi/agent/sessions");
    let mut out = Vec::new();

    let groups =
        std::fs::read_dir(&root).map_err(|e| format!("cannot read {}: {e}", root.display()))?;
    for group in groups.flatten() {
        if !group.path().is_dir() {
            continue;
        }
        let files = match std::fs::read_dir(group.path()) {
            Ok(f) => f,
            Err(_) => continue,
        };
        for file in files.flatten() {
            let path = file.path();
            if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                continue;
            }
            if let Some(summary) = summarize(&path) {
                out.push(summary);
            }
        }
    }

    out.sort_by(|a, b| b.modified_ms.cmp(&a.modified_ms));
    Ok(out)
}

fn summarize(path: &Path) -> Option<SessionSummary> {
    let file = std::fs::File::open(path).ok()?;
    let meta = file.metadata().ok()?;
    let modified_ms = meta
        .modified()
        .ok()?
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?
        .as_millis();

    let mut summary = SessionSummary {
        path: path.display().to_string(),
        file_name: path.file_name()?.to_string_lossy().to_string(),
        session_id: None,
        cwd: None,
        timestamp: None,
        name: None,
        title: None,
        message_count: 0,
        modified_ms,
    };

    let reader = BufReader::new(file);
    let mut scanned_name = 0u64;
    for line in reader.lines().map_while(Result::ok) {
        let line_bytes = line.len() as u64;
        scanned_name += line_bytes;

        if summary.session_id.is_none()
            && line.contains("\"type\":\"session\"")
            && let Ok(v) = serde_json::from_str::<serde_json::Value>(&line)
            && v["type"] == "session"
        {
            summary.session_id = v["id"].as_str().map(str::to_string);
            summary.cwd = v["cwd"].as_str().map(str::to_string);
            summary.timestamp = v["timestamp"].as_str().map(str::to_string);
            continue;
        }

        if summary.name.is_none()
            && scanned_name <= MAX_NAME_SCAN_BYTES
            && line.contains("\"type\":\"session_info\"")
            && let Ok(v) = serde_json::from_str::<serde_json::Value>(&line)
            && v["type"] == "session_info"
        {
            // Keep the newest: later entries overwrite earlier ones.
            summary.name = v["name"].as_str().map(str::to_string);
        }

        if summary.title.is_none()
            && line.contains("\"type\":\"message\"")
            && line.contains("\"role\":\"user\"")
            && let Ok(v) = serde_json::from_str::<serde_json::Value>(&line)
            && v["type"] == "message"
            && v["message"]["role"] == "user"
        {
            summary.title = extract_user_preview(&v["message"]["content"]);
        }

        if line.contains("\"type\":\"message\"") {
            summary.message_count += 1;
        }
    }

    Some(summary)
}

/// Collapse a user message's content into a short one-line preview.
fn extract_user_preview(content: &serde_json::Value) -> Option<String> {
    let text = match content {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Array(blocks) => {
            let mut parts = Vec::new();
            for block in blocks {
                if block["type"] == "text"
                    && let Some(t) = block["text"].as_str()
                {
                    parts.push(t.to_string());
                }
            }
            parts.join(" ")
        }
        _ => return None,
    };
    let collapsed: String = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if collapsed.is_empty() {
        return None;
    }
    let truncated: String = collapsed.chars().take(80).collect();
    let suffix = if collapsed.chars().count() > 80 {
        "…"
    } else {
        ""
    };
    Some(format!("{truncated}{suffix}"))
}
