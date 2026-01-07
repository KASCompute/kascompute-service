use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{sync::Arc, time::Instant};
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, State};
use tokio::time::{sleep, Duration};

use crate::identity::load_or_create_identity;
use crate::sidecar::{self, ProcState};

#[derive(Debug, Deserialize)]
struct NextJobResponse {
  id: Option<u64>,
  work_units: Option<u64>,
}

#[derive(Serialize)]
pub struct IdentityResponse {
  pub node_id: String,
  pub public_key_hex: String,
}

#[derive(Serialize)]
pub struct BackendStatus {
  pub node: ServiceStatus,
  pub miner: ServiceStatus,
}

#[derive(Serialize)]
pub struct ServiceStatus {
  pub running: bool,
  pub pid: Option<u32>,
}

#[tauri::command]
pub async fn get_status(state: State<'_, Arc<ProcState>>) -> Result<BackendStatus, String> {
  Ok(BackendStatus {
    node: ServiceStatus {
      running: sidecar::is_running(state.as_ref(), "node"),
      pid: sidecar::pid_of(state.as_ref(), "node"),
    },
    miner: ServiceStatus {
      running: sidecar::is_running(state.as_ref(), "miner"),
      pid: sidecar::pid_of(state.as_ref(), "miner"),
    },
  })
}

#[tauri::command]
pub fn get_identity(app: AppHandle) -> IdentityResponse {
  let id = load_or_create_identity(&app);
  IdentityResponse { node_id: id.node_id, public_key_hex: id.public_key_hex }
}

#[tauri::command]
pub async fn start_node(app: AppHandle, state: State<'_, Arc<ProcState>>) -> Result<(), String> {
  let id = load_or_create_identity(&app);

  sidecar::spawn_sidecar_managed(
    app,
    state.inner().clone(),
    "node",
    "binaries/kascompute-node-x86_64-pc-windows-msvc.exe",
    vec![
      "--endpoint".into(),
      "https://kascompute-testnet.onrender.com".into(),
      "--node-id".into(),
      id.node_id,
      "--pubkey".into(),
      id.public_key_hex,
      "--role".into(),
      "node".into(),
      "--version".into(),
      "0.2.0".into(), // ✅ keep in sync if you want
    ],
  )
  .await
}

#[tauri::command]
pub async fn stop_node(app: AppHandle, state: State<'_, Arc<ProcState>>) -> Result<(), String> {
  sidecar::stop_managed(app, state.as_ref(), "node").await
}

#[tauri::command]
pub async fn start_miner(app: AppHandle, state: State<'_, Arc<ProcState>>) -> Result<(), String> {
  // Sidecar starten (managed => auto-restart)
  sidecar::spawn_sidecar_managed(
    app.clone(),
    state.inner().clone(),
    "miner",
    "binaries/kascompute-miner-x86_64-pc-windows-msvc.exe",
    vec![],
  )
  .await?;

  // Loop ON
  state.miner_loop_on.store(true, Ordering::Relaxed);

  // Loop nur 1x starten
  let mut g = state.miner_loop_handle.lock().map_err(|_| "lock failed".to_string())?;
  let already_running = g.as_ref().map(|h| !h.is_finished()).unwrap_or(false);

  if !already_running {
    let id = load_or_create_identity(&app);
    let api = "https://kascompute-testnet.onrender.com".to_string();

    let app2 = app.clone();
    let state2: Arc<ProcState> = state.inner().clone();
    let node_id = id.node_id;

    let h = tokio::spawn(async move {
      miner_job_loop(app2, state2, api, node_id).await;
    });

    *g = Some(h);
  }

  Ok(())
}

#[tauri::command]
pub async fn stop_miner(app: AppHandle, state: State<'_, Arc<ProcState>>) -> Result<(), String> {
  state.miner_loop_on.store(false, Ordering::Relaxed);

  if let Ok(mut g) = state.miner_loop_handle.lock() {
    if let Some(h) = g.take() {
      h.abort();
    }
  }

  sidecar::stop_managed(app, state.as_ref(), "miner").await
}

async fn miner_job_loop(app: AppHandle, state: Arc<ProcState>, api_base: String, node_id: String) {
  let client = reqwest::Client::new();
  let base = api_base.trim_end_matches('/').to_string();

  let _ = app.emit("sidecar:event", crate::sidecar::LogPayload {
    target: "miner".into(),
    stream: "event".into(),
    line: format!("miner loop started → {}", base),
  });

  while state.miner_loop_on.load(Ordering::Relaxed) {
    if !crate::sidecar::is_running(&state, "miner") {
      sleep(Duration::from_millis(800)).await;
      continue;
    }

    let next_url = format!("{}/jobs/next", base);
    let t0 = Instant::now();

    let resp = match client.post(&next_url).json(&json!({ "node_id": node_id })).send().await {
      Ok(r) => r,
      Err(e) => {
        let _ = app.emit("sidecar:stderr", crate::sidecar::LogPayload {
          target: "miner".into(),
          stream: "stderr".into(),
          line: format!("jobs/next failed: {e}"),
        });
        sleep(Duration::from_millis(1200)).await;
        continue;
      }
    };

    if !resp.status().is_success() {
      let status = resp.status();
      let body = resp.text().await.unwrap_or_default();
      let _ = app.emit("sidecar:stderr", crate::sidecar::LogPayload {
        target: "miner".into(),
        stream: "stderr".into(),
        line: format!("jobs/next bad status: {status} {body}"),
      });
      sleep(Duration::from_millis(1200)).await;
      continue;
    }

    let next: NextJobResponse = match resp.json().await {
      Ok(v) => v,
      Err(e) => {
        let _ = app.emit("sidecar:stderr", crate::sidecar::LogPayload {
          target: "miner".into(),
          stream: "stderr".into(),
          line: format!("jobs/next json parse failed: {e}"),
        });
        sleep(Duration::from_millis(1200)).await;
        continue;
      }
    };

    let job_id = match next.id {
      Some(id) => id,
      None => {
        sleep(Duration::from_millis(900)).await;
        continue;
      }
    };

    let work_units = next.work_units.unwrap_or(0);

    // SIM work
    sleep(Duration::from_millis(150)).await;
    let elapsed_ms = t0.elapsed().as_millis() as u64;

    let proof_url = format!("{}/jobs/proof", base);
    let proof_body = json!({
      "node_id": node_id,
      "job_id": job_id,
      "work_units": work_units,
      "workload_mode": "sim",
      "elapsed_ms": elapsed_ms,
      "client_version": "launcher-miner/0.2.0"
    });

    match client.post(&proof_url).json(&proof_body).send().await {
      Ok(r) if r.status().is_success() => {
        let _ = app.emit("sidecar:stdout", crate::sidecar::LogPayload {
          target: "miner".into(),
          stream: "stdout".into(),
          line: format!("proof ok job={} wu={} elapsed={}ms", job_id, work_units, elapsed_ms),
        });
      }
      Ok(r) => {
        let status = r.status();
        let body = r.text().await.unwrap_or_default();
        let _ = app.emit("sidecar:stderr", crate::sidecar::LogPayload {
          target: "miner".into(),
          stream: "stderr".into(),
          line: format!("jobs/proof bad status: {status} {body}"),
        });
      }
      Err(e) => {
        let _ = app.emit("sidecar:stderr", crate::sidecar::LogPayload {
          target: "miner".into(),
          stream: "stderr".into(),
          line: format!("jobs/proof failed: {e}"),
        });
      }
    }

    sleep(Duration::from_millis(250)).await;
  }

  let _ = app.emit("sidecar:event", crate::sidecar::LogPayload {
    target: "miner".into(),
    stream: "event".into(),
    line: "miner loop stopped".into(),
  });
}

/* HEARTBEAT */

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeartbeatPayload {
  pub node_id: String,
  pub public_key_hex: String,
  #[serde(default)] pub role: Option<String>,
  #[serde(default)] pub launcher_version: Option<String>,
  #[serde(default)] pub uptime_sec: Option<u64>,
  #[serde(default)] pub latitude: Option<f64>,
  #[serde(default)] pub longitude: Option<f64>,
  #[serde(default)] pub country: Option<String>,
}

#[tauri::command]
pub async fn send_heartbeat(api_base: String, payload: HeartbeatPayload) -> Result<(), String> {
  let base = api_base.trim_end_matches('/').to_string();
  let url = format!("{}/node/heartbeat", base);

  let client = reqwest::Client::new();
  let resp = client
    .post(url)
    .header("User-Agent", "kascompute-launcher/0.2.0")
    .json(&payload)
    .send()
    .await
    .map_err(|e| format!("heartbeat send failed: {e}"))?;

  if !resp.status().is_success() {
    let status = resp.status();
    let body = resp.text().await.unwrap_or_default();
    return Err(format!("heartbeat failed: {status} {body}"));
  }

  Ok(())
}

/* ✅ NEW: METRICS */

#[derive(Serialize)]
pub struct MetricsStatus {
  pub node: MetricsService,
  pub miner: MetricsService,
}

#[derive(Serialize)]
pub struct MetricsService {
  pub uptime: String,
  pub crashes: u32,
}

#[tauri::command]
pub async fn get_metrics(
  app: AppHandle,
  state: tauri::State<'_, std::sync::Arc<crate::sidecar::ProcState>>,
) -> Result<MetricsStatus, String> {

  let node_running = crate::sidecar::is_running(state.as_ref(), "node");
  let miner_running = crate::sidecar::is_running(state.as_ref(), "miner");

  let (node_ms, node_crashes) =
    crate::runtime_state::get_totals_conditional(&app, "node", node_running);

  let (miner_ms, miner_crashes) =
    crate::runtime_state::get_totals_conditional(&app, "miner", miner_running);

  Ok(MetricsStatus {
    node: MetricsService {
      uptime: crate::runtime_state::format_uptime_ms(node_ms),
      crashes: node_crashes,
    },
    miner: MetricsService {
      uptime: crate::runtime_state::format_uptime_ms(miner_ms),
      crashes: miner_crashes,
    },
  })
}

