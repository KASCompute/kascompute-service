use axum::{
    extract::Query,
    routing::{get, post},
    response::Redirect,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use tokio::net::TcpListener;
use tower_http::services::ServeDir;
use anyhow::Result;
use axum::http::StatusCode;


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

#[derive(Serialize)]
struct CumulativePoint {
    month: u32,
    monthly_emission_kct: f64,
    cumulative_emission_kct: f64,
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
// HANDLER
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

/// Kumulative Emissionskurve über alle 168 Monate
async fn reward_cumulative() -> Json<Vec<CumulativePoint>> {
    let mut points = Vec::new();
    let mut cumulative = 0.0;

    for month in 1..=TOTAL_MONTHS {
        let monthly = monthly_emission_for_month(month);
        cumulative += monthly;

        points.push(CumulativePoint {
            month,
            monthly_emission_kct: monthly,
            cumulative_emission_kct: cumulative,
        });
    }

    Json(points)
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

#[derive(Debug, Deserialize, Serialize)]
struct NodeHeartbeat {
    node_id: String,
    public_key_hex: String,
    compute_profile: String,
}

async fn node_heartbeat(Json(payload): Json<NodeHeartbeat>) -> StatusCode {
    println!(
        "[BACKEND] Heartbeat from node {} | pk={} | mode={}",
        payload.node_id, payload.public_key_hex, payload.compute_profile
    );
    StatusCode::OK
}


#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt::init();

    // statische Dashboard-Dateien
    let static_dir = ServeDir::new("testnet-launcher/public");

    let app = Router::new()
    // API-Routen
    .route("/node/heartbeat", post(node_heartbeat))
    .route("/health", get(health))
    .route("/reward/preview", post(reward_preview))
    .route("/reward/cumulative", get(reward_cumulative))
    .route("/investor/value_flow", get(investor_value_flow))
    // Root -> Dashboard
    .route("/", get(|| async { Redirect::temporary("/dashboard/") }))
    // Dashboard unter /dashboard
    .nest_service("/dashboard", static_dir);

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
