use axum::{
    extract::Query,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::{env, fs};
use tower_http::services::ServeDir;

const TOKEN_CONFIG_PATH: &str = "testnet/config.json";

#[derive(Serialize, Deserialize, Clone)]
struct TokenConfig {
    name: String,
    symbol: String,
    total_supply: u64,
    decimals: u8,
    mining_years: u32,
    mining_start_year: u32,
    mining_end_year: u32,
    mining_end_month: u8,
    emission_model: String,
    treasury_pct: f64,
    investor_pct: f64,
    community_pct: f64,
}

fn default_token_config() -> TokenConfig {
    TokenConfig {
        name: "KASCompute Token".to_string(),
        symbol: "KCT".to_string(),
        total_supply: 10_000_000_000,
        decimals: 8,
        mining_years: 14,
        mining_start_year: 2025,
        mining_end_year: 2039,
        mining_end_month: 1,
        emission_model: "Kaspa anchored slow decay".to_string(),
        treasury_pct: 0.20,
        investor_pct: 0.10,
        community_pct: 0.70,
    }
}

fn load_token_config() -> TokenConfig {
    if let Ok(text) = fs::read_to_string(TOKEN_CONFIG_PATH) {
        if let Ok(cfg) = serde_json::from_str::<TokenConfig>(&text) {
            return cfg;
        }
        eprintln!("WARN: Failed parsing config.json, using default.");
    } else {
        eprintln!("WARN: config.json missing, using default.");
    }
    default_token_config()
}

async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "status": "ok" }))
}

// ---------------- Reward Preview ----------------

#[derive(Deserialize)]
struct RewardPreviewRequest {
    month: u32,
}

#[derive(Serialize)]
struct RewardPreviewResponse {
    month: u32,
    block_reward_kct: f64,
    notes: String,
}

async fn reward_preview(Json(req): Json<RewardPreviewRequest>) -> Json<RewardPreviewResponse> {
    let base_reward = 1_000_000.0;
    let decay = 0.98_f64.powf(req.month as f64);
    let reward = base_reward * decay;

    Json(RewardPreviewResponse {
        month: req.month,
        block_reward_kct: reward,
        notes: format!("Demo emission preview for month {}", req.month),
    })
}

// ---------------- Investor Flow ----------------

#[derive(Deserialize)]
struct InvestorQuery {
    fee_annual: f64,
    investor_pct: f64,
    years: u32,
    growth: f64,
    discount: f64,
}

#[derive(Serialize)]
struct InvestorValueResponse {
    years: u32,
    gross_sum: f64,
    investor_sum: f64,
    npv_investor: f64,
    apy_estimate: f64,
}

async fn investor_value_flow(Query(q): Query<InvestorQuery>) -> Json<InvestorValueResponse> {
    let mut gross = 0.0;
    let mut inv_total = 0.0;
    let mut npv = 0.0;
    let mut fee = q.fee_annual;

    for year in 0..q.years {
        gross += fee;
        let inv_y = fee * q.investor_pct;
        inv_total += inv_y;

        let df = (1.0 + q.discount).powi(year as i32);
        npv += inv_y / df.max(1.0);

        fee *= 1.0 + q.growth;
    }

    Json(InvestorValueResponse {
        years: q.years,
        gross_sum: gross,
        investor_sum: inv_total,
        npv_investor: npv,
        apy_estimate: 0.0,
    })
}

// ---------------- Token Info ----------------

async fn token_info() -> Json<TokenConfig> {
    Json(load_token_config())
}


// ---------------- MAIN (AXUM 0.7 FIX) ----------------

#[tokio::main]
async fn main() {
    // Static folder for dashboard
    let static_files =
        ServeDir::new("testnet-launcher/public").append_index_html_on_directories(true);

    let app = Router::new()
        .route("/health", get(health))
        .route("/reward/preview", post(reward_preview))
        .route("/investor/value_flow", get(investor_value_flow))
        .route("/token/info", get(token_info))
        .nest_service("/dashboard", static_files);

    // AXUM 0.7: Listener statt Server::bind()
    let port = env::var("PORT").unwrap_or("8080".into());
    let addr = format!("0.0.0.0:{}", port);
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .expect("Could not bind TCP port");

    println!("🔥 KASCompute Testnet Launcher running at http://{}/dashboard/", addr);

    axum::serve(listener, app).await.unwrap();
}
