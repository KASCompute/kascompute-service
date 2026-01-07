use serde::{Deserialize, Serialize};
use std::{
  collections::HashMap,
  fs,
  path::PathBuf,
  time::{SystemTime, UNIX_EPOCH},
};
use tauri::AppHandle;
use tauri::Manager;


fn now_ms() -> i64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .unwrap()
    .as_millis() as i64
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ServiceUptime {
  pub total_ms: i64,
  pub running_since_ms: Option<i64>,
  pub last_stop_ms: Option<i64>,
  pub crash_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RuntimeState {
  pub services: HashMap<String, ServiceUptime>,
}

impl RuntimeState {
  pub fn service_mut(&mut self, key: &str) -> &mut ServiceUptime {
    self.services.entry(key.to_string()).or_default()
  }
}

pub fn state_path(app: &AppHandle) -> PathBuf {
  let dir = app.path().app_data_dir().expect("app_data_dir missing");
  let _ = fs::create_dir_all(&dir);
  dir.join("runtime_state.json")
}

pub fn load_state(app: &AppHandle) -> RuntimeState {
  let p = state_path(app);
  if let Ok(bytes) = fs::read(p) {
    if let Ok(s) = serde_json::from_slice::<RuntimeState>(&bytes) {
      return s;
    }
  }
  RuntimeState::default()
}

pub fn save_state(app: &AppHandle, st: &RuntimeState) {
  let p = state_path(app);
  if let Ok(json) = serde_json::to_vec_pretty(st) {
    let _ = fs::write(p, json);
  }
}

pub fn mark_started(app: &AppHandle, key: &str) {
  let mut st = load_state(app);
  let s = st.service_mut(key);
  s.running_since_ms = Some(now_ms());
  save_state(app, &st);
}

pub fn mark_stopped(app: &AppHandle, key: &str, crashed: bool) {
  let mut st = load_state(app);
  let s = st.service_mut(key);

  if let Some(start) = s.running_since_ms.take() {
    let delta = now_ms().saturating_sub(start).max(0);
    s.total_ms += delta;
  }

  s.last_stop_ms = Some(now_ms());
  if crashed {
    s.crash_count = s.crash_count.saturating_add(1);
  }

  save_state(app, &st);
}

pub fn get_totals_conditional(
  app: &AppHandle,
  key: &str,
  is_running: bool,
) -> (i64, u32) {
  let st = load_state(app);
  let s = st.services.get(key).cloned().unwrap_or_default();

  let mut total = s.total_ms;

  // ✅ nur live hochrechnen, wenn Prozess wirklich läuft
  if is_running {
    if let Some(start) = s.running_since_ms {
      total += now_ms().saturating_sub(start).max(0);
    }
  }

  (total, s.crash_count)
}



pub fn format_uptime_ms(ms: i64) -> String {
  let mut secs = (ms.max(0) / 1000) as i64;
  let days = secs / 86400;
  secs %= 86400;
  let hours = secs / 3600;
  secs %= 3600;
  let mins = secs / 60;
  secs %= 60;

  if days > 0 {
    return format!("{}d {}h", days, hours);
  }
  if hours > 0 {
    return format!("{}h {}m", hours, mins);
  }
  if mins > 0 {
    return format!("{}m {}s", mins, secs);
  }
  format!("{}s", secs)
}
