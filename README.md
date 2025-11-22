<p align="center">
  <img src="assets/logo.png" width="200" alt="KASCompute Logo"/>
</p>

<h1 align="center">KASCompute — KCT Emission Engine & Live Tokenomics Dashboard</h1>

<p align="center">
  <strong>Fully transparent. Open-source. Powered by Kaspa.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Rust-1.74+-brown" />
  <img src="https://img.shields.io/badge/Axum-0.7-blue" />
  <img src="https://img.shields.io/badge/Kaspa-blockDAG-green">
  <img src="https://img.shields.io/badge/License-MIT-yellow" />
</p>

---

# 🌐 About KASCompute

**KASCompute** is building a decentralized compute layer on top of the Kaspa ecosystem.  
The goal: turn idle CPUs & GPUs into a global, trustless compute marketplace —  
transparent, fast and verifiable.

This repository contains:

- The **KCT emission backend** (Rust / Axum)
- The **live tokenomics dashboard** (HTML / JS / Charts)
- The **endpoint logic** powering the official KASCompute website
- The **mathematical emission model** for the KASCompute Token (KCT)

Everything here is **100% open-source** and part of the foundation for the protocol.

---

# 🔢 KCT Token Emission Model (Official)

**Total Supply:** `10,000,000,000 KCT`  
**Mining Supply:** `9,000,000,000 KCT` (90%)  
**Treasury:** `1,000,000,000 KCT` (10%)

**Emission Parameters:**

| Parameter | Value |
|----------|--------|
| Start Reward | **200 KCT per block** |
| Monthly Decay | **1%** (0.99 multiplier) |
| Duration | **14 years (168 months)** |
| Block Time | **1 minute** |
| Reward Formula | `R(m) = 200 * 0.99^(m-1)` |

### 📈 Emission Preview Example
- Month 1 → **200.00 KCT**
- Month 2 → **198.00 KCT**
- Month 12 → **178.48 KCT**
- Month 168 → **37.33 KCT**

The dashboard visualizes the full curve.

---

# 🏗 Project Structure

```bash
kascompute-service/
├── Cargo.toml                # Rust package manifest (kascompute-service)
├── Cargo.lock
├── src/
│   └── main.rs               # Main Axum backend (serves API + dashboard)
│
├── testnet-launcher/         # Secondary binary (Railway launcher)
│   ├── Cargo.toml
│   ├── src/
│   │   └── main.rs           # Mirrors main.rs logic for deployments
│   └── public/
│       ├── index.html        # Tokenomics dashboard UI
│       ├── app.js            # Frontend logic + API integration
│       └── style.css         # Styling / KASCompute theme
│
└── public/                   # Website assets (optional)
🔌 API Endpoints
Health Check


GET /health
Reward Preview


POST /reward/preview
Content-Type: application/json

{ "month": 12 }
Returns:



{
  "month": 12,
  "block_reward_kct": 178.48,
  "notes": "KCT emission preview for month 12 (start 200 KCT, 1% monthly decay over 14 years)."
}
Monthly Emission Curve (1 → 168)


GET /emission/monthly
Example:



[
  { "month": 1, "block_reward_kct": 200.0 },
  { "month": 2, "block_reward_kct": 198.0 },
  ...
  { "month": 168, "block_reward_kct": 37.33 }
]
Investor Value Flow (Post-Mining)


GET /investor/value_flow?fee_annual=100000&investor_pct=0.1&years=10&growth=0.1&discount=0.05

💻 Running Locally
Prerequisites
Rust (stable)

Cargo

Start server


cargo run
Dashboard available at:



http://127.0.0.1:8080/dashboard/

🚀 Deployment (Railway)
Build command:



cargo build --release --package testnet-launcher
Start command:



./target/release/testnet-launcher
Dashboard embed snippet:



<iframe src="https://kascompute.up.railway.app/dashboard/"
        style="width: 100%; height: 100vh; border: none;">
</iframe>

🧩 Roadmap (Public Repository Scope)
 ✅Real KCT emission model

 ✅Reward preview API

 ✅Monthly emission API

 ✅Live dashboard

 Cumulative emission model

 Treasury unlock curve

 APY scenario tools

 Provider / Node metrics

 Whitepaper integration

⚠️ Disclaimer
This repository is for research and development.
Nothing here is financial advice or an economic guarantee.
Parameters may evolve as the protocol matures.

📫 Contact
Website: https://kascompute.org

X/Twitter: https://x.com/KASCompute

Telegram: https://t.me/KASCompute

Built with 💚 on Kaspa.