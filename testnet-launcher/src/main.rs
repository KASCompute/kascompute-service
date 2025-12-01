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
// Helper
// =======================

fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

// =======================
// Datenstrukturen
// =======================

#[derive(Clone, Serialize)]
struct EmissionState {
    total_supply_kct: u64,
    mined_supply_kct: u64,
    remaining_supply_kct: u64,
    emission_month: u32,
    monthly_decay_pct: f64,
    current_block_reward_kct: f64,
}

#[derive(Clone, Serialize)]
struct EconomicState {
    kct_price_usd: f64,
    circulating_supply_kct: u64,
    market_cap_usd: f64,
    investor_value_usd: f64,
    treasury_balance_kct: u64,
    treasury_value_usd: f64,
}

#[derive(Clone, Serialize, Deserialize)]
struct NodeState {
    node_id: String,
    last_seen_unix: u64,
    compute_profile: String,
}

#[derive(Clone, Serialize, Deserialize)]
struct ProofEntry {
    node_id: String,
    job_id: String,
    work_units: u64,
    estimated_reward_kct: f64,
    proof_hash: String,
    timestamp_unix: u64,
}

struct AppState {
    emission: Mutex<EmissionState>,
    economics: Mutex<EconomicState>,
    nodes: Mutex<HashMap<String, NodeState>>,
    proofs: Mutex<Vec<ProofEntry>>,
}

// =======================
// Request-Bodies
// =======================

#[derive(Deserialize)]
struct HeartbeatBody {
    node_id: String,
    public_key_hex: String,
    compute_profile: String,
}

#[derive(Deserialize)]
struct ProofBody {
    node_id: String,
    job_id: String,
    work_units: u64,
    estimated_reward_kct: f64,
    proof_hash: String,
}

// =======================
// Response-Structs
// =======================

#[derive(Serialize)]
struct ActiveNodesResponse {
    active_nodes: Vec<NodeState>,
}

#[derive(Serialize)]
struct ProofsResponse {
    proofs: Vec<ProofEntry>,
}

#[derive(Serialize)]
struct DashboardState {
    emission: EmissionState,
    economics: EconomicState,
    active_nodes: Vec<NodeState>,
    proofs_recent: Vec<ProofEntry>,
    proofs_total_count: usize, // 🔥 NEU: Gesamtzahl aller Proofs
}

// =======================
// Handler
// =======================

/// POST /api/node/heartbeat
async fn post_heartbeat(
    State(state): State<Arc<AppState>>,
    Json(body): Json<HeartbeatBody>,
) -> Json<serde_json::Value> {
    let now = unix_now();

    let mut nodes = state.nodes.lock().unwrap();
    let node = NodeState {
        node_id: body.node_id.clone(),
        last_seen_unix: now,
        compute_profile: body.compute_profile.clone(),
    };
    nodes.insert(body.node_id.clone(), node);

    Json(serde_json::json!({
        "status": "ok",
        "timestamp_unix": now
    }))
}

/// POST /api/node/proof
async fn post_proof(
    State(state): State<Arc<AppState>>,
    Json(body): Json<ProofBody>,
) -> Json<serde_json::Value> {
    let now = unix_now();

    let mut proofs = state.proofs.lock().unwrap();
    proofs.push(ProofEntry {
        node_id: body.node_id,
        job_id: body.job_id,
        work_units: body.work_units,
        estimated_reward_kct: body.estimated_reward_kct,
        proof_hash: body.proof_hash,
        timestamp_unix: now,
    });

    // nicht unendlich wachsen lassen
    if proofs.len() > 1000 {
        let drop = proofs.len() - 1000;
        proofs.drain(0..drop);
    }

    Json(serde_json::json!({
        "status": "ok",
        "timestamp_unix": now
    }))
}

/// GET /api/nodes/active
async fn get_active_nodes(State(state): State<Arc<AppState>>) -> Json<ActiveNodesResponse> {
    let now = unix_now();
    let nodes = state.nodes.lock().unwrap();

    let active: Vec<NodeState> = nodes
        .values()
        .filter(|n| now.saturating_sub(n.last_seen_unix) <= 20)
        .cloned()
        .collect();

    Json(ActiveNodesResponse { active_nodes: active })
}

/// GET /api/proofs/recent
async fn get_recent_proofs(State(state): State<Arc<AppState>>) -> Json<ProofsResponse> {
    let proofs = state.proofs.lock().unwrap();

    let mut list: Vec<ProofEntry> = proofs.clone();
    list.sort_by_key(|p| std::cmp::Reverse(p.timestamp_unix));
    list.truncate(100);

    Json(ProofsResponse { proofs: list })
}

/// GET /api/state – alles fürs Dashboard
async fn get_dashboard_state(State(state): State<Arc<AppState>>) -> Json<DashboardState> {
    let emission = state.emission.lock().unwrap().clone();
    let economics = state.economics.lock().unwrap().clone();

    let now = unix_now();
    let nodes_map = state.nodes.lock().unwrap();
    let active_nodes: Vec<NodeState> = nodes_map
        .values()
        .filter(|n| now.saturating_sub(n.last_seen_unix) <= 20)
        .cloned()
        .collect();

    let proofs = state.proofs.lock().unwrap();
    let proofs_total_count = proofs.len(); // 🔥 NEU

    let mut proofs_recent = proofs.clone();
    proofs_recent.sort_by_key(|p| std::cmp::Reverse(p.timestamp_unix));
    proofs_recent.truncate(100); // max 10 Zeilen PoC

    Json(DashboardState {
        emission,
        economics,
        active_nodes,
        proofs_recent,
        proofs_total_count, // 🔥 NEU
    })
}

// =======================
// main
// =======================

#[tokio::main]
async fn main() {
    // Dummy-Startwerte – später dynamisch
    let emission = EmissionState {
        total_supply_kct: 10_000_000_000,
        mined_supply_kct: 123_456_789,
        remaining_supply_kct: 10_000_000_000 - 123_456_789,
        emission_month: 1,
        monthly_decay_pct: 1.0,
        current_block_reward_kct: 200.0,
    };

    let economics = EconomicState {
        kct_price_usd: 0.05,
        circulating_supply_kct: 150_000_000,
        market_cap_usd: 0.05 * 150_000_000.0,
        investor_value_usd: 0.05 * 150_000_000.0,
        treasury_balance_kct: 1_000_000_000,
        treasury_value_usd: 0.05 * 1_000_000_000.0,
    };

    let state = Arc::new(AppState {
        emission: Mutex::new(emission),
        economics: Mutex::new(economics),
        nodes: Mutex::new(HashMap::new()),
        proofs: Mutex::new(Vec::new()),
    });

    // statische Files aus /public, mit Fallback auf index.html
    let static_files = ServeDir::new("public")
        .not_found_service(ServeFile::new("public/index.html"));

    // API unter /api, Dashboard unter / und /dashboard
    let api_router = Router::new()
        .route("/node/heartbeat", post(post_heartbeat))
        .route("/node/proof", post(post_proof))
        .route("/nodes/active", get(get_active_nodes))
        .route("/proofs/recent", get(get_recent_proofs))
        .route("/state", get(get_dashboard_state))
        .with_state(state);

    let app = Router::new()
        .nest("/api", api_router)
        .nest_service("/dashboard", static_files.clone())
        .nest_service("/", static_files);

    // PORT von Render
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
