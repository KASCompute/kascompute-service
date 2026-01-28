use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::atomic::Ordering;
use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::identity::load_or_create_identity;
use crate::sidecar::{self, ProcState};

/// Normalize any API base to ROOT (NO trailing /v1, NO trailing slash).
fn normalize_api_root(base: &str) -> String {
  let mut s = base.trim().trim_end_matches('/').to_string();
  if s.ends_with("/v1") {
    s.truncate(s.len().saturating_sub(3));
    s = s.trim_end_matches('/').to_string();
  }
  s
}

/// Ensure we have the /v1 base (from any input).
fn v1_base_from_any(base: &str) -> String {
  let root = normalize_api_root(base);
  format!("{}/v1", root)
}

/// Prefer ENV overrides, fallback to Render default.
/// Returns ROOT (no /v1).
fn api_root_from_env_or_default() -> String {
  let api_any = std::env::var("KASCOMPUTE_API")
    .or_else(|_| std::env::var("VITE_SIDECAR_API"))
    .or_else(|_| std::env::var("VITE_API_BASE"))
    .unwrap_or_else(|_| "https://kascompute-protocol-v1.onrender.com".to_string());

  normalize_api_root(&api_any)
}

// =============================================================================
// API response envelopes (Protocol V1)  (kept, even if unused for now)
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
// Miner UI proof structs (MUST STAY STABLE for UI)
// =============================================================================

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

  pub roles: Vec<String>,
  pub client_version: Option<String>,
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

// =============================================================================
// Commands
// =============================================================================

#[tauri::command]
pub async fn get_status(state: State<'_, Arc<ProcState>>) -> Result<BackendStatus, String> {
  let node_running = sidecar::is_running(state.as_ref(), "node");
  let node_pid = sidecar::pid_of(state.as_ref(), "node");

  // ✅ Miner = Sidecar only (profi)
  let miner_running = sidecar::is_running(state.as_ref(), "miner");
  let miner_pid = sidecar::pid_of(state.as_ref(), "miner");

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

  let id = load_or_create_identity(&app);
  let api_root = api_root_from_env_or_default();

  sidecar::spawn_sidecar_managed(
    app,
    state.inner().clone(),
    "node",
    "binaries/kascompute-node-x86_64-pc-windows-msvc.exe",
    vec![
      "--endpoint".into(),
      api_root,
      "--node-id".into(),
      id.node_id,
      "--pubkey".into(),
      id.public_key_hex,
      "--role".into(),
      "node".into(),
      "--version".into(),
      "2.1.0".into(),
    ],
  )
  .await
}

#[tauri::command]
pub async fn stop_node(app: AppHandle, state: State<'_, Arc<ProcState>>) -> Result<(), String> {
  sidecar::stop_managed(app, state.as_ref(), "node").await
}

// =============================================================================
// ✅ MINER as SIDE-CAR 
// =============================================================================

#[tauri::command]
pub async fn start_miner(app: AppHandle, state: State<'_, Arc<ProcState>>) -> Result<(), String> {
  // stop old miner first
  let _ = sidecar::stop_managed(app.clone(), state.as_ref(), "miner").await;
  crate::runtime_state::mark_stopped(&app, "miner", false);

  // ensure any legacy internal loop is OFF (safe)
  state.miner_loop_on.store(false, Ordering::Relaxed);
  if let Ok(mut g) = state.miner_loop_handle.lock() {
    if let Some(h) = g.take() {
      h.abort();
    }
  }

  let id = load_or_create_identity(&app);
  let api_root = api_root_from_env_or_default();

  // uptime start (persisted)
  crate::runtime_state::mark_started(&app, "miner");

  sidecar::spawn_sidecar_managed(
    app,
    state.inner().clone(),
    "miner",
    "binaries/kascompute-miner-x86_64-pc-windows-msvc.exe",
    vec![
      "--endpoint".into(),
      api_root,
      "--node-id".into(),
      id.node_id,
      "--pubkey".into(),
      id.public_key_hex,
      "--privkey".into(),
      id.private_key_hex, // ✅ IMPORTANT: needed for real signatures

      // ✅ NEW: lets you label the miner's compute type
      "--compute-profile".into(),
      "sim".into(), // later: "cpu" / "gpu" / "avx2" / "arm" etc.

      "--role".into(),
      "miner".into(),
      "--version".into(),
      "1.1.0".into(),
    ],
  )
  .await
}

#[tauri::command]
pub async fn stop_miner(app: AppHandle, state: State<'_, Arc<ProcState>>) -> Result<(), String> {
  // ensure legacy internal loop is OFF
  state.miner_loop_on.store(false, Ordering::Relaxed);
  if let Ok(mut g) = state.miner_loop_handle.lock() {
    if let Some(h) = g.take() {
      h.abort();
    }
  }

  crate::runtime_state::mark_stopped(&app, "miner", false);
  sidecar::stop_managed(app, state.as_ref(), "miner").await
}

// =============================================================================
// HEARTBEAT (Protocol V1) - UI invoke from frontend
// =============================================================================

#[derive(Debug, Clone, Deserialize)]
pub struct SendHeartbeatArgs {
  #[serde(alias = "apiBase")]
  pub api_base: String,
  pub payload: HeartbeatPayload,
}

#[tauri::command]
pub async fn send_heartbeat(args: SendHeartbeatArgs) -> Result<(), String> {
  let v1 = v1_base_from_any(&args.api_base);
  let url = format!("{}/nodes/heartbeat", v1);

  let client = reqwest::Client::new();
  let resp = client
    .post(&url)
    .header("User-Agent", "kascompute-launcher/2.1.0")
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

// =============================================================================
// METRICS
// =============================================================================

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
