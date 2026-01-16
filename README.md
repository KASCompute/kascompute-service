<p align="center">
  <img src="assets/kascompute-banner-animated-v2.gif" width="100%" />
</p>

<h1 align="center">⚡ KASCompute — Off-Chain Compute Layer aligned for Kaspa vProgs</h1>

<p align="center">
  <strong>Cryptographic Proof-of-Compute • Real-Time Nodes • vProgs-Aligned • Kaspa BlockDAG Native</strong>
</p>

<p align="center">
  <a href="https://github.com/KASCompute/kascompute-service/stargazers">
    <img src="https://img.shields.io/github/stars/KASCompute/kascompute-service?style=flat&color=00E3C0"/>
  </a>
  <a href="https://github.com/KASCompute/kascompute-service/issues">
    <img src="https://img.shields.io/github/issues/KASCompute/kascompute-service?style=flat"/>
  </a>
  <img src="https://img.shields.io/badge/Rust-1.74%2B-brown"/>
  <img src="https://img.shields.io/badge/Tauri-Desktop-blue"/>
  <img src="https://img.shields.io/badge/Kaspa-BlockDAG-00E3C0"/>
  <img src="https://img.shields.io/badge/License-MIT-yellow"/>
</p>

---

## 🧬 What is KASCompute?

**KASCompute** is an experimental **off-chain compute layer** designed to align with  
**Kaspa’s upcoming vProgs execution and settlement model**.

It explores how decentralized compute can be:
- **measured**
- **proven cryptographically**
- **tracked in real-time**
- and later **settled on Kaspa**

### What already works today

-⚙️ Node & miner processes (desktop launcher)
- 📡 Heartbeat-based presence (single source of truth)
- 🧮 Job scheduling (`/jobs/next`)
- 🔐 **Cryptographic Proof-of-Compute**
  - deterministic payload
  - SHA-256 hash
  - Ed25519 signature
- 📤 Proof submission (`/jobs/proof`)
- 🖥 Live dashboard (nodes, uptime, proofs)
- 📊 Structured miner proofs streamed into UI

> **Important:**  
> All cryptography is real.  
> Proofs are hashable, signable, and verifiable.

---

## 🔒 Official Project Notice

This repository represents the **official KASCompute project**.

Official sources:
- 🌐 Website: https://kascompute.org  
- 💻 GitHub: https://github.com/KASCompute  
- 🖥 Dashboard: https://dashboard.kascompute.org  

The **KASCompute name, logo, branding, and public communication**
are **not covered by the MIT license**.

Forking the code is allowed, but **claiming affiliation with KASCompute is not**.

---

## ⚡ Architecture Overview (vProgs Alignment)

Kaspa L1 (BlockDAG)
└─ Finality & Security

vProgs (Future Execution Layer)
└─ Proof Anchoring
└─ Conditional Settlement

KASCompute (Off-Chain Layer)
├─ Node Heartbeats
├─ Job Scheduling
├─ Proof-of-Compute
├─ Reward / Metrics Engine
└─ Desktop Launcher (Tauri)


🔹 **Today:** off-chain R&D prototype  
🔹 **Future:** trust-minimized settlement via vProgs

---

## 🔐 Proof-of-Compute (Current Design)

Each compute proof consists of:

- Deterministic payload
- SHA-256 hash of payload
- Ed25519 signature over hash
- Public key of node identity

This allows:
- offline verification
- replay protection
- future on-chain anchoring

> No ZK yet.  
> Designed to be **ZK-ready** once vProgs is live.

---

## 💠 KCT Emission Model (Concept)

| Parameter       | Value            |
|-----------------|------------------|
| Total Supply    | 10B KCT          |
| Mining          | 9B (90%)         |
| Treasury        | 1B (10%)         |
| Start Reward    | 200 KCT / block  |
| Decay           | 1% monthly       |
| Duration        | ~14 years        |

Formula:R(m) = 200 * 0.99^(m - 1)


---

## 🖥 Live Dashboard (Prototype)

🔗 https://dashboard.kascompute.org

- Node presence & uptime
- Proof stream (real cryptographic data)
- Work units & performance
- Emission modeling
- Leaderboards

> Prototype. Parameters may evolve.

---

## 🏗 Repository Structure

kascompute-service/
├─ launcher/ # Tauri desktop launcher (Node + Miner)
├─ protocol-v1/ # Protocol V1 backend & API
├─ assets/ # Branding, banners, diagrams
├─ docs/ # Architecture & research notes
└─ scripts/ # Tooling & deployment helpers


Each major component is developed independently but aligned by protocol.

---

## 🚀 Roadmap

### 🟢 Current
- Protocol V1 live
- Cryptographic PoC
- Desktop launcher
- Real-time dashboard

### 🟡 Next
- Proof verification endpoints
- Node scoring & reputation
- Job pricing & fairness
- Developer documentation

### 🟣 Future (vProgs)
- Proof anchoring
- On-chain settlement
- Trust-minimized compute lifecycle

---

##⚠️ Disclaimer

Research prototype.  
Not financial advice.  
No guarantee of economics or timelines.

---

## 📫 Contact

🌐 https://kascompute.org  
🐦 https://x.com/KASCompute  
💬 https://t.me/KASCompute  

Founder: **Tarik Kaya**  
Built with ⚡ & 💚 on Kaspa.
