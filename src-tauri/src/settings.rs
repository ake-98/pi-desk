use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const STORE_FILE: &str = "pi-desk-settings.json";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppSettings {
    /// Explicit path to the pi binary. Empty/None = auto-detect.
    pub pi_path: Option<String>,
    /// Default working directory to open at startup.
    pub default_cwd: Option<String>,
    /// UI theme: "light" | "dark" | "system".
    pub theme: Option<String>,
    /// Previously opened workspaces (most recent first, capped by the caller).
    pub recent_workspaces: Option<Vec<String>>,
}

fn store_path(app: &AppHandle) -> std::path::PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir())
        .join(STORE_FILE)
}

/// Load settings from the app data directory. Missing file = defaults.
pub fn load(app: &AppHandle) -> AppSettings {
    let path = store_path(app);
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

/// Persist settings (atomic-ish: write temp then rename).
pub fn save(app: &AppHandle, settings: &AppSettings) -> Result<(), String> {
    let path = store_path(app);
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_vec_pretty(settings).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, json).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(())
}
