# KASCompute Launcher (Testnet)

The KASCompute Launcher is a desktop app for running a KASCompute Testnet node and/or miner with a clean UI and minimal setup.

## Features
- Start/stop Node, Miner, or both
- Live status + logs
- Bundles required sidecars (node/miner)
- Designed for Testnet onboarding

## Project Structure
- `src-tauri/` – Rust core (process control, sidecar management)
- `src/` – React UI
- `src-tauri/binaries/` – bundled node/miner executables (Windows)

## Development
```bash
cd launcher
npm install
npm run tauri dev
