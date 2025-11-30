use axum::{
    extract::{Query, State},
    routing::{get, post},
    response::Redirect,
    http::StatusCode,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    net::SocketAddr,
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};
use tokio::net::TcpListener;
use tower_http::services::ServeDir;
use anyhow::Result;

// -------------------------
// KCT EMISSION MODEL
// -------------------------

const START_REWARD_KCT: f64 = 200.0;      // Start: 200 KCT pro Block
const MONTHLY_DECAY: f64 = 0.01;          // 1 % pro Monat
const TOTAL_MONTHS: u32 = 168;            // 14 Jahre
const BLOCKS_PER_MINUTE: f64 = 1.0;
const MINUTES_PER_MONTH: f64 = 30.0 * 24.0 * 60.0;
const BLOCKS_PER_MONTH: f64 = BLOCKS_PER_MINUTE * MINUTES_PER_MONTH;

/// Block-Reward in Monat m (1..168)
fn block_reward_for_month(month: u32) -> f64 {
    let m = month.clamp(1, TOTAL_MONTHS);
    let factor = (1.0 - MONTHLY_DECAY).powi((m - 1) as i32);
    START_REWARD_KCT * factor
}

/// Gesamt-Emission in Monat m
fn monthly_emission_for_month(month: u32) -> f64 {
    block_reward_for_month(month) * BLOCKS_PER_MONTH
}

/// Aktueller Emissions-Monat (für Testnet per ENV überschreibbar)
fn current_emission_month() -> u32 {
    std::env::var("KCT_EMISSION_MONTH")
        .ok()
        .and_then(|s| s.parse::<u32>().ok())
        .unwrap_or(1) // Testnet default: Monat 1 (200 KCT)
}

/// Reward pro Proof basierend auf Work Units & Emissionsmonat
fn reward_for_work(work_units: u64, month: u32) -> f64 {
    // Wir skalieren die Block-Reward linear mit der Work:
    // baseline: 32k Work Units ≈ 1 Block.
    let baseline_work: f64 = 32_000.0;
    let block_reward = block_reward_for_month(month);
    let factor = (work_units as f64 / baseline_work).max(0.0);
    // Auf 6 Nachkommastellen runden
    (block_reward * factor * 1_000_000.0).round() / 1_000_000.0
}

// -------------------------
// API TYPES
// -------------------------

#[derive(Deserialize)]
struct RewardRequest {
    month: u32,
}

#[derive(Serialize)]
struct RewardResponse {
    month: u32,
    block_reward_kct: f64,
    monthly_emission_kct: f64,
    notes: String,
}

#[derive(Deserialize)]
struct InvestorQuery {
    fee_annual: f64,
    investor_pct: f64,
    years: u32,
    growth: f64,
    discount: f64,
}

#[derive(Serialize)]
struct InvestorResponse {
    years: u32,
    gross_sum: f64,
    investor_sum: f64,
    npv_investor: f64,
    apy_estimate: f64,
}

// -------------------------
// NODE REGISTRY
// -------------------------

#[derive(Clone, Debug, Deserialize, Serialize)]
struct NodeHeartbeat {
    node_id: String,
    public_key_hex: String,
    compute_profile: String,

    #[serde(default)]
    timestamp_unix: Option<u64>,
    #[serde(default)]
    signature_hex: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
struct NodeRegistryEntry {
    node_id: String,
    public_key_hex: String,
    compute_profile: String,
    last_seen_unix: u64,
    compute_score: u64,
}

type NodeRegistry = Arc<Mutex<HashMap<String, NodeRegistryEntry>>>;

// -------------------------
// PROOF OF COMPUTE
// -------------------------

#[derive(Clone, Debug, Deserialize, Serialize)]
struct ProofSubmission {
    node_id: String,
    job_id: String,
    work_units: u64,
    estimated_reward_kct: f64, // wird vom Backend überschrieben
    proof_hash: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
struct ProofRecord {
    node_id: String,
    job_id: String,
    work_units: u64,
    estimated_reward_kct: f64, // hier liegt der KCT-Reward
    proof_hash: String,
    timestamp_unix: u64,
}

type ProofStore = Arc<Mutex<Vec<ProofRecord>>>;

// -------------------------
// GLOBAL APP STATE
// -------------------------

#[derive(Clone)]
struct AppState {
    registry: NodeRegistry,
    proofs: ProofStore,
}

// -------------------------
// HANDLERS
// -------------------------

async fn node_heartbeat(
    State(state): State<AppState>,
    Json(payload): Json<NodeHeartbeat>,
) -> StatusCode {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();

    let mut map = state.registry.lock().unwrap();

    let entry = map.entry(payload.node_id.clone()).or_insert(
        NodeRegistryEntry {
            node_id: payload.node_id.clone(),
            public_key_hex: payload.public_key_hex.clone(),
            compute_profile: payload.compute_profile.clone(),
            last_seen_unix: now,
            compute_score: 0,
        },
    );

    entry.public_key_hex = payload.public_key_hex.clone();
    entry.compute_profile = payload.compute_profile.clone();
    entry.last_seen_unix = now;
    entry.compute_score += 1;

    println!(
        "[HB] {} | profile={} | score={}",
        entry.node_id, entry.compute_profile, entry.compute_score
    );

    StatusCode::OK
}

async fn list_nodes(State(state): State<AppState>) -> Json<Vec<NodeRegistryEntry>> {
    let map = state.registry.lock().unwrap();
    let mut list: Vec<_> = map.values().cloned().collect();
    list.sort_by(|a, b| a.node_id.cmp(&b.node_id));
    Json(list)
}

async fn submit_proof(
    State(state): State<AppState>,
    Json(payload): Json<ProofSubmission>,
) -> StatusCode {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();

    // Node muss registriert sein
    let exists = {
        let map = state.registry.lock().unwrap();
        map.contains_key(&payload.node_id)
    };

    if !exists {
        println!("[PROOF] REJECTED from {} (unknown node)", payload.node_id);
        return StatusCode::BAD_REQUEST;
    }

    // Reward nach Emissionsmodell berechnen (Server-Side Authority)
    let month = current_emission_month();
    let reward_kct = reward_for_work(payload.work_units, month);

    let mut list = state.proofs.lock().unwrap();
    list.push(ProofRecord {
        node_id: payload.node_id.clone(),
        job_id: payload.job_id.clone(),
        work_units: payload.work_units,
        estimated_reward_kct: reward_kct,
        proof_hash: payload.proof_hash.clone(),
        timestamp_unix: now,
    });

    println!(
        "[PROOF] {} | job={} | wu={} | month={} | reward={:.6} KCT",
        payload.node_id, payload.job_id, payload.work_units, month, reward_kct
    );

    StatusCode::OK
}

async fn list_proofs(State(state): State<AppState>) -> Json<Vec<ProofRecord>> {
    let list = state.proofs.lock().unwrap();
    Json(list.clone())
}

async fn health() -> &'static str {
    "OK"
}

async fn reward_preview(Json(req): Json<RewardRequest>) -> Json<RewardResponse> {
    let month = req.month.clamp(1, TOTAL_MONTHS);
    let block_reward = block_reward_for_month(month);
    let monthly_emission = monthly_emission_for_month(month);

    let notes = format!(
        "KCT emission preview for month {} (start 200 KCT, 1% monthly decay over 14 years).",
        month
    );

    Json(RewardResponse {
        month,
        block_reward_kct: block_reward,
        monthly_emission_kct: monthly_emission,
        notes,
    })
}

async fn investor_value_flow(Query(q): Query<InvestorQuery>) -> Json<InvestorResponse> {
    let years = q.years.max(1).min(30);
    let mut gross = 0.0;
    let mut investor = 0.0;
    let mut npv = 0.0;

    let mut fee = q.fee_annual.max(0.0);
    for t in 1..=years {
        if t > 1 {
            fee *= 1.0 + q.growth;
        }

        let cf_gross = fee;
        let cf_investor = cf_gross * q.investor_pct;

        gross += cf_gross;
        investor += cf_investor;

        let disc_factor = (1.0 + q.discount).powi(t as i32);
        npv += cf_investor / disc_factor;
    }

    let avg_investor = if years > 0 { investor / years as f64 } else { 0.0 };
    let base = q.fee_annual.max(1.0);
    let apy_estimate = (avg_investor / base).max(0.0);

    Json(InvestorResponse {
        years,
        gross_sum: gross,
        investor_sum: investor,
        npv_investor: npv,
        apy_estimate,
    })
}

// -------------------------
// MAIN
// -------------------------

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt::init();

    // statische Dashboard-Dateien
    let static_dir = ServeDir::new("testnet-launcher/public");

    // State initialisieren
    let registry: NodeRegistry = Arc::new(Mutex::new(HashMap::new()));
    let proofs: ProofStore = Arc::new(Mutex::new(Vec::new()));

    let state = AppState { registry, proofs };

    let app = Router::new()
        .route("/health", get(health))
        .route("/reward/preview", post(reward_preview))
        .route("/investor/value_flow", get(investor_value_flow))
        .route("/node/heartbeat", post(node_heartbeat))
        .route("/nodes", get(list_nodes))
        .route("/node/proof", post(submit_proof))
        .route("/proofs", get(list_proofs))
        .route("/", get(|| async { Redirect::temporary("/dashboard/") }))
        .nest_service("/dashboard", static_dir)
        .with_state(state);

    // Port lokal (8080) oder von Render (PORT)
    let port: u16 = std::env::var("PORT")
        .unwrap_or_else(|_| "8080".to_string())
        .parse()
        .expect("PORT must be a number");
    let addr: SocketAddr = format!("0.0.0.0:{}", port).parse().unwrap();

    let listener = TcpListener::bind(addr).await?;
    println!(
        "KASCompute Testnet Launcher running at http://127.0.0.1:{}/dashboard/",
        port
    );

    axum::serve(listener, app).await?;

    Ok(())
}
