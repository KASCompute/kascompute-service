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
- 🟣 Job grouping (job_id workload batching)  
- 🟡 Reward estimation engine  
- 🔥 Global state engine (nodes, proofs, jobs, rewards)  
- 📡 Real-time compute dashboard  
- 📈 Full KCT token emission model  
- 💰 Investor value & treasury simulation  

Everything is custom-built from scratch — **not a fork**.

---

# 🧠 Architecture (High-Level)

       Kaspa Layer 1 (BlockDAG)
                 │
                 ▼
    KASCompute Coordinator (API Engine)
                 │
  ┌──────────────┼───────────────┐
  │              │               │
Heartbeat Job Execution PoC Validator
(Node) work_units Reward Engine
│
▼
KASCompute State Engine
│
▼
Frontend Dashboard (UI)


---

# 🎨 SCSS (Dashboard Style Example)

```scss
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
Mining Allocation: 9,000,000,000 KCT
Treasury: 1,000,000,000 KCT

Parameter	Value
Start Reward	200 KCT per block
Monthly Decay	1%
Duration	14 years
Block Time	1 minute

Reward formula: R(m) = 200 * 0.99^(m-1)


🖥 Live Testnet Dashboard

▶ https://kascompute-testnet.onrender.com/dashboard/

Shows:

Node activity

Job table

Proof-of-Compute feed

Emission model

Reward preview

Investor simulation

Leaderboard


🔌 API Endpoints
Health
GET /health

Reward Preview
POST /reward/preview
{
  "month": 12
}

Emission Curve
GET /emission/monthly

Investor Value Flow
GET /investor/value_flow?fee_annual=100000&investor_pct=0.1&years=10&growth=0.1&discount=0.05

🏗 Project Structure
kascompute-service/
├── src/                     # Main Rust backend
├── testnet-launcher/        # Live deployment binary
│   ├── src/main.rs          # Coordinator API & state engine
│   └── public/              # Dashboard UI (index.html, app.js, style.css)
├── assets/                  # Logo, diagrams, visuals
├── scripts/                 # Helper scripts
└── tests/                   # Future tests

💻 Running Locally

Install:

Rust stable

Cargo

Run:

cargo run


Local dashboard:

http://127.0.0.1:8080/dashboard/

🚀 Deployment (Render)

Build:

cargo build --release --package testnet-launcher


Start:

./target/release/testnet-launcher

🧩 Roadmap
✅ Completed

PoC engine

Node heartbeat

State engine

Token emission

Investor simulation

Real-time dashboard

Job aggregation

Architecture diagrams

🔜 Coming next

Node scoring

Real workload routing

Multi-node scheduling

Developer SDK

Whitepaper v2

📫 Contact

Website: https://kascompute.org

X: https://x.com/KASCompute

Telegram: https://t.me/KASCompute

KASCompute Team — Founder: Tarik Kaya
Built with 💚 on Kaspa.
