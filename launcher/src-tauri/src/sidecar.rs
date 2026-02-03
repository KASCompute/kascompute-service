use serde::Serialize;
use std::{
  collections::HashMap,
  io::{BufRead, BufReader},
  process::{Child, Command as StdCommand, Stdio},
  sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
  },
  time::{Duration, Instant},
};

// ✅ NEW: persist miner_id file
use std::fs;

use tauri::{path::BaseDirectory, AppHandle, Emitter, Manager};
use tokio::task::JoinHandle;

// ✅ unified UI logs
use crate::logs;

// ✅ Windows: prevent black console window for sidecars
#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Clone)]
pub struct ServiceConfig {
  pub program: String,
  pub args: Vec<String>,
}

#[derive(Default)]
pub struct ProcState {
  pub procs: Mutex<HashMap<String, Child>>,
  pub miner_loop_on: AtomicBool,
  pub miner_loop_handle: Mutex<Option<JoinHandle<()>>>,

  // ✅ restart supervisor
  pub desired: Mutex<HashMap<String, bool>>,
  pub configs: Mutex<HashMap<String, ServiceConfig>>,
  pub supervisor_on: AtomicBool,
  pub supervisor_handle: Mutex<Option<JoinHandle<()>>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct LogPayload {
  pub target: String,
  pub stream: String,
  pub line: String,
}

// ============================================================================
// ✅ Miner proof UI event (parsed from sidecar stdout line: "MINER_PROOF ...")
// Keeps frontend Proof Stats + Recent Proofs working.
// ============================================================================

#[derive(Debug, Clone, Serialize)]
struct MinerProofUi {
  node_id: String,
  miner_id: String,
  job_id: u64,
  work_units: u64,
  elapsed_ms: u64,
  workload_mode: String,
  client_version: String,
  ts: u64,
  proof_hash_hex: String,
  signature_hex: String,
  public_key_hex: String,
}

fn parse_miner_proof_line(line: &str) -> Option<MinerProofUi> {
  let line = line.trim();
  if !line.starts_with("MINER_PROOF ") {
    return None;
  }

  // tokens: key=value
  let mut node_id: Option<String> = None;
  let mut miner_id: Option<String> = None; 
  let mut job_id: Option<u64> = None;
  let mut work_units: Option<u64> = None;
  let mut elapsed_ms: Option<u64> = None;
  let mut ts: Option<u64> = None;
  let mut hash: Option<String> = None;
  let mut sig: Option<String> = None;
  let mut pubkey: Option<String> = None;

  for tok in line.split_whitespace().skip(1) {
    // ✅ be tolerant: ignore junk tokens
    let Some((k, v)) = tok.split_once('=') else { continue; };

    match k {
      "node_id" => node_id = Some(v.to_string()),
      "miner_id" => miner_id = Some(v.to_string()), 
      "job" => job_id = v.parse().ok(),
      "wu" => work_units = v.parse().ok(),
      "elapsed_ms" => elapsed_ms = v.parse().ok(),
      "ts" => ts = v.parse().ok(),
      "hash" => hash = Some(v.to_string()),
      "sig" => sig = Some(v.to_string()),
      "pubkey" => pubkey = Some(v.to_string()),
      _ => {}
    }
  }

  let node_id = node_id?;
  // ✅ fallback: if miner didn't provide miner_id, treat miner==node (legacy safe)
  let miner_id = miner_id.unwrap_or_else(|| node_id.clone());

  Some(MinerProofUi {
    node_id,
    miner_id,
    job_id: job_id?,
    work_units: work_units?,
    elapsed_ms: elapsed_ms?,
    workload_mode: "sim".to_string(),
    client_version: format!("launcher-dev/{}", env!("CARGO_PKG_VERSION")),
    ts: ts?,
    proof_hash_hex: hash?,
    signature_hex: sig?,
    public_key_hex: pubkey.unwrap_or_else(|| "—".into()),
  })
}

// ============================================================================
// ✅ Miner ID persistence (per installation)
// ENV exported to miner sidecar: KASCOMPUTE_MINER_ID
// ============================================================================

fn load_or_create_miner_id(app: &AppHandle) -> String {
  // store stable in AppLocalData (survives restarts)
  let path = app
    .path()
    .resolve("miner_id.txt", BaseDirectory::AppLocalData)
    .unwrap_or_else(|_| std::path::PathBuf::from("miner_id.txt"));

  if let Ok(s) = fs::read_to_string(&path) {
    let s = s.trim().to_string();
    if !s.is_empty() {
      return s;
    }
  }

  let id = format!("kc_miner_{:016x}", rand_u64());

  if let Some(parent) = path.parent() {
    let _ = fs::create_dir_all(parent);
  }
  let _ = fs::write(&path, &id);

  id
}

// small rng without extra crates
fn rand_u64() -> u64 {
  use std::time::{SystemTime, UNIX_EPOCH};
  let now = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .unwrap_or_default()
    .as_nanos() as u64;

  // xorshift-ish
  let mut x = now ^ (now << 13);
  x ^= x >> 7;
  x ^= x << 17;
  x
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

// desired + config
pub async fn set_desired(state: &ProcState, name: &str, v: bool) {
  if let Ok(mut d) = state.desired.lock() {
    d.insert(name.to_string(), v);
  }
}

pub async fn set_config(state: &ProcState, name: &str, program: &str, args: &[String]) {
  if let Ok(mut c) = state.configs.lock() {
    c.insert(
      name.to_string(),
      ServiceConfig {
        program: program.to_string(),
        args: args.to_vec(),
      },
    );
  }
}

fn get_desired(state: &ProcState, name: &str) -> bool {
  state
    .desired
    .lock()
    .ok()
    .and_then(|d| d.get(name).cloned())
    .unwrap_or(false)
}

fn get_config(state: &ProcState, name: &str) -> Option<ServiceConfig> {
  state.configs.lock().ok().and_then(|c| c.get(name).cloned())
}

fn ensure_supervisor(app: AppHandle, state: std::sync::Arc<ProcState>) {
  let already = state
    .supervisor_handle
    .lock()
    .ok()
    .and_then(|g| g.as_ref().map(|h| !h.is_finished()))
    .unwrap_or(false);

  if already {
    return;
  }

  state.supervisor_on.store(true, Ordering::Relaxed);

  let app2 = app.clone();
  let state2 = state.clone();

  let h = tokio::spawn(async move {
    let mut last_restart: HashMap<String, Instant> = HashMap::new();
    let mut crash_window: HashMap<String, (Instant, u32)> = HashMap::new();

    // capture unified log state once for the supervisor task
    let ui_logs = app2.state::<logs::LogState>().inner().clone();

    loop {
      if !state2.supervisor_on.load(Ordering::Relaxed) {
        break;
      }

      for name in ["node", "miner"] {
        let desired = get_desired(state2.as_ref(), name);

        // cleanup exited children & mark uptime stopped
        let exited = {
          let mut map = match state2.procs.lock() {
            Ok(m) => m,
            Err(_) => continue,
          };

          if let Some(child) = map.get_mut(name) {
            match child.try_wait() {
              Ok(Some(status)) => {
                map.remove(name);
                Some(status.success())
              }
              Ok(None) => None,
              Err(_) => {
                map.remove(name);
                Some(false)
              }
            }
          } else {
            None
          }
        };

        if let Some(success) = exited {
          let crashed = !success;
          crate::runtime_state::mark_stopped(&app2, name, crashed);

          let line = if crashed {
            "process exited (crash)"
          } else {
            "process exited"
          }
          .to_string();

          let _ = app2.emit(
            "sidecar:event",
            LogPayload {
              target: name.to_string(),
              stream: "event".into(),
              line: line.clone(),
            },
          );

          logs::push_ui(&app2, &ui_logs, name, "event", line);
        }

        if desired && !is_running(state2.as_ref(), name) {
          // cooldown
          let now = Instant::now();
          let lr = last_restart
            .get(name)
            .cloned()
            .unwrap_or_else(|| now - Duration::from_secs(60));

          if now.duration_since(lr) < Duration::from_millis(900) {
            continue;
          }

          // restart limit (8 per 60s)
          let (win_start, count) = crash_window.get(name).cloned().unwrap_or((now, 0));
          let (start2, count2) = if now.duration_since(win_start) > Duration::from_secs(60) {
            (now, 0)
          } else {
            (win_start, count)
          };

          if count2 >= 8 {
            // disable desired to prevent loops
            if let Ok(mut d) = state2.desired.lock() {
              d.insert(name.to_string(), false);
            }

            let line = "restart limit hit → stopping service".to_string();

            let _ = app2.emit(
              "sidecar:event",
              LogPayload {
                target: name.to_string(),
                stream: "event".into(),
                line: line.clone(),
              },
            );

            logs::push_ui(&app2, &ui_logs, name, "event", line);
            continue;
          }

          if let Some(cfg) = get_config(state2.as_ref(), name) {
            crash_window.insert(name.to_string(), (start2, count2 + 1));
            last_restart.insert(name.to_string(), now);

            let line = "auto-restart...".to_string();

            let _ = app2.emit(
              "sidecar:event",
              LogPayload {
                target: name.to_string(),
                stream: "event".into(),
                line: line.clone(),
              },
            );

            logs::push_ui(&app2, &ui_logs, name, "event", line);

            // ✅ FIX: clone args so we don't move out of cfg
            let _ = spawn_sidecar(app2.clone(), state2.as_ref(), name, &cfg.program, cfg.args.clone()).await;
          }
        }
      }

      tokio::time::sleep(Duration::from_millis(700)).await;
    }
  });

  if let Ok(mut g) = state.supervisor_handle.lock() {
    *g = Some(h);
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

  // unified log state for this function (clone for threads)
  let ui_logs = app.state::<logs::LogState>().inner().clone();

  // Installer-safe: resolve from app resources
  let program_path = app
    .path()
    .resolve(program, BaseDirectory::Resource)
    .map_err(|e| format!("resolve resource failed: {e}"))?;

  if !program_path.exists() {
    return Err(format!("sidecar not found at: {}", program_path.display()));
  }

  {
    let line = format!("resolved path: {}", program_path.display());

    let _ = app.emit(
      "sidecar:event",
      LogPayload {
        target: name.to_string(),
        stream: "event".into(),
        line: line.clone(),
      },
    );

    logs::push_ui(&app, &ui_logs, name, "event", line);
  }

  let mut cmd = StdCommand::new(program_path);

  // Windows: do NOT spawn a black console window
  #[cfg(windows)]
  cmd.creation_flags(CREATE_NO_WINDOW);

  cmd.args(args.clone());
  cmd.stdin(Stdio::null());
  cmd.stdout(Stdio::piped());
  cmd.stderr(Stdio::piped());

  // Sidecar API (PRO)
  let api = std::env::var("KASCOMPUTE_API")
    .ok()
    .filter(|s| !s.trim().is_empty())
    .or_else(|| std::env::var("VITE_SIDECAR_API").ok().filter(|s| !s.trim().is_empty()))
    .or_else(|| std::env::var("VITE_API_BASE").ok().filter(|s| !s.trim().is_empty()))
    .unwrap_or_else(|| "https://kascompute-protocol-v1.onrender.com".to_string());

  cmd.env("KASCOMPUTE_API", api.clone());

  // ✅ NEW: Miner-ID nur für miner sidecar
  if name == "miner" {
    let miner_id = load_or_create_miner_id(&app);
    cmd.env("KASCOMPUTE_MINER_ID", miner_id.clone());

    let line = format!("miner_id for sidecar: {}", miner_id);
    let _ = app.emit(
      "sidecar:event",
      LogPayload {
        target: name.to_string(),
        stream: "event".into(),
        line: line.clone(),
      },
    );
    logs::push_ui(&app, &ui_logs, name, "event", line);
  }

  // Optional: make sidecar logs readable
  cmd.env(
    "RUST_LOG",
    std::env::var("RUST_LOG").unwrap_or_else(|_| "info".to_string()),
  );

  {
    let line = format!("api for sidecar: {}", api);

    let _ = app.emit(
      "sidecar:event",
      LogPayload {
        target: name.to_string(),
        stream: "event".into(),
        line: line.clone(),
      },
    );

    logs::push_ui(&app, &ui_logs, name, "event", line);
  }

  let mut child = cmd.spawn().map_err(|e| format!("spawn failed: {e}"))?;

  let stdout = child.stdout.take();
  let stderr = child.stderr.take();

  {
    let mut map = state.procs.lock().map_err(|_| "lock failed".to_string())?;
    map.insert(name.to_string(), child);
  }

  // uptime start (persisted)
  crate::runtime_state::mark_started(&app, name);

  {
    let line = format!("spawned: {}", program);

    let _ = app.emit(
      "sidecar:event",
      LogPayload {
        target: name.to_string(),
        stream: "event".into(),
        line: line.clone(),
      },
    );

    logs::push_ui(&app, &ui_logs, name, "event", line);
  }

  if let Some(out) = stdout {
    let app_clone = app.clone();
    let target = name.to_string();
    let ui_logs_thread = ui_logs.clone();

    std::thread::spawn(move || {
      let reader = BufReader::new(out);
      for line in reader.lines().flatten() {
        // ✅ parse miner proof line and emit structured UI event
        if target == "miner" {
          if let Some(ui) = parse_miner_proof_line(&line) {
            let _ = app_clone.emit("miner:proof", ui);
          }
        }

        let payload = LogPayload {
          target: target.clone(),
          stream: "stdout".into(),
          line: line.clone(),
        };

        let _ = app_clone.emit("sidecar:stdout", payload.clone());
        logs::push_ui(&app_clone, &ui_logs_thread, &target, "stdout", payload.line);
      }
    });
  }

  if let Some(err) = stderr {
    let app_clone = app.clone();
    let target = name.to_string();
    let ui_logs_thread = ui_logs.clone();

    std::thread::spawn(move || {
      let reader = BufReader::new(err);
      for line in reader.lines().flatten() {
        let payload = LogPayload {
          target: target.clone(),
          stream: "stderr".into(),
          line: line.clone(),
        };

        let _ = app_clone.emit("sidecar:stderr", payload.clone());
        logs::push_ui(&app_clone, &ui_logs_thread, &target, "stderr", payload.line);
      }
    });
  }

  Ok(())
}

// managed wrapper (stores config + enables auto-restart)
pub async fn spawn_sidecar_managed(
  app: AppHandle,
  state_arc: std::sync::Arc<ProcState>,
  name: &str,
  program: &str,
  args: Vec<String>,
) -> Result<(), String> {
  set_desired(state_arc.as_ref(), name, true).await;
  set_config(state_arc.as_ref(), name, program, &args).await;
  ensure_supervisor(app.clone(), state_arc.clone());
  spawn_sidecar(app, state_arc.as_ref(), name, program, args).await
}

pub async fn stop_managed(app: AppHandle, state: &ProcState, name: &str) -> Result<(), String> {
  set_desired(state, name, false).await;
  kill_sidecar(app, state, name).await
}

pub async fn kill_sidecar(app: AppHandle, state: &ProcState, name: &str) -> Result<(), String> {
  let child_opt = {
    let mut map = state.procs.lock().map_err(|_| "lock failed".to_string())?;
    map.remove(name)
  };

  if let Some(mut child) = child_opt {
    let _ = child.kill();
    let _ = child.try_wait();

    crate::runtime_state::mark_stopped(&app, name, false);

    let line = "killed".to_string();

    let _ = app.emit(
      "sidecar:event",
      LogPayload {
        target: name.to_string(),
        stream: "event".into(),
        line: line.clone(),
      },
    );

    let ui_logs = app.state::<logs::LogState>().inner().clone();
    logs::push_ui(&app, &ui_logs, name, "event", line);
  } else {
    let line = "not running".to_string();

    let _ = app.emit(
      "sidecar:event",
      LogPayload {
        target: name.to_string(),
        stream: "event".into(),
        line: line.clone(),
      },
    );

    let ui_logs = app.state::<logs::LogState>().inner().clone();
    logs::push_ui(&app, &ui_logs, name, "event", line);
  }

  Ok(())
}
