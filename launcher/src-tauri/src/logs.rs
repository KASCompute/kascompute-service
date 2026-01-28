use serde::Serialize;
use std::{
  collections::VecDeque,
  sync::{Arc, Mutex},
  time::{SystemTime, UNIX_EPOCH},
};

use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize)]
pub struct UiLogLine {
  pub ts: u64,
  pub target: String, // "node" | "miner" | "launcher" | ...
  pub stream: String, // "stdout" | "stderr" | "event" | "info"
  pub line: String,
}

#[derive(Clone)]
pub struct LogState {
  buf: Arc<Mutex<VecDeque<UiLogLine>>>,
  capacity: usize,
}

impl LogState {
  pub fn new(capacity: usize) -> Self {
    Self {
      buf: Arc::new(Mutex::new(VecDeque::with_capacity(capacity))),
      capacity,
    }
  }

  pub fn push(&self, item: UiLogLine) {
    let mut g = self.buf.lock().unwrap();
    if g.len() >= self.capacity {
      g.pop_front();
    }
    g.push_back(item);
  }

  pub fn snapshot(&self, max: usize) -> Vec<UiLogLine> {
    let g = self.buf.lock().unwrap();
    let len = g.len();
    let start = len.saturating_sub(max);
    g.iter().skip(start).cloned().collect()
  }

  pub fn clear(&self) {
    self.buf.lock().unwrap().clear();
  }
}

fn now_ts() -> u64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_secs())
    .unwrap_or(0)
}

/// Push into ringbuffer + emit unified UI event
pub fn push_ui(app: &AppHandle, state: &LogState, target: &str, stream: &str, line: String) {
  let item = UiLogLine {
    ts: now_ts(),
    target: target.to_string(),
    stream: stream.to_string(),
    line,
  };

  state.push(item.clone());

  // Single unified UI event
  let _ = app.emit("kc://log_line", item);
}

#[tauri::command]
pub fn get_logs(state: tauri::State<LogState>, max: usize) -> Vec<UiLogLine> {
  state.snapshot(max)
}

#[tauri::command]
pub fn clear_logs(state: tauri::State<LogState>) {
  state.clear();
}
