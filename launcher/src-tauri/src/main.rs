mod commands;
mod identity;
mod sidecar;

use std::sync::Arc;

fn main() {
  tauri::Builder::default()
    .plugin(tauri_plugin_log::Builder::default().build())
    .plugin(tauri_plugin_shell::init())
    .manage(Arc::new(sidecar::ProcState::default()))
    .invoke_handler(tauri::generate_handler![
      commands::get_identity,
      commands::start_node,
      commands::stop_node,
      commands::start_miner,
      commands::stop_miner,
      commands::get_status,
      commands::send_heartbeat,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
