use axum::{
    extract::State,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    env,
    net::SocketAddr,
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};
use tower_http::services::{ServeDir, ServeFile};

// =======================
// Shared State
// =======================

#[derive(Clone)]
struct AppState {
    inner: Arc<InnerState>,
}

struct InnerState {
    nodes: Mutex<HashMap<String, NodeInfo>>,
    proofs: Mutex<Vec<ProofEntry>>,
    emission: EmissionState,
    economics: EconomicsState,
}

#[derive(Clone, Debug)]
struct NodeInfo {
    hardware: String,
    last_seen_unix: u64,
}

#[derive(Clone, Debug)]
struct ProofEntry {
    node_id: String,
    job_id: String,
    work_units: u64,
    estimated_reward_kct: f64,
    timestamp_unix: u64,
}

// =======================
// API Types (JSON)
// =======================

#[derive(Serialize, Deserialize, Clone)]
struct NodeState {
    node_id: String,
    hardware: String,
    last_seen_unix: u64,
}

#[derive(Serialize, Deserialize, Clone)]
struct ProofState {
    node_id: String,
    job_id: String,
    work_units: u64,
    estimated_reward_kct: f64,
    timestamp_unix: u64,
}

#[derive(Serialize, Deserialize, Clone)]
struct EmissionState {
    total_supply_kct: f64,
    mined_supply_kct: f64,
    remaining_supply_kct: f64,
    emission_month: u64,
    monthly_decay_pct: f64,
    current_block_reward_kct: f64,
}

#[derive(Serialize, Deserialize, Clone)]
struct EconomicsState {
    kct_price_usd: f64,
    circulating_supply_kct: f64,
    treasury_balance_kct: f64,
    market_cap_usd: f64,
    investor_value_usd: f64,
    treasury_value_usd: f64,
}

#[derive(Serialize, Deserialize, Clone)]
struct StateResponse {
    nodes: Vec<NodeState>,
    proofs: Vec<ProofState>,
    emission: EmissionState,
    economics: EconomicsState,
}

// Heartbeat-Request vom Node
#[derive(Deserialize)]
struct HeartbeatRequest {
    node_id: String,
    #[serde(default)]
    hardware: Option<String>,
    #[serde(default)]
    compute_profile: Option<String>,
}

// Heartbeat-Response
#[derive(Serialize)]
struct HeartbeatResponse {
    ok: bool,
    timestamp_unix: u64,
}

// Proof-Request vom Node
#[derive(Deserialize)]
struct ProofRequest {
    node_id: String,
    job_id: String,
    work_units: u64,
}

// Proof-Response
#[derive(Serialize)]
struct ProofResponse {
    ok: bool,
    timestamp_unix: u64,
    estimated_reward_kct: f64,
}

// =======================
// Helper
// =======================

fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs()
}

// =======================
// Handlers
// =======================

async fn health() -> &'static str {
    "ok"
}

// Node Heartbeat: /api/node/heartbeat
async fn heartbeat(
    State(state): State<AppState>,
    Json(payload): Json<HeartbeatRequest>,
) -> Json<HeartbeatResponse> {
    let now = now_unix();
    let hw = payload
        .hardware
        .or(payload.compute_profile)
        .unwrap_or_else(|| "unknown".to_string());

    {
        let mut nodes = state.inner.nodes.lock().unwrap();
        nodes.insert(
            payload.node_id.clone(),
            NodeInfo {
                hardware: hw,
                last_seen_unix: now,
            },
        );
    }

    Json(HeartbeatResponse {
        ok: true,
        timestamp_unix: now,
    })
}

// Proof-of-Compute: /api/node/proof
async fn submit_proof(
    State(state): State<AppState>,
    Json(payload): Json<ProofRequest>,
) -> Json<ProofResponse> {
    let now = now_unix();

    // einfache Beispiel-Reward: proportional zu work_units
    let base_reward = state.inner.emission.current_block_reward_kct;
    let estimated = (payload.work_units as f64 / 1_000_000.0) * base_reward;

    let entry = ProofEntry {
        node_id: payload.node_id.clone(),
        job_id: payload.job_id.clone(),
        work_units: payload.work_units,
        estimated_reward_kct: estimated,
        timestamp_unix: now,
    };

    {
        let mut proofs = state.inner.proofs.lock().unwrap();
        proofs.push(entry);
    }

    Json(ProofResponse {
        ok: true,
        timestamp_unix: now,
        estimated_reward_kct: estimated,
    })
}

// State für Dashboard: /api/state
async fn get_state(State(state): State<AppState>) -> Json<StateResponse> {
    let nodes_map = state.inner.nodes.lock().unwrap();
    let proofs_vec = state.inner.proofs.lock().unwrap();

    // Nodes mappen
    let mut nodes: Vec<NodeState> = nodes_map
        .iter()
        .map(|(node_id, info)| NodeState {
            node_id: node_id.clone(),
            hardware: info.hardware.clone(),
            last_seen_unix: info.last_seen_unix,
        })
        .collect();

    // Proofs mappen
    let mut proofs: Vec<ProofState> = proofs_vec
        .iter()
        .map(|p| ProofState {
            node_id: p.node_id.clone(),
            job_id: p.job_id.clone(),
            work_units: p.work_units,
            estimated_reward_kct: p.estimated_reward_kct,
            timestamp_unix: p.timestamp_unix,
        })
        .collect();

    // neueste zuerst
    nodes.sort_by_key(|n| std::cmp::Reverse(n.last_seen_unix));
    proofs.sort_by_key(|p| std::cmp::Reverse(p.timestamp_unix));

    // Emission & Economics aus State nehmen
    let emission = state.inner.emission.clone();
    let economics = state.inner.economics.clone();

    Json(StateResponse {
        nodes,
        proofs,
        emission,
        economics,
    })
}

// =======================
// main
// =======================

#[tokio::main]
async fn main() {
    // Einfaches statisches Emissionsmodell für dein Testnet
    let emission = EmissionState {
        total_supply_kct: 9_000_000_000.0,
        mined_supply_kct: 100_000.0,
        remaining_supply_kct: 9_000_000_000.0 - 100_000.0,
        emission_month: 1,
        monthly_decay_pct: 1.0,
        current_block_reward_kct: 200.0,
    };

    // Einfaches Economics-Modell
    let economics = EconomicsState {
        kct_price_usd: 0.01,
        circulating_supply_kct: 100_000.0,
        treasury_balance_kct: 1_000_000_000.0,
        market_cap_usd: 0.01 * 100_000.0,
        investor_value_usd: 0.01 * 100_000.0 * 0.5,
        treasury_value_usd: 0.01 * 1_000_000_000.0,
    };

    let inner = InnerState {
        nodes: Mutex::new(HashMap::new()),
        proofs: Mutex::new(Vec::new()),
        emission,
        economics,
    };

    let state = AppState {
        inner: Arc::new(inner),
    };

    // Static Files (Dashboard)
    let public_dir =
        ServeDir::new("public").not_found_service(ServeFile::new("public/index.html"));

    let app = Router::new()
        .route("/health", get(health))
        .route("/api/state", get(get_state))
        .route("/api/node/heartbeat", post(heartbeat))
        .route("/api/node/proof", post(submit_proof))
        .nest_service("/dashboard", public_dir.clone())
        .nest_service("/", public_dir)
        .with_state(state);

    let port: u16 = env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8080);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    println!("KASCompute testnet backend listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("failed to bind");

    axum::serve(listener, app)
        .await
        .expect("server error");
}
