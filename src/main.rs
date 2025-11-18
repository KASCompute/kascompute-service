use axum::{
    extract::Query,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use tower_http::services::ServeDir;
use tokio::net::TcpListener;

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
// 2️⃣ Tokenomics-Parameter (echte Werte)
// --------------------------------------------------
//
// Entspricht deiner configs/tokenomics.yaml:
//  - start_reward_per_block: 200.0
//  - monthly_reduction_pct: 0.01
//  - est_duration_years: 14
//

const START_REWARD_PER_BLOCK: f64 = 200.0;
const MONTHLY_REDUCTION_PCT: f64 = 0.01;
const EMISSION_YEARS: u32 = 14;
const MONTHS_TOTAL: u32 = EMISSION_YEARS * 12;

// --------------------------------------------------
// 3️⃣ API-Endpunkte
// --------------------------------------------------

// Health check für Dashboard
async fn health() -> &'static str {
    "ok"
}

// Reward preview – echte Emissionskurve
async fn reward_preview(Json(payload): Json<MonthRequest>) -> impl IntoResponse {
    // Monat aus Request, clamp auf [1, MONTHS_TOTAL]
    let mut m = payload.month.unwrap_or(12);
    if m < 1 {
        m = 1;
    }
    if m > MONTHS_TOTAL {
        m = MONTHS_TOTAL;
    }

    // Geometrische Abnahme: Start 200 KCT, jeden Monat -1 %
    let reduction_factor = 1.0 - MONTHLY_REDUCTION_PCT;
    let exponent = (m - 1) as i32;
    let block_reward_kct = START_REWARD_PER_BLOCK * reduction_factor.powi(exponent);

    let resp = RewardResponse {
        month: m,
        block_reward_kct,
        notes: "KCT emission: start 200 KCT/block, -1% per month over ~14 years (90% of 10B for mining).",
    };

    (StatusCode::OK, Json(resp))
}

// Investor value flow – Post-Mining-Modell
async fn investor_value_flow(Query(params): Query<InvestorQuery>) -> impl IntoResponse {
    // Eingaben begrenzen
    let years = params.years.clamp(1.0, 40.0);
    let growth = params.growth.max(-0.99);   // max −99 %
    let discount = params.discount.max(0.0); // kein negativer Discount

    let mut gross_sum = 0.0;
    let mut investor_sum = 0.0;
    let mut npv_investor = 0.0;

    // Jahr 1..years: Netzwerk-Fees mit Wachstum, Investor-Cut & Diskontierung
    let mut year = 1.0;
    while year <= years {
        let fee_year = params.fee_annual * (1.0 + growth).powf(year - 1.0);
        let cf_investor = fee_year * params.investor_pct;

        gross_sum += fee_year;
        investor_sum += cf_investor;
        npv_investor += cf_investor / (1.0 + discount).powf(year);

        year += 1.0;
    }

    // Grobe APY-Schätzung aus Nominalsumme vs. NPV
    let apy_estimate = if npv_investor > 0.0 && investor_sum > 0.0 {
        (investor_sum / npv_investor).powf(1.0 / years) - 1.0
    } else {
        0.0
    };

    let response = InvestorResponse {
        years,
        gross_sum,
        investor_sum,
        npv_investor,
        apy_estimate,
        notes: "Post-mining fee model: annual network fees with growth & discount, investor receives a fixed share of fees.",
    };

    (StatusCode::OK, Json(response))
}

// --------------------------------------------------
// 4️⃣ Hauptprogramm + Dashboard-Serving (Axum 0.7)
// --------------------------------------------------

#[tokio::main]
async fn main() {
    // Statisches Dashboard
    let static_dir = std::path::Path::new("testnet-launcher/public");

    let app = Router::new()
        .route("/health", get(health))
        .route("/reward/preview", post(reward_preview))
        .route("/investor/value_flow", get(investor_value_flow))
        .nest_service("/dashboard", ServeDir::new(static_dir))
        .nest_service("/", ServeDir::new(static_dir));

    let addr = "0.0.0.0:8080";
    println!("✅ KASCompute Testnet Launcher running at: http://127.0.0.1:8080/dashboard/");

    let listener = TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
