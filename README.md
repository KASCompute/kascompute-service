<p align="center">
  <img src="assets/logo.png" width="200" alt="KASCompute Logo"/>
</p>

<h1 align="center">⚡ KASCompute — Decentralized Compute Layer Prototype on Kaspa</h1>

<p align="center">
  <strong>Live Proof-of-Compute. Real-time nodes. Workload simulation. Full tokenomics engine.</strong><br>
  <strong>Custom-built from scratch. Powered by Kaspa’s BlockDAG.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Rust-1.74%2B-brown" />
  <img src="https://img.shields.io/badge/Axum-0.7-blue" />
  <img src="https://img.shields.io/badge/ComputeLayer-PoC-orange" />
  <img src="https://img.shields.io/badge/Kaspa-BlockDAG-green" />
  <img src="https://img.shields.io/badge/License-MIT-yellow" />
</p>

---

# 🧬 What is KASCompute?

**KASCompute** is a prototype for a *future decentralized compute layer*  
built on top of the **Kaspa BlockDAG**.

It demonstrates:

- Real-time node heartbeat system  
- Proof-of-Compute (PoC) submissions  
- Job grouping & workload simulation  
- CPU/GPU hardware profiling  
- Reward estimation engine (KCT)  
- 14-year emission model (1% monthly decay)  
- Global state engine (nodes • proofs • jobs • rewards)  
- Fully interactive dashboard  
- Investor & treasury simulation  

> 🚫 **Not a fork.**  
> 🔥 100% custom-built compute-layer concept.

---

# 🏗 Core Architecture

```text
 Kaspa Layer 1 (BlockDAG)
          │
          ▼
 KASCompute Coordinator (API Engine)
          │
   ┌──────┼────────┐
   │      │        │
Heartbeat  Jobs   PoC Validation
(Node)    work    Rewards
          │
          ▼
  KASCompute State Engine
          │
          ▼
 Frontend Dashboard (Real-Time UI)

🔥 Proof-of-Compute Flow
text
Code kopieren
CPU/GPU Node
   │ heartbeat
   ▼
Coordinator
   │ job assignment
   ▼
Work Execution (work_units)
   │ submit proof
   ▼
PoC Validator + Reward Engine
   │ validate + reward_kct
   ▼
Global State Engine
   │ update network state
   ▼
Dashboard UI (PoC feed, jobs, rewards, leaderboard)

🖥 Live Testnet Dashboard
🔗 https://kascompute-testnet.onrender.com/dashboard/
Displays:

PoC feed (real-time)

Node activity + last heartbeat

Recent jobs grouped by workload

Work units + rewards

Network compute map

Hardware detection (CPU/GPU)

Emission & reward preview

Treasury unlock simulation

Investor value flow

Leaderboard

💎 KCT Token Emission Model
Total Supply: 10,000,000,000 KCT
Mining: 9,000,000,000 (90%)
Treasury: 1,000,000,000 (10%)

Emission Formula
powershell
Code kopieren
R(m) = 200 * 0.99^(m - 1)
Highlights
Start reward: 200 KCT/block

Monthly decay: 1%

Duration: 168 months (14 years)

Block time: 1 minute

Fully visualized in dashboard

🔌 API Endpoints
Health
http
Code kopieren
GET /health
Reward Preview
http
Code kopieren
POST /reward/preview
{
  "month": 12
}
Emission Curve
http
Code kopieren
GET /emission/monthly
Investor Value Flow
http
Code kopieren
GET /investor/value_flow?fee_annual=100000&investor_pct=0.1&years=10&growth=0.1&discount=0.05

🧩 Project Structure
text
Code kopieren
kascompute-service/
├── src/                     # Core backend (Rust / Axum)
├── testnet-launcher/        # Production launcher (Render)
│   ├── src/main.rs          # PoC validator & state engine
│   └── public/              # Live dashboard (index.html, app.js, style.css)
├── assets/                  # Logos, diagrams, visuals
├── public/                  # Optional static site assets
├── scripts/                 # Deployment helpers
└── tests/                   # Placeholder tests

🎨 Dashboard Styling (SCSS)
scss
Code kopieren
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

🚀 Run Locally
bash
Code kopieren
cargo run
Dashboard:

arduino
Code kopieren
http://127.0.0.1:8080/dashboard/

🚀 Deploy (Render)
Build:

bash
Code kopieren
cargo build --release --package testnet-launcher
Run:

bash
Code kopieren
./target/release/testnet-launcher

🧭 Roadmap
✅ Completed
PoC validation

Node heartbeat

Job grouping

State engine

Token emission model

Dashboard

Investor simulation

Architecture diagrams

🔜 Coming Next
Node scoring & reputation

Real workload distribution

Multi-node routing

Developer SDK

Whitepaper v2

Compute provider marketplace

🧑‍💻 Author
KASCompute Team — Founder: Tarik Kaya
Built with 💚 on Kaspa.

Website: https://kascompute.org
X: https://x.com/KASCompute
Telegram: https://t.me/KASCompute