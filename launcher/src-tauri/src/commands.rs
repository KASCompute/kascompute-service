use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::atomic::Ordering;
use std::{sync::Arc, time::Instant};

use tauri::{AppHandle, Emitter, State};
use tokio::time::{sleep, Duration};

use crate::identity::load_or_create_identity;
use crate::sidecar::{self, ProcState};

// crypto
use ed25519_dalek::{Signer, SigningKey};
use sha2::{Digest, Sha256};

/// Normalize any API base to ROOT (NO trailing /v1, NO trailing slash).
/// Examples:
/// - "https://host" -> "https://host"
/// - "https://host/" -> "https://host"
/// - "https://host/v1" -> "https://host"
/// - "https://host/v1/" -> "https://host"
fn normalize_api_root(base: &str) -> String {
  let mut s = base.trim().trim_end_matches('/').to_string();
  if s.ends_with("/v1") {
    s.truncate(s.len().saturating_sub(3)); // remove trailing "/v1"
    s = s.trim_end_matches('/').to_string();
  }
  s
}

/// Ensure we have the /v1 base (from any input).
fn v1_base_from_any(base: &str) -> String {
  let root = normalize_api_root(base);
  format!("{}/v1", root)
}

// =============================================================================
// API response envelopes (Protocol V1)
// =============================================================================

#[derive(Debug, Deserialize)]
struct ApiEnvelope<T> {
  status: String,
  data: T,
  error: Option<serde_json::Value>,
  ts: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct NextJobData {
  job: Option<JobLease>,
}

#[derive(Debug, Deserialize)]
struct JobLease {
  id: u64,
  work_units: u64,
  lease_expires_unix: u64,
}

// =============================================================================
// Tauri UI structs
// =============================================================================

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

// =============================================================================
// Commands
// =============================================================================

#[tauri::command]
pub async fn get_status(
  state: State<'_, Arc<ProcState>>,
) -> Result<BackendStatus, String> {
  let node_running = sidecar::is_running(state.as_ref(), "node");
  let node_pid = sidecar::pid_of(state.as_ref(), "node");

  let miner_sidecar_pid = sidecar::pid_of(state.as_ref(), "miner");
  let miner_loop_on = state.miner_loop_on.load(Ordering::Relaxed);
  let miner_running = sidecar::is_running(state.as_ref(), "miner") || miner_loop_on;

  let miner_pid = if miner_sidecar_pid.is_some() {
    miner_sidecar_pid
  } else if miner_loop_on {
    Some(std::process::id())
  } else {
    None
  };

  Ok(BackendStatus {
    node: ServiceStatus {
      running: node_running,
      pid: node_pid,
    },
    miner: ServiceStatus {
      running: miner_running,
      pid: miner_pid,
    },
  })
}

#[tauri::command]
pub fn get_identity(app: AppHandle) -> IdentityResponse {
  let id = load_or_create_identity(&app);
  IdentityResponse {
    node_id: id.node_id,
    public_key_hex: id.public_key_hex,
  }
}


#[tauri::command]
pub async fn start_node(app: AppHandle, state: State<'_, Arc<ProcState>>) -> Result<(), String> {

  let _ = sidecar::stop_managed(app.clone(), state.as_ref(), "node").await;
  crate::runtime_state::mark_stopped(&app, "node", false);

  let id = load_or_create_identity(&app);

  sidecar::spawn_sidecar_managed(
    app,
    state.inner().clone(),
    "node",
    "binaries/kascompute-node-x86_64-pc-windows-msvc.exe",
    vec![
      "--endpoint".into(),
      "https://kascompute-protocol-v1.onrender.com".into(),
      "--node-id".into(),
      id.node_id,
      "--pubkey".into(),
      id.public_key_hex,
      "--role".into(),
      "node".into(),
      "--version".into(),
      "0.2.0".into(),
    ],
  )
  .await
}


#[tauri::command]
pub async fn stop_node(app: AppHandle, state: State<'_, Arc<ProcState>>) -> Result<(), String> {
  sidecar::stop_managed(app, state.as_ref(), "node").await
}

/* =========================
   MINER (Protocol-v1) + Proof (strict compatible)
   ========================= */

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProofPayloadV1ToSign {
  pub node_id: String,
  pub job_id: u64,
  pub work_units: u64,
  pub workload_mode: String,
  pub elapsed_ms: u64,
  pub client_version: String,
  pub ts: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MinerProofUi {
  pub node_id: String,
  pub job_id: u64,
  pub work_units: u64,
  pub elapsed_ms: u64,
  pub workload_mode: String,
  pub client_version: String,
  pub ts: u64,
  pub proof_hash_hex: String,
  pub signature_hex: String,
  pub public_key_hex: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeartbeatPayload {
  pub node_id: String,
  pub public_key_hex: String,

  pub roles: Vec<String>,             // ["miner"] / ["node"] / ["node","miner"]
  pub client_version: Option<String>, // e.g. "protocol-v1"
  pub uptime_sec: u64,

  #[serde(skip_serializing_if = "Option::is_none")]
  pub latitude: Option<f64>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub longitude: Option<f64>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub country: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub compute_profile: Option<String>,
}

async fn send_miner_heartbeat_once(
  client: &reqwest::Client,
  app: &AppHandle,
  v1_base: &str,
  node_id: &str,
  public_key_hex: &str,
  uptime_sec: u64,
) -> bool {
  let url = format!("{}/nodes/heartbeat", v1_base);

  let hb = HeartbeatPayload {
    node_id: node_id.to_string(),
    public_key_hex: public_key_hex.to_string(),
    roles: vec!["miner".to_string()],
    client_version: Some("protocol-v1".to_string()),
    uptime_sec,
    latitude: None,
    longitude: None,
    country: None,
    compute_profile: Some("sim".to_string()),
  };

  let resp = client
    .post(&url)
    .header("User-Agent", "kascompute-launcher/0.2.0")
    .json(&hb)
    .send()
    .await;

  match resp {
    Ok(r) if r.status().is_success() => {
      let _ = app.emit(
        "sidecar:event",
        crate::sidecar::LogPayload {
          target: "miner".into(),
          stream: "event".into(),
          line: "heartbeat ok (miner)".into(),
        },
      );
      true
    }
    Ok(r) => {
      let status = r.status();
      let body = r.text().await.unwrap_or_default();
      let _ = app.emit(
        "sidecar:stderr",
        crate::sidecar::LogPayload {
          target: "miner".into(),
          stream: "stderr".into(),
          line: format!("heartbeat failed: {status} {body}"),
        },
      );
      false
    }
    Err(e) => {
      let _ = app.emit(
        "sidecar:stderr",
        crate::sidecar::LogPayload {
          target: "miner".into(),
          stream: "stderr".into(),
          line: format!("heartbeat error: {e}"),
        },
      );
      false
    }
  }
}

#[tauri::command]
pub async fn start_miner(app: AppHandle, state: State<'_, Arc<ProcState>>) -> Result<(), String> {

  let _ = sidecar::stop_managed(app.clone(), state.as_ref(), "miner").await;

  state.miner_loop_on.store(true, Ordering::Relaxed);

  //  uptime start
  crate::runtime_state::mark_started(&app, "miner");

  // Loop 
  let mut g = state
    .miner_loop_handle
    .lock()
    .map_err(|_| "lock failed".to_string())?;

  let already_running = g.as_ref().map(|h| !h.is_finished()).unwrap_or(false);

  if !already_running {
    let id = load_or_create_identity(&app);

    let api_any = std::env::var("KASCOMPUTE_API")
      .or_else(|_| std::env::var("VITE_SIDECAR_API"))
      .or_else(|_| std::env::var("VITE_API_BASE"))
      .unwrap_or_else(|_| "https://kascompute-protocol-v1.onrender.com".to_string());

    let app2 = app.clone();
    let state2: Arc<ProcState> = state.inner().clone();

    let node_id = id.node_id.clone();
    let public_key_hex = id.public_key_hex.clone();
    let private_key_hex = id.private_key_hex.clone();

    let h = tokio::spawn(async move {
      miner_job_loop(app2, state2, api_any, node_id, public_key_hex, private_key_hex).await;
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


  crate::runtime_state::mark_stopped(&app, "miner", false);

  Ok(())
}


async fn miner_job_loop(
  app: AppHandle,
  state: Arc<ProcState>,
  api_base_any: String,
  node_id: String,
  public_key_hex: String,
  private_key_hex: String,
) {
  let client = reqwest::Client::new();

  let v1_base = v1_base_from_any(&api_base_any);
  let _ = app.emit(
    "sidecar:event",
    crate::sidecar::LogPayload {
      target: "miner".into(),
      stream: "event".into(),
      line: format!("miner loop started → v1={}", v1_base),
    },
  );

  // Ensure: 1 heartbeat ok before job polling
  let mut hb_ok = false;
  for i in 0..5u64 {
    if !state.miner_loop_on.load(Ordering::Relaxed) {
      break;
    }
    hb_ok =
      send_miner_heartbeat_once(&client, &app, &v1_base, &node_id, &public_key_hex, 1 + i).await;
    if hb_ok {
      break;
    }
    sleep(Duration::from_millis(1000)).await;
  }

  if !hb_ok {
    let _ = app.emit(
      "sidecar:stderr",
      crate::sidecar::LogPayload {
        target: "miner".into(),
        stream: "stderr".into(),
        line: "miner loop: heartbeat did not succeed; continuing anyway".into(),
      },
    );
  }

  let mut uptime_sec: u64 = 1;
  let mut hb_tick: u64 = 0;

  while state.miner_loop_on.load(Ordering::Relaxed) {
    // Heartbeat nur alle ~30 Loops (ca. alle paar Sekunden, je nach delays)
    hb_tick = hb_tick.wrapping_add(1);
    if hb_tick % 30 == 0 {
      let _ = send_miner_heartbeat_once(
        &client,
        &app,
        &v1_base,
        &node_id,
        &public_key_hex,
        uptime_sec,
      )
      .await;
      uptime_sec = uptime_sec.saturating_add(5);
    }

    // ---- get next job
    let next_url = format!("{}/jobs/next", v1_base);
    let t0 = Instant::now();

    let resp = match client
      .post(&next_url)
      .json(&json!({ "node_id": node_id.clone() }))
      .send()
      .await
    {
      Ok(r) => r,
      Err(e) => {
        let _ = app.emit(
          "sidecar:stderr",
          crate::sidecar::LogPayload {
            target: "miner".into(),
            stream: "stderr".into(),
            line: format!("jobs/next failed: {e}"),
          },
        );
        sleep(Duration::from_millis(1200)).await;
        continue;
      }
    };

    if !resp.status().is_success() {
      let status = resp.status();
      let body = resp.text().await.unwrap_or_default();
      let _ = app.emit(
        "sidecar:stderr",
        crate::sidecar::LogPayload {
          target: "miner".into(),
          stream: "stderr".into(),
          line: format!("jobs/next bad status: {status} {body}"),
        },
      );
      sleep(Duration::from_millis(1200)).await;
      continue;
    }

    let env: ApiEnvelope<NextJobData> = match resp.json().await {
      Ok(v) => v,
      Err(e) => {
        let _ = app.emit(
          "sidecar:stderr",
          crate::sidecar::LogPayload {
            target: "miner".into(),
            stream: "stderr".into(),
            line: format!("jobs/next json parse failed: {e}"),
          },
        );
        sleep(Duration::from_millis(1200)).await;
        continue;
      }
    };

    let lease = match env.data.job {
      Some(j) => j,
      None => {
        // no job available
        sleep(Duration::from_millis(900)).await;
        continue;
      }
    };

    let job_id = lease.id;
    let work_units = lease.work_units;

    // ---- simulate work
    sleep(Duration::from_millis(150)).await;
    let elapsed_ms = t0.elapsed().as_millis() as u64;

    // timestamp unix seconds
    let ts = (std::time::SystemTime::now()
      .duration_since(std::time::UNIX_EPOCH)
      .unwrap_or_default()
      .as_secs()) as u64;

    // strict v1 signature payload (must match backend verifier)
    let payload_to_sign = ProofPayloadV1ToSign {
      node_id: node_id.clone(),
      job_id,
      work_units,
      workload_mode: "sim".to_string(),
      elapsed_ms,
      client_version: "protocol-v1".to_string(),
      ts,
    };

    // canonical bytes = json bytes of payload
    let payload_bytes = serde_json::to_vec(&payload_to_sign).unwrap_or_default();

    // sha256(payload_bytes)
    let hash = Sha256::digest(&payload_bytes);
    let proof_hash_hex = hex::encode(hash);

    // ed25519 sign(hash_bytes)
    let sk_bytes_vec = hex::decode(&private_key_hex).unwrap_or_default();
    let mut signature_hex = "00".to_string();
    if sk_bytes_vec.len() == 32 {
      let mut sk_bytes = [0u8; 32];
      sk_bytes.copy_from_slice(&sk_bytes_vec[..32]);

      let signing = SigningKey::from_bytes(&sk_bytes);
      let sig = signing.sign(hash.as_slice());
      signature_hex = hex::encode(sig.to_bytes());
    }

    // ---- submit proof (Protocol V1: /jobs/:job_id/proof)
    let proof_url = format!("{}/jobs/{}/proof", v1_base, job_id);

    // send ONLY fields that backend ProofSubmitRequest expects
    let proof_body = json!({
      "node_id": payload_to_sign.node_id,
      "work_units": payload_to_sign.work_units,
      "workload_mode": payload_to_sign.workload_mode,
      "elapsed_ms": payload_to_sign.elapsed_ms,
      "client_version": payload_to_sign.client_version,
      "timestamp_unix": payload_to_sign.ts,
      "signature_hex": signature_hex,
      "result_hash": null
    });

    match client.post(&proof_url).json(&proof_body).send().await {
      Ok(r) if r.status().is_success() => {
        let _ = app.emit(
          "sidecar:stdout",
          crate::sidecar::LogPayload {
            target: "miner".into(),
            stream: "stdout".into(),
            line: format!("proof ok job={} wu={} elapsed={}ms", job_id, work_units, elapsed_ms),
          },
        );

        // structured UI event (includes last proof hash)
        let ui = MinerProofUi {
          node_id: node_id.clone(),
          job_id,
          work_units,
          elapsed_ms,
          workload_mode: "sim".to_string(),
          client_version: "protocol-v1".to_string(),
          ts,
          proof_hash_hex: proof_hash_hex.clone(),
          signature_hex: signature_hex.clone(),
          public_key_hex: public_key_hex.clone(),
        };

        let _ = app.emit("miner:proof", ui);
      }
      Ok(r) => {
        let status = r.status();
        let body = r.text().await.unwrap_or_default();
        let _ = app.emit(
          "sidecar:stderr",
          crate::sidecar::LogPayload {
            target: "miner".into(),
            stream: "stderr".into(),
            line: format!("jobs/proof bad status: {status} {body}"),
          },
        );
      }
      Err(e) => {
        let _ = app.emit(
          "sidecar:stderr",
          crate::sidecar::LogPayload {
            target: "miner".into(),
            stream: "stderr".into(),
            line: format!("jobs/proof failed: {e}"),
          },
        );
      }
    }

    sleep(Duration::from_millis(250)).await;
  }

  let _ = app.emit(
    "sidecar:event",
    crate::sidecar::LogPayload {
      target: "miner".into(),
      stream: "event".into(),
      line: "miner loop stopped".into(),
    },
  );
}

/* =========================
   HEARTBEAT (Protocol V1) - UI invoke from frontend
   ========================= */

#[derive(Debug, Clone, Deserialize)]
pub struct SendHeartbeatArgs {
  #[serde(alias = "apiBase")]
  pub api_base: String,
  pub payload: HeartbeatPayload,
}

#[tauri::command]
pub async fn send_heartbeat(args: SendHeartbeatArgs) -> Result<(), String> {
  // user may pass root or /v1 -> normalize to v1
  let v1 = v1_base_from_any(&args.api_base);
  let url = format!("{}/nodes/heartbeat", v1);

  let client = reqwest::Client::new();
  let resp = client
    .post(&url)
    .header("User-Agent", "kascompute-launcher/0.2.0")
    .json(&args.payload)
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

/* =========================
   METRICS
   ========================= */

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
  let miner_running =
    crate::sidecar::is_running(state.as_ref(), "miner")
      || state.miner_loop_on.load(Ordering::Relaxed);

  let (node_ms, node_crashes) =
    crate::runtime_state::get_totals_conditional(&app, "node", node_running);
  let (miner_ms, miner_crashes) =
    crate::runtime_state::get_totals_conditional(&app, "miner", miner_running);

  Ok(MetricsStatus {
    node: MetricsService {
      uptime: if node_running {
        crate::runtime_state::format_uptime_ms(node_ms)
      } else {
        "".to_string()
      },
      crashes: node_crashes,
    },
    miner: MetricsService {
      uptime: if miner_running {
        crate::runtime_state::format_uptime_ms(miner_ms)
      } else {
        "".to_string()
      },
      crashes: miner_crashes,
    },
  })
}

