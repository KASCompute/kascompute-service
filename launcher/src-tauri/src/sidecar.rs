use serde::Serialize;
use std::{
  collections::HashMap,
  io::{BufRead, BufReader},
  process::{Child, Command as StdCommand, Stdio},
  sync::{
    atomic::AtomicBool,
    Mutex,
  },
};
use tauri::{AppHandle, Emitter};
use tokio::task::JoinHandle;

#[derive(Default)]
pub struct ProcState {
  pub procs: Mutex<HashMap<String, Child>>,

  // Miner job-loop (Launcher-internal)
  pub miner_loop_on: AtomicBool,
  pub miner_loop_handle: Mutex<Option<JoinHandle<()>>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct LogPayload {
  pub target: String, // "node" | "miner"
  pub stream: String, // "stdout" | "stderr" | "event"
  pub line: String,
}

pub fn is_running(state: &ProcState, name: &str) -> bool {
  let mut map = match state.procs.lock() {
    Ok(m) => m,
    Err(_) => return false,
  };

  if let Some(child) = map.get_mut(name) {
    match child.try_wait() {
      Ok(Some(_)) => {
        map.remove(name);
        false
      }
      Ok(None) => true,
      Err(_) => {
        map.remove(name);
        false
      }
    }
  } else {
    false
  }
}

pub fn pid_of(state: &ProcState, name: &str) -> Option<u32> {
  let mut map = state.procs.lock().ok()?;
  let child = map.get_mut(name)?;

  match child.try_wait() {
    Ok(Some(_)) => {
      map.remove(name);
      None
    }
    Ok(None) => Some(child.id()),
    Err(_) => {
      map.remove(name);
      None
    }
  }
}

pub async fn spawn_sidecar(
  app: AppHandle,
  state: &ProcState,
  name: &str,
  program: &str,
  args: Vec<String>,
) -> Result<(), String> {
  if is_running(state, name) {
    return Ok(());
  }

  let mut cmd = StdCommand::new(program);
  cmd.args(args);
  cmd.stdin(Stdio::null());
  cmd.stdout(Stdio::piped());
  cmd.stderr(Stdio::piped());

  let mut child = cmd.spawn().map_err(|e| format!("spawn failed: {e}"))?;

  let stdout = child.stdout.take();
  let stderr = child.stderr.take();

  {
    let mut map = state.procs.lock().map_err(|_| "lock failed".to_string())?;
    map.insert(name.to_string(), child);
  }

  let _ = app.emit(
    "sidecar:event",
    LogPayload {
      target: name.to_string(),
      stream: "event".into(),
      line: "spawned".into(),
    },
  );

  if let Some(out) = stdout {
    let app_clone = app.clone();
    let target = name.to_string();
    std::thread::spawn(move || {
      let reader = BufReader::new(out);
      for line in reader.lines().flatten() {
        let _ = app_clone.emit(
          "sidecar:stdout",
          LogPayload {
            target: target.clone(),
            stream: "stdout".into(),
            line,
          },
        );
      }
    });
  }

  if let Some(err) = stderr {
    let app_clone = app.clone();
    let target = name.to_string();
    std::thread::spawn(move || {
      let reader = BufReader::new(err);
      for line in reader.lines().flatten() {
        let _ = app_clone.emit(
          "sidecar:stderr",
          LogPayload {
            target: target.clone(),
            stream: "stderr".into(),
            line,
          },
        );
      }
    });
  }

  Ok(())
}

pub async fn kill_sidecar(app: AppHandle, state: &ProcState, name: &str) -> Result<(), String> {
  let child_opt = {
    let mut map = state.procs.lock().map_err(|_| "lock failed".to_string())?;
    map.remove(name)
  };

  if let Some(mut child) = child_opt {
    let _ = child.kill();
    let _ = child.try_wait();

    let _ = app.emit(
      "sidecar:event",
      LogPayload {
        target: name.to_string(),
        stream: "event".into(),
        line: "killed".into(),
      },
    );
  } else {
    let _ = app.emit(
      "sidecar:event",
      LogPayload {
        target: name.to_string(),
        stream: "event".into(),
        line: "not running".into(),
      },
    );
  }

  Ok(())
}
