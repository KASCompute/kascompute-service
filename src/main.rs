use axum::{
    extract::Query,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, net::SocketAddr};
use tower_http::services::ServeDir;

// --------------------------------------------------
// 1️⃣ Datentypen
// --------------------------------------------------
#[derive(Deserialize)]
struct MonthRequest {
    month: Option<u32>,
}

#[derive(Serialize)]
struct RewardResponse {
    month: u32,
    block_reward_kct: f64,
    notes: &'static str,
}

#[derive(Deserialize)]
struct InvestorQuery {
    fee_annual: f64,
    investor_pct: f64,
    years: f64,
    growth: f64,
    discount: f64,
}

#[derive(Serialize)]
struct InvestorResponse {
    years: f64,
    gross_sum: f64,
    investor_sum: f64,
    npv_investor: f64,
    apy_estimate: f64,
    notes: &'static str,
}

// --------------------------------------------------
// 2️⃣ API-Endpunkte
// --------------------------------------------------

// Health check
async fn health() -> &'static str {
    "ok"
}

// Reward preview
async fn reward_preview(Json(payload): Json<MonthRequest>) -> impl IntoResponse {
    let m = payload.month.unwrap_or(12);
    let reward = RewardResponse {
        month: m,
        block_reward_kct: (1000.0 / m as f64),
        notes: "TODO: hook to real emission schedule",
    };
    (StatusCode::OK, Json(reward))
}

// Investor value flow
async fn investor_value_flow(Query(params): Query<InvestorQuery>) -> impl IntoResponse {
    let gross = params.fee_annual * params.years;
    let investor_sum = gross * params.investor_pct;
    let npv = investor_sum / (1.0 + params.discount).powf(params.years);
    let apy = params.investor_pct / params.years;

    let response = InvestorResponse {
        years: params.years,
        gross_sum: gross,
        investor_sum,
        npv_investor: npv,
        apy_estimate: apy,
        notes: "TODO: replace with your exact post-mining value model",
    };

    (StatusCode::OK, Json(response))
}

// --------------------------------------------------
// 3️⃣ Hauptprogramm mit Dashboard-Route
// --------------------------------------------------
#[tokio::main]
async fn main() {
    // Pfad zum Frontend (Dashboard)
    let static_dir = std::path::Path::new("testnet-launcher/public");

    // Router mit APIs und Dashboard
    let app = Router::new()
        .route("/health", get(health))
        .route("/reward/preview", post(reward_preview))
        .route("/investor/value_flow", get(investor_value_flow))
        // Dashboard unter /dashboard
        .nest_service("/dashboard", ServeDir::new(static_dir))
        // Root optional weiterleiten
        .nest_service("/", ServeDir::new(static_dir));

    let addr = SocketAddr::from(([0, 0, 0, 0], 8080));
    println!(
        "✅ KASCompute Testnet Launcher started at: http://127.0.0.1:8080/dashboard/"
    );

    axum::Server::bind(&addr)
        .serve(app.into_make_service())
        .await
        .unwrap();
}
