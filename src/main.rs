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

// -------------------------
// TYPES
// -------------------------

#[derive(Deserialize)]
struct RewardRequest {
    month: u32,
}

#[derive(Serialize)]
struct RewardResponse {
    month: u32,
    block_reward_kct: f64,
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
// HANDLER
// -------------------------

async fn health() -> &'static str {
    "OK"
}

// sehr einfache Emissions-Formel (Demo: 1 % monatliche Reduktion ab 200 KCT)
async fn reward_preview(Json(req): Json<RewardRequest>) -> Json<RewardResponse> {
    let month = if req.month == 0 { 1 } else { req.month.min(168) };

    let r0 = 200.0_f64;
    let decay = 0.99_f64;
    let reward = r0 * decay.powi((month - 1) as i32);

    let notes = format!(
        "Simple 1% monthly decay demo for month {} (start 200 KCT).",
        month
    );

    Json(RewardResponse {
        month,
        block_reward_kct: reward,
        notes,
    })
}

// sehr einfache Investor-Cashflow-Simulation (Demo)
async fn investor_value_flow(Query(q): Query<InvestorQuery>) -> Json<InvestorResponse> {
    let years = q.years.max(1).min(30);
    let mut cashflows = Vec::with_capacity(years as usize);

    let mut fee = q.fee_annual.max(0.0);
    let investor_pct = q.investor_pct.clamp(0.0, 1.0);
    let growth = q.growth.max(0.0);
    let discount = q.discount.max(0.0);

    let mut gross_sum = 0.0;
    let mut investor_sum = 0.0;
    let mut npv = 0.0;

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

        cashflows.push(cf_investor);
    }

    // sehr grobe APY-Schätzung auf Basis von einfacher Durchschnittsrendite
    let avg_investor = if years > 0 { investor_sum / years as f64 } else { 0.0 };
    let base = fee.max(1.0); // nur um Division durch 0 zu vermeiden
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

    // statische Dateien (Dashboard)
    let static_dir = ServeDir::new("testnet-launcher/public");

    let app = Router::new()
        // API
        .route("/health", get(health))
        .route("/reward/preview", post(reward_preview))
        .route("/investor/value_flow", get(investor_value_flow))
        // Root → Dashboard
        .route("/", get(|| async { Redirect::temporary("/dashboard/") }))
        // Dashboard unter /dashboard
        .nest_service("/dashboard", static_dir);

    // Port (lokal 8080, auf Railway aus PORT-Env)
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
