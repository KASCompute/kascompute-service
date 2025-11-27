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

const START_REWARD_KCT: f64 = 200.0;
const MONTHLY_DECAY: f64 = 0.01;      // 1% pro Monat
const TOTAL_MONTHS: u32 = 168;        // 14 Jahre
const BLOCKS_PER_MINUTE: f64 = 1.0;   // 1 Block / Minute
const MINUTES_PER_MONTH: f64 = 30.0 * 24.0 * 60.0;
const BLOCKS_PER_MONTH: f64 = BLOCKS_PER_MINUTE * MINUTES_PER_MONTH;

fn block_reward_for_month(month: u32) -> f64 {
    // Monat 1 = 200 KCT, danach 1% decay pro Monat
    let m = month.saturating_sub(1) as i32;
    START_REWARD_KCT * (1.0 - MONTHLY_DECAY).powi(m)
}

fn monthly_emission_for_month(month: u32) -> f64 {
    block_reward_for_month(month) * BLOCKS_PER_MONTH
}

// -------------------------
// API MODELS
// -------------------------

#[derive(Debug, Deserialize)]
struct RewardRequest {
    month: u32,
}

#[derive(Debug, Serialize)]
struct RewardResponse {
    month: u32,
    block_reward_kct: f64,
    monthly_emission_kct: f64,
    notes: String,
}

#[derive(Debug, Serialize)]
struct CumulativePoint {
    month: u32,
    monthly_emission_kct: f64,
    cumulative_emission_kct: f64,
}

#[derive(Debug, Serialize)]
struct InvestorValueFlow {
    total_emission_14y_kct: f64,
    mining_share_percent: f64,
    treasury_share_percent: f64,
}

#[derive(Debug, Deserialize, Serialize)]
struct NodeHeartbeat {
    node_id: String,
    public_key_hex: String,
    compute_profile: String,
}

// -------------------------
// HANDLER
// -------------------------

async fn health() -> &'static str {
    "OK"
}

// KCT Emission für einen bestimmten Monat
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

// Gleiche Logik, aber als GET mit Query-Param: /reward/preview?month=1
async fn reward_preview_get(Query(params): Query<RewardRequest>) -> Json<RewardResponse> {
    let month = params.month.clamp(1, TOTAL_MONTHS);
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


// Kumulative Emissionskurve über alle 168 Monate
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

// Sehr einfache Investoren-View (kann später erweitert werden)
async fn investor_value_flow() -> Json<InvestorValueFlow> {
    // grobe Annahme: Gesamt-Emission (Mining) über 168 Monate
    let mut total = 0.0;
    for m in 1..=TOTAL_MONTHS {
        total += monthly_emission_for_month(m);
    }

    Json(InvestorValueFlow {
        total_emission_14y_kct: total,
        mining_share_percent: 90.0,
        treasury_share_percent: 10.0,
    })
}

// Node-Heartbeat für spätere Provider-Logik
async fn node_heartbeat(Json(payload): Json<NodeHeartbeat>) -> StatusCode {
    println!(
        "[BACKEND] Heartbeat from node {} | pk={} | mode={}",
        payload.node_id, payload.public_key_hex, payload.compute_profile
    );
    StatusCode::OK
}

// -------------------------
// MAIN / ROUTER
// -------------------------

#[tokio::main]
async fn main() -> Result<()> {
    // Statische Dateien (Dashboard)
    let static_dir = ServeDir::new("testnet-launcher/public");

    let app = Router::new()
        // API-Routen
        .route("/health", get(health))
        .route("/node/heartbeat", post(node_heartbeat))
        .route("/reward/preview",get(reward_preview_get).post(reward_preview),)
        .route("/reward/cumulative", get(reward_cumulative))
        .route("/investor/value_flow", get(investor_value_flow))
        // Root -> Dashboard
        .route("/", get(|| async { Redirect::temporary("/dashboard/") }))
        // Dashboard unter /dashboard
        .nest_service("/dashboard", static_dir);

    // Port aus ENV oder Default 8080 (Railway-kompatibel)
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
