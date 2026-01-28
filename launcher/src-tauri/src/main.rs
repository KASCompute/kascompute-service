mod commands;
mod identity;
mod sidecar;
mod runtime_state;
mod logs;

use std::sync::Arc;
use tauri::Manager;

fn main() {
  tauri::Builder::default()
    //  Terminal
    .plugin(
      tauri_plugin_log::Builder::default()
        .level(log::LevelFilter::Warn)
        .build()
    )
    .plugin(tauri_plugin_shell::init())
    .manage(Arc::new(sidecar::ProcState::default()))
    // UI log ringbuffer (für kc://log_line)
    .manage(logs::LogState::new(800))
    //  reconcile persisted uptime state on app start
    .setup(|app| {
      let handle = app.handle().clone();
      let state = app.state::<Arc<sidecar::ProcState>>().clone();

      // If nothing is actually running, ensure persisted uptime is not shown as running.
      if !sidecar::is_running(state.as_ref(), "node") {
        runtime_state::mark_stopped(&handle, "node", false);
      }
      if !sidecar::is_running(state.as_ref(), "miner") {
        runtime_state::mark_stopped(&handle, "miner", false);
      }

      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      // existing commands (unchanged)
      commands::get_identity,
      commands::start_node,
      commands::stop_node,
      commands::start_miner,
      commands::stop_miner,
      commands::get_status,
      commands::send_heartbeat,
      commands::get_metrics,

      // UI log commands
      logs::get_logs,
      logs::clear_logs,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
