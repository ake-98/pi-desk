mod commands;
mod pi_process;
mod session_scan;
mod settings;

use commands::ManagedState;
use tauri::Manager;

// Registered below: pi bridge, sessions, settings, theme, git helpers.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(ManagedState::new())
        .invoke_handler(tauri::generate_handler![
            commands::pi_start,
            commands::pi_stop,
            commands::pi_command,
            commands::pi_state,
            commands::list_sessions,
            commands::get_settings,
            commands::set_settings,
            commands::locate_pi,
            commands::set_window_theme,
            commands::git_branch,
        ])
        .on_window_event(|window, event| {
            // Graceful pi shutdown when the window closes.
            if let tauri::WindowEvent::Destroyed = event {
                let app = window.app_handle().clone();
                let state: tauri::State<ManagedState> = app.state();
                pi_process::stop(&state.process, &app);
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
