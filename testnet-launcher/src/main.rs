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
use ed25519_dalek::{Signature, VerifyingKey};
use ed25519_dalek::ed25519::signature::Verifier;

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

/// Gesamt-Emission in Monat m (nur Info, wird im JSON mit ausgegeben)
fn monthly_emission_for_month(month: u32) -> f64 {
    block_reward_for_month(month) * BLOCKS_PER_MONTH
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
// NODE REGISTRY + HEARTBEATS
// -------------------------

#[derive(Clone, Debug, Deserialize, Serialize)]
struct NodeHeartbeat {
    node_id: String,
    public_key_hex: String,
    compute_profile: String,
    timestamp_unix: Option<u64>,
    signature_hex: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
struct NodeRegistryEntry {
    node_id: String,
    public_key_hex: String,
    compute_profile: String,
    last_seen_unix: u64,
    compute_score: u64, // einfacher „Compute Score“
}

type NodeRegistry = Arc<Mutex<HashMap<String, NodeRegistryEntry>>>;

async fn node_heartbeat(
    State(registry): State<NodeRegistry>,
    Json(payload): Json<NodeHeartbeat>,
) -> StatusCode {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();

    // --- Signaturprüfung (wenn Daten vorhanden sind) ----
    if let (Some(ts), Some(sig_hex)) = (payload.timestamp_unix, payload.signature_hex.clone()) {
        // einfache Anti-Replay-Regel: max. +/- 120 Sekunden
        let diff = if now >= ts { now - ts } else { ts - now };
        if diff > 120 {
            eprintln!(
                "[BACKEND] Rejected heartbeat from {}: timestamp too far in the past/future (diff={}s)",
                payload.node_id, diff
            );
            return StatusCode::UNAUTHORIZED;
        }

        // Message genauso bauen wie im Node-Launcher
        let msg = format!("{}|{}|{}", payload.node_id, payload.compute_profile, ts);
        let msg_bytes = msg.as_bytes();

        // Public Key aus Hex
        let pk_bytes = match hex::decode(&payload.public_key_hex) {
            Ok(b) => b,
            Err(e) => {
                eprintln!(
                    "[BACKEND] Invalid public_key_hex from {}: {e}",
                    payload.node_id
                );
                return StatusCode::BAD_REQUEST;
            }
        };

        // Signature aus Hex
        let sig_bytes = match hex::decode(&sig_hex) {
            Ok(b) => b,
            Err(e) => {
                eprintln!(
                    "[BACKEND] Invalid signature_hex from {}: {e}",
                    payload.node_id
                );
                return StatusCode::BAD_REQUEST;
            }
        };

        if pk_bytes.len() != 32 || sig_bytes.len() != 64 {
            eprintln!(
                "[BACKEND] Wrong key/signature length from {}",
                payload.node_id
            );
            return StatusCode::BAD_REQUEST;
        }

        // VerifyingKey für ed25519-dalek v2
        let pk = match VerifyingKey::try_from(&pk_bytes[..]) {
            Ok(pk) => pk,
            Err(e) => {
                eprintln!(
                    "[BACKEND] Invalid public key from {}: {e}",
                    payload.node_id
                );
                return StatusCode::BAD_REQUEST;
            }
        };

        // Signature für ed25519-dalek v2
        let sig = match Signature::try_from(&sig_bytes[..]) {
            Ok(s) => s,
            Err(e) => {
                eprintln!(
                    "[BACKEND] Invalid signature from {}: {e}",
                    payload.node_id
                );
                return StatusCode::BAD_REQUEST;
            }
        };

        // Signatur verifizieren
        if let Err(e) = pk.verify(msg_bytes, &sig) {
            eprintln!(
                "[BACKEND] BAD SIGNATURE from {}: {e}",
                payload.node_id
            );
            return StatusCode::UNAUTHORIZED;
        }
    } else {
        // Kein Timestamp / keine Signatur → wir akzeptieren es noch,
        // loggen aber, dass es unsigniert ist.
        eprintln!(
            "[BACKEND] Unsigned heartbeat from {} (legacy mode)",
            payload.node_id
        );
    }

    // --- Wenn wir hier sind, ist entweder alles valid oder legacy erlaubt ---

    let mut map = registry.lock().unwrap();

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
        "[BACKEND] Heartbeat from node {} | mode={} | score={} | last_seen={}",
        entry.node_id, entry.compute_profile, entry.compute_score, entry.last_seen_unix
    );

    StatusCode::OK
}

async fn list_nodes(State(registry): State<NodeRegistry>) -> Json<Vec<NodeRegistryEntry>> {
    let map = registry.lock().unwrap();
    let mut nodes: Vec<NodeRegistryEntry> = map.values().cloned().collect();

    // nur fürs schöne: nach Node-ID sortieren
    nodes.sort_by(|a, b| a.node_id.cmp(&b.node_id));

    Json(nodes)
}

// -------------------------
// HANDLER (EMISSION / INVESTOR)
// -------------------------

async fn health() -> &'static str {
    "OK"
}

// ECHTES KCT-EMISSIONSMODELL, KEIN DEMO
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

// einfacher, aber realistischer Investor-Cashflow (KEIN „Demo“-Label)
async fn investor_value_flow(Query(q): Query<InvestorQuery>) -> Json<InvestorResponse> {
    let years = q.years.max(1).min(30);
    let mut gross_sum = 0.0;
    let mut investor_sum = 0.0;
    let mut npv = 0.0;

    let mut fee = q.fee_annual.max(0.0);
    let investor_pct = q.investor_pct.clamp(0.0, 1.0);
    let growth = q.growth.max(0.0);
    let discount = q.discount.max(0.0);

    for t in 1..=years {
        if t > 1 {
            fee *= 1.0 + growth;
        }

        let cf_gross = fee;
        let cf_investor = cf_gross * investor_pct;

        gross_sum += cf_gross;
        investor_sum += cf_investor;

        let disc_factor = (1.0 + discount).powi(t as i32);
        npv += cf_investor / disc_factor;
    }

    // Grobe APY-Schätzung: durchschn. Investor-CF / erste Fee
    let avg_investor = investor_sum / years as f64;
    let base = q.fee_annual.max(1.0);
    let apy_estimate = (avg_investor / base).max(0.0);

    Json(InvestorResponse {
        years,
        gross_sum,
        investor_sum,
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

    // gemeinsame Node-Registry für Heartbeats
    let registry: NodeRegistry = Arc::new(Mutex::new(HashMap::new()));

    let app = Router::new()
        // API-Routen
        .route("/health", get(health))
        .route("/reward/preview", post(reward_preview))
        .route("/investor/value_flow", get(investor_value_flow))
        .route("/node/heartbeat", post(node_heartbeat)) // Node sendet Heartbeats
        .route("/nodes", get(list_nodes))               // Dashboard listet Nodes
        // Root -> Dashboard
        .route("/", get(|| async { Redirect::temporary("/dashboard/") }))
        // Dashboard unter /dashboard
        .nest_service("/dashboard", static_dir)
        // State anhängen
        .with_state(registry);

    // Port lokal (8080) oder von Railway (PORT)
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
