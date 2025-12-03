<p align="center">
  <img src="assets/logo.png" width="200" alt="KASCompute Logo"/>
</p>

<h1 align="center">KASCompute — Decentralized Compute Layer Prototype on Kaspa</h1>

<p align="center">
  <strong>Real-time nodes. Proof-of-Compute. Workload simulation. Full tokenomics engine.</strong><br>
  <strong>100% open-source. Powered by the Kaspa BlockDAG.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Rust-1.74+-brown" />
  <img src="https://img.shields.io/badge/Axum-0.7-blue" />
  <img src="https://img.shields.io/badge/Kaspa-BlockDAG-green">
  <img src="https://img.shields.io/badge/License-MIT-yellow" />
</p>

---

# 🌐 Overview

**KASCompute** is a conceptual decentralized compute layer built on top of the **Kaspa ecosystem**.

This prototype demonstrates:

- 🟢 Node heartbeat system  
- 🔵 Proof-of-Compute (PoC) submission & validation  
- 🟣 Job grouping (workloads grouped by `job_id`)  
- 🟡 Reward estimation engine (KCT)  
- 🔥 Global state engine (nodes, proofs, jobs, rewards, emission)  
- 📡 Real-time compute dashboard (HTML / JS / CSS)  
- 📈 Full KCT token emission model  
- 💰 Investor value & treasury simulation  

Everything is custom-built from scratch — **not a fork**.

---

# 🧠 Architecture (High-Level)

```text
           Kaspa Layer 1 (BlockDAG)
                     │
                     ▼
        KASCompute Coordinator (API Engine)
                     │
      ┌──────────────┼───────────────┐
      │              │               │
Heartbeat       Job Execution     PoC Validator
(Node)          work_units        Reward Engine
                     │
                     ▼
           KASCompute State Engine
                     │
                     ▼
           Frontend Dashboard (UI)

.network-panel {
  background: #0c0c0c;
  border: 2px solid #00E3C0;
  padding: 20px;
  border-radius: 12px;

  .title {
    color: #00E3C0;
    font-size: 22px;
    margin-bottom: 10px;
    font-weight: 600;
  }

  .metric {
    font-size: 16px;
    color: #ffffff;
    margin: 4px 0;
  }

  .value {
    color: #00E3C0;
    font-weight: bold;
  }
}


💎 KCT Token Emission Model

Total Supply: 10,000,000,000 KCT
Mining Allocation: 9,000,000,000 KCT (90%)
Treasury: 1,000,000,000 KCT (10%)

Emission Parameters:

Parameter	Value
Start Reward	200 KCT per block
Monthly Decay	1% (0.99 multiplier)
Duration	14 years (~168 months)
Block Time	1 minute

Reward formula: R(m) = 200 * 0.99^(m - 1)
The emission engine and dashboard visualize:

monthly block reward

cumulative emission

mining vs. treasury split

long-term supply behavior


🖥 Live Testnet Dashboard

Live Dashboard:
https://kascompute-testnet.onrender.com/dashboard/

The dashboard shows:

Active nodes & last heartbeat

Proof-of-Compute feed

Recent jobs (grouped by job_id)

Work units & estimated rewards

Emission & reward preview

Investor value flow simulation

Treasury vesting model

Network compute overview & leaderboard

🔌 API Endpoints

Note: endpoints may evolve as the prototype matures.

Health
GET /health

Reward Preview
POST /reward/preview
Content-Type: application/json

{
  "month": 12
}

Example response:

{
  "month": 12,
  "block_reward_kct": 178.48,
  "notes": "KCT emission preview for month 12 (start 200 KCT, 1% monthly decay over 14 years)."
}

Monthly Emission Curve (1 → 168)
GET /emission/monthly

Example (truncated):

[
  { "month": 1, "block_reward_kct": 200.0 },
  { "month": 2, "block_reward_kct": 198.0 },
  ...
  { "month": 168, "block_reward_kct": 37.33 }
]

Investor Value Flow (Post-Mining)
GET /investor/value_flow?fee_annual=100000&investor_pct=0.1&years=10&growth=0.1&discount=0.05

🏗 Project Structure
kascompute-service/
├── src/                     # Main Rust service (local backend)
├── testnet-launcher/        # Testnet launcher for deployment (Render)
│   ├── src/main.rs          # Coordinator API & state engine
│   └── public/              # Live dashboard (index.html, app.js, style.css)
├── public/                  # Website / landing assets (optional)
├── assets/                  # Branding / logos / diagrams
├── scripts/                 # Helper scripts (deployment / local tools)
├── configs/                 # Reserved for future configs
└── tests/                   # Placeholder for future tests

Important:
The live dashboard used in production is:
testnet-launcher/public/index.html, app.js, style.css.

💻 Running Locally
Prerequisites

Rust (stable)

Cargo

Start backend
cargo run


Dashboard (default):

http://127.0.0.1:8080/dashboard/

🚀 Deployment (Render)
Build
cargo build --release --package testnet-launcher

Start
./target/release/testnet-launcher


Live dashboard:

https://kascompute-testnet.onrender.com/dashboard/

🧩 Roadmap (Public Repository Scope)
✅ Implemented

KCT emission model (14-year schedule)

Reward preview API

Monthly emission API

Live dashboard

Cumulative emission model

Treasury unlock curve

Investor value flow simulation

Node heartbeat & PoC submission

Job aggregation & recent jobs view

Network compute overview & leaderboard

Architecture diagrams (PoC and DAG-style)

🔜 Planned

Node scoring & reputation

Real job distribution (beyond simulation)

Multi-node workload routing

Extended PoC validation strategies

Developer SDK / client library

Whitepaper v2 integration

⚠️ Disclaimer

This repository is for research and development.
Nothing here is financial advice or an economic guarantee.
All parameters are subject to change as the protocol design evolves.

📫 Contact

Website: https://kascompute.org

X/Twitter: https://x.com/KASCompute

Telegram: https://t.me/KASCompute

KASCompute Team — Founder: Tarik Kaya
Built with 💚 on Kaspa.

