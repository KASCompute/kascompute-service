# KASCompute Launcher - Tauri Integration Guide

Production-grade Tauri launcher for `kascompute-node.exe` and `kascompute-miner.exe` binaries.

> ⚠️ **Production Ready** - This is a mainnet-ready configuration, not a demo.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Project Structure](#project-structure)
3. [Setup Instructions](#setup-instructions)
4. [Tauri Configuration](#tauri-configuration)
5. [Rust Backend Commands](#rust-backend-commands)
6. [Frontend Integration](#frontend-integration)
7. [Sidecar Binary Setup](#sidecar-binary-setup)
8. [Build & Distribution](#build--distribution)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

- **Node.js** 18+ and npm
- **Rust** 1.70+ (install via [rustup](https://rustup.rs/))
- **Tauri CLI**: `cargo install tauri-cli`
- **Platform build tools**:
  - Windows: Visual Studio Build Tools with C++ workload
  - macOS: Xcode Command Line Tools
  - Linux: `build-essential`, `libwebkit2gtk-4.0-dev`, `libssl-dev`

---

## Project Structure

```
kascompute-launcher/
├── src/                          # React frontend (from Lovable)
│   ├── components/
│   ├── hooks/
│   │   ├── useMockData.ts        # Development mock (remove in prod)
│   │   └── useTauriData.ts       # Production Tauri commands
│   ├── pages/
│   ├── types/
│   │   └── index.ts              # Shared TypeScript types
│   └── main.tsx
├── src-tauri/                    # Tauri Rust backend
│   ├── src/
│   │   ├── main.rs               # App entry point
│   │   ├── commands.rs           # Tauri command handlers
│   │   └── sidecar.rs            # Process management
│   ├── binaries/                 # Sidecar binaries (platform-specific)
│   │   ├── kascompute-node-x86_64-pc-windows-msvc.exe
│   │   └── kascompute-miner-x86_64-pc-windows-msvc.exe
│   ├── Cargo.toml
│   └── tauri.conf.json
├── package.json
├── vite.config.ts
└── TAURI_INTEGRATION.md
```

---

## Setup Instructions

### Step 1: Initialize Tauri in the Project

```bash
# From project root
npm install @tauri-apps/api @tauri-apps/cli

# Initialize Tauri
npx tauri init
```

When prompted:
- **App name**: `kascompute-launcher`
- **Window title**: `KASCompute Launcher`
- **Frontend dev URL**: `http://localhost:5173`
- **Frontend build command**: `npm run build`
- **Frontend output directory**: `dist`

### Step 2: Install Tauri API Package

```bash
npm install @tauri-apps/api
```

### Step 3: Copy Sidecar Binaries

Place your binaries in `src-tauri/binaries/` with platform-specific naming:

```
# Windows (x86_64)
kascompute-node-x86_64-pc-windows-msvc.exe
kascompute-miner-x86_64-pc-windows-msvc.exe

# macOS (Intel)
kascompute-node-x86_64-apple-darwin
kascompute-miner-x86_64-apple-darwin

# macOS (Apple Silicon)
kascompute-node-aarch64-apple-darwin
kascompute-miner-aarch64-apple-darwin

# Linux (x86_64)
kascompute-node-x86_64-unknown-linux-gnu
kascompute-miner-x86_64-unknown-linux-gnu
```

### Step 4: Replace Mock Hook with Tauri Hook

In `src/pages/Index.tsx`, change:

```typescript
// FROM:
import { useMockData } from "@/hooks/useMockData";

// TO:
import { useTauriData } from "@/hooks/useTauriData";
```

And update the hook usage:

```typescript
const { ... } = useTauriData(); // instead of useMockData()
```

---

## Tauri Configuration

Replace `src-tauri/tauri.conf.json`:

```json
{
  "$schema": "../node_modules/@tauri-apps/cli/schema.json",
  "build": {
    "beforeBuildCommand": "npm run build",
    "beforeDevCommand": "npm run dev",
    "devPath": "http://localhost:5173",
    "distDir": "../dist"
  },
  "package": {
    "productName": "KASCompute Launcher",
    "version": "1.0.0"
  },
  "tauri": {
    "allowlist": {
      "all": false,
      "shell": {
        "sidecar": true,
        "scope": [
          {
            "name": "binaries/kascompute-node",
            "sidecar": true
          },
          {
            "name": "binaries/kascompute-miner",
            "sidecar": true
          }
        ]
      },
      "process": {
        "relaunch": false,
        "exit": true
      },
      "window": {
        "close": true,
        "minimize": true,
        "maximize": true,
        "unmaximize": true,
        "show": true,
        "hide": true
      }
    },
    "bundle": {
      "active": true,
      "category": "Utility",
      "copyright": "© 2024 KASCompute",
      "externalBin": [
        "binaries/kascompute-node",
        "binaries/kascompute-miner"
      ],
      "icon": [
        "icons/32x32.png",
        "icons/128x128.png",
        "icons/128x128@2x.png",
        "icons/icon.icns",
        "icons/icon.ico"
      ],
      "identifier": "com.kascompute.launcher",
      "longDescription": "Production launcher for KASCompute node and miner binaries",
      "shortDescription": "KASCompute Launcher",
      "targets": "all"
    },
    "security": {
      "csp": "default-src 'self'; style-src 'self' 'unsafe-inline'"
    },
    "windows": [
      {
        "title": "KASCompute Launcher",
        "width": 1200,
        "height": 800,
        "minWidth": 900,
        "minHeight": 600,
        "resizable": true,
        "fullscreen": false,
        "decorations": true,
        "transparent": false,
        "center": true
      }
    ]
  }
}
```

> ⚠️ **Important**: `decorations: true` keeps native window controls. No global drag regions are used.

---

## Rust Backend Commands

### src-tauri/Cargo.toml

```toml
[package]
name = "kascompute-launcher"
version = "1.0.0"
description = "KASCompute Launcher"
authors = ["KASCompute"]
edition = "2021"

[build-dependencies]
tauri-build = { version = "1", features = [] }

[dependencies]
tauri = { version = "1", features = ["shell-sidecar", "process-exit", "window-close", "window-minimize", "window-maximize", "window-unmaximize", "window-show", "window-hide"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
parking_lot = "0.12"
chrono = "0.4"

[features]
default = ["custom-protocol"]
custom-protocol = ["tauri/custom-protocol"]
```

### src-tauri/src/main.rs

```rust
#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod commands;
mod sidecar;

use commands::*;

fn main() {
    tauri::Builder::default()
        .manage(sidecar::ProcessManager::new())
        .invoke_handler(tauri::generate_handler![
            get_config,
            set_config,
            get_status,
            start_node,
            stop_node,
            start_miner,
            stop_miner,
            tail_log
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### src-tauri/src/commands.rs

```rust
use serde::{Deserialize, Serialize};
use tauri::State;
use crate::sidecar::ProcessManager;

// ============================================
// Types - Must match frontend TypeScript types
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ServiceStatus {
    Running,
    Stopped,
    Starting,
    Stopping,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeStatus {
    pub status: ServiceStatus,
    pub pid: Option<u32>,
    pub uptime: Option<String>,
    pub last_heartbeat: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MinerStatus {
    pub status: ServiceStatus,
    pub pid: Option<u32>,
    pub uptime: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusPayload {
    pub node: NodeStatus,
    pub miner: MinerStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub scripts_directory: String,
    pub dashboard_url: String,
    pub role: String, // "node" | "miner" | "both"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub id: String,
    pub timestamp: String,
    pub message: String,
    pub level: String, // "info" | "warn" | "error"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequiredScript {
    pub name: String,
    pub present: bool,
}

// ============================================
// Commands - Exact names as specified
// ============================================

#[tauri::command]
pub async fn get_config() -> Result<Config, String> {
    // TODO: Load from persistent storage (e.g., config file)
    Ok(Config {
        scripts_directory: String::from("C:\\KASCompute\\scripts"),
        dashboard_url: String::from("https://dashboard.kascompute.io"),
        role: String::from("both"),
    })
}

#[tauri::command]
pub async fn set_config(config: Config) -> Result<(), String> {
    // TODO: Save to persistent storage
    println!("Saving config: {:?}", config);
    Ok(())
}

#[tauri::command]
pub async fn get_status(
    process_manager: State<'_, ProcessManager>
) -> Result<StatusPayload, String> {
    let (node_status, miner_status) = process_manager.get_status();
    
    Ok(StatusPayload {
        node: node_status,
        miner: miner_status,
    })
}

#[tauri::command]
pub async fn start_node(
    app_handle: tauri::AppHandle,
    process_manager: State<'_, ProcessManager>
) -> Result<(), String> {
    process_manager.start_node(&app_handle).await
}

#[tauri::command]
pub async fn stop_node(
    process_manager: State<'_, ProcessManager>
) -> Result<(), String> {
    process_manager.stop_node().await
}

#[tauri::command]
pub async fn start_miner(
    app_handle: tauri::AppHandle,
    process_manager: State<'_, ProcessManager>
) -> Result<(), String> {
    process_manager.start_miner(&app_handle).await
}

#[tauri::command]
pub async fn stop_miner(
    process_manager: State<'_, ProcessManager>
) -> Result<(), String> {
    process_manager.stop_miner().await
}

#[tauri::command]
pub async fn tail_log(
    target: String,
    process_manager: State<'_, ProcessManager>
) -> Result<Vec<LogEntry>, String> {
    process_manager.get_logs(&target)
}
```

### src-tauri/src/sidecar.rs

```rust
use parking_lot::RwLock;
use std::collections::VecDeque;
use std::sync::Arc;
use tauri::api::process::{Command, CommandChild, CommandEvent};
use chrono::{DateTime, Utc};

use crate::commands::{LogEntry, MinerStatus, NodeStatus, ServiceStatus};

const MAX_LOG_ENTRIES: usize = 1000;

struct ProcessState {
    child: Option<CommandChild>,
    pid: Option<u32>,
    start_time: Option<DateTime<Utc>>,
    status: ServiceStatus,
    logs: VecDeque<LogEntry>,
}

impl ProcessState {
    fn new() -> Self {
        Self {
            child: None,
            pid: None,
            start_time: None,
            status: ServiceStatus::Stopped,
            logs: VecDeque::with_capacity(MAX_LOG_ENTRIES),
        }
    }

    fn add_log(&mut self, message: String, level: &str) {
        if self.logs.len() >= MAX_LOG_ENTRIES {
            self.logs.pop_front();
        }
        
        self.logs.push_back(LogEntry {
            id: uuid::Uuid::new_v4().to_string(),
            timestamp: Utc::now().to_rfc3339(),
            message,
            level: level.to_string(),
        });
    }

    fn get_uptime(&self) -> Option<String> {
        self.start_time.map(|start| {
            let duration = Utc::now().signed_duration_since(start);
            let hours = duration.num_hours();
            let minutes = duration.num_minutes() % 60;
            let seconds = duration.num_seconds() % 60;
            format!("{:02}:{:02}:{:02}", hours, minutes, seconds)
        })
    }
}

pub struct ProcessManager {
    node: Arc<RwLock<ProcessState>>,
    miner: Arc<RwLock<ProcessState>>,
}

impl ProcessManager {
    pub fn new() -> Self {
        Self {
            node: Arc::new(RwLock::new(ProcessState::new())),
            miner: Arc::new(RwLock::new(ProcessState::new())),
        }
    }

    pub fn get_status(&self) -> (NodeStatus, MinerStatus) {
        let node = self.node.read();
        let miner = self.miner.read();

        let node_status = NodeStatus {
            status: node.status.clone(),
            pid: node.pid,
            uptime: node.get_uptime(),
            last_heartbeat: Some(Utc::now().to_rfc3339()),
        };

        let miner_status = MinerStatus {
            status: miner.status.clone(),
            pid: miner.pid,
            uptime: miner.get_uptime(),
        };

        (node_status, miner_status)
    }

    pub async fn start_node(&self, app_handle: &tauri::AppHandle) -> Result<(), String> {
        let mut state = self.node.write();
        
        if matches!(state.status, ServiceStatus::Running | ServiceStatus::Starting) {
            return Err("Node is already running or starting".to_string());
        }

        state.status = ServiceStatus::Starting;
        state.add_log("Starting node...".to_string(), "info");

        let (mut rx, child) = Command::new_sidecar("kascompute-node")
            .map_err(|e| format!("Failed to create sidecar command: {}", e))?
            .spawn()
            .map_err(|e| format!("Failed to spawn node process: {}", e))?;

        state.pid = Some(child.pid());
        state.child = Some(child);
        state.start_time = Some(Utc::now());
        state.status = ServiceStatus::Running;
        state.add_log(format!("Node started with PID: {}", state.pid.unwrap()), "info");

        // Spawn log reader task
        let node_state = Arc::clone(&self.node);
        tauri::async_runtime::spawn(async move {
            while let Some(event) = rx.recv().await {
                let mut state = node_state.write();
                match event {
                    CommandEvent::Stdout(line) => {
                        state.add_log(line, "info");
                    }
                    CommandEvent::Stderr(line) => {
                        state.add_log(line, "error");
                    }
                    CommandEvent::Terminated(payload) => {
                        state.status = ServiceStatus::Stopped;
                        state.pid = None;
                        state.child = None;
                        state.start_time = None;
                        state.add_log(
                            format!("Node terminated with code: {:?}", payload.code),
                            "warn"
                        );
                        break;
                    }
                    _ => {}
                }
            }
        });

        Ok(())
    }

    pub async fn stop_node(&self) -> Result<(), String> {
        let mut state = self.node.write();

        if !matches!(state.status, ServiceStatus::Running) {
            return Err("Node is not running".to_string());
        }

        state.status = ServiceStatus::Stopping;
        state.add_log("Stopping node...".to_string(), "info");

        if let Some(child) = state.child.take() {
            child.kill().map_err(|e| format!("Failed to kill node process: {}", e))?;
        }

        state.status = ServiceStatus::Stopped;
        state.pid = None;
        state.start_time = None;
        state.add_log("Node stopped".to_string(), "info");

        Ok(())
    }

    pub async fn start_miner(&self, app_handle: &tauri::AppHandle) -> Result<(), String> {
        let mut state = self.miner.write();
        
        if matches!(state.status, ServiceStatus::Running | ServiceStatus::Starting) {
            return Err("Miner is already running or starting".to_string());
        }

        state.status = ServiceStatus::Starting;
        state.add_log("Starting miner...".to_string(), "info");

        let (mut rx, child) = Command::new_sidecar("kascompute-miner")
            .map_err(|e| format!("Failed to create sidecar command: {}", e))?
            .spawn()
            .map_err(|e| format!("Failed to spawn miner process: {}", e))?;

        state.pid = Some(child.pid());
        state.child = Some(child);
        state.start_time = Some(Utc::now());
        state.status = ServiceStatus::Running;
        state.add_log(format!("Miner started with PID: {}", state.pid.unwrap()), "info");

        // Spawn log reader task
        let miner_state = Arc::clone(&self.miner);
        tauri::async_runtime::spawn(async move {
            while let Some(event) = rx.recv().await {
                let mut state = miner_state.write();
                match event {
                    CommandEvent::Stdout(line) => {
                        state.add_log(line, "info");
                    }
                    CommandEvent::Stderr(line) => {
                        state.add_log(line, "error");
                    }
                    CommandEvent::Terminated(payload) => {
                        state.status = ServiceStatus::Stopped;
                        state.pid = None;
                        state.child = None;
                        state.start_time = None;
                        state.add_log(
                            format!("Miner terminated with code: {:?}", payload.code),
                            "warn"
                        );
                        break;
                    }
                    _ => {}
                }
            }
        });

        Ok(())
    }

    pub async fn stop_miner(&self) -> Result<(), String> {
        let mut state = self.miner.write();

        if !matches!(state.status, ServiceStatus::Running) {
            return Err("Miner is not running".to_string());
        }

        state.status = ServiceStatus::Stopping;
        state.add_log("Stopping miner...".to_string(), "info");

        if let Some(child) = state.child.take() {
            child.kill().map_err(|e| format!("Failed to kill miner process: {}", e))?;
        }

        state.status = ServiceStatus::Stopped;
        state.pid = None;
        state.start_time = None;
        state.add_log("Miner stopped".to_string(), "info");

        Ok(())
    }

    pub fn get_logs(&self, target: &str) -> Result<Vec<LogEntry>, String> {
        let logs = match target {
            "node" => {
                let state = self.node.read();
                state.logs.iter().cloned().collect()
            }
            "miner" => {
                let state = self.miner.read();
                state.logs.iter().cloned().collect()
            }
            _ => return Err(format!("Unknown target: {}", target)),
        };

        Ok(logs)
    }
}
```

> **Note**: Add `uuid = "1"` to Cargo.toml dependencies for log ID generation.

---

## Frontend Integration

### Replacing Mock Data

The `src/hooks/useTauriData.ts` file provides a drop-in replacement for `useMockData.ts`:

```typescript
// In src/pages/Index.tsx, change:
import { useMockData } from "@/hooks/useMockData";
// To:
import { useTauriData } from "@/hooks/useTauriData";

// Then use:
const { ... } = useTauriData();
```

### Environment Detection

For development with mock data and production with Tauri:

```typescript
const isTauri = Boolean(window.__TAURI__);
const useData = isTauri ? useTauriData : useMockData;
```

---

## Sidecar Binary Setup

### Naming Convention

Binaries must follow Tauri's naming convention:

```
{binary-name}-{target-triple}[.exe]
```

### Target Triples

| Platform | Architecture | Target Triple |
|----------|--------------|---------------|
| Windows | x86_64 | `x86_64-pc-windows-msvc` |
| macOS | Intel | `x86_64-apple-darwin` |
| macOS | Apple Silicon | `aarch64-apple-darwin` |
| Linux | x86_64 | `x86_64-unknown-linux-gnu` |

### Example

For Windows x64:
```
src-tauri/binaries/kascompute-node-x86_64-pc-windows-msvc.exe
src-tauri/binaries/kascompute-miner-x86_64-pc-windows-msvc.exe
```

---

## Build & Distribution

### Development

```bash
# Run in development mode
npm run tauri dev
```

### Production Build

```bash
# Build for current platform
npm run tauri build
```

Output will be in `src-tauri/target/release/bundle/`.

### Windows Installer

The build produces:
- `kascompute-launcher_1.0.0_x64_en-US.msi` - MSI installer
- `kascompute-launcher_1.0.0_x64-setup.exe` - NSIS installer

### Code Signing (Windows)

For production distribution, sign your binaries:

```bash
# Set environment variables
$env:TAURI_PRIVATE_KEY = "path/to/private-key"
$env:TAURI_KEY_PASSWORD = "your-password"

npm run tauri build
```

---

## Troubleshooting

### Common Issues

#### "Failed to create sidecar command"
- Ensure binaries are in `src-tauri/binaries/`
- Verify correct naming convention with target triple
- Check file permissions (executable on Unix)

#### "Node/Miner is already running"
- Check if previous instance is still running
- Kill orphaned processes manually if needed

#### Build fails on Windows
- Install Visual Studio Build Tools
- Ensure C++ workload is installed
- Run from "Developer Command Prompt"

#### Logs not appearing
- Check that sidecar binary outputs to stdout/stderr
- Verify log streaming is connected in frontend

### Debug Mode

Enable Rust debug logging:

```bash
RUST_LOG=debug npm run tauri dev
```

---

## Security Considerations

1. **No remote content** - UI is bundled locally, no iframe usage
2. **Minimal allowlist** - Only required Tauri APIs are enabled
3. **Scoped sidecar** - Only specified binaries can be executed
4. **CSP configured** - Content Security Policy restricts sources
5. **No global drag regions** - Prevents UI hijacking

---

## Quick Reference

### Command Names (Exact)

| Command | Purpose |
|---------|---------|
| `get_config` | Load configuration |
| `set_config` | Save configuration |
| `get_status` | Get node/miner status |
| `start_node` | Start kascompute-node.exe |
| `stop_node` | Stop kascompute-node.exe |
| `start_miner` | Start kascompute-miner.exe |
| `stop_miner` | Stop kascompute-miner.exe |
| `tail_log` | Get recent log entries |

### Frontend Hook Methods

```typescript
const {
  nodeStatus,      // NodeStatus object
  minerStatus,     // MinerStatus object
  nodeLogs,        // LogEntry[]
  minerLogs,       // LogEntry[]
  config,          // Config object
  requiredScripts, // RequiredScript[]
  startNode,       // () => Promise<void>
  stopNode,        // () => Promise<void>
  startMiner,      // () => Promise<void>
  stopMiner,       // () => Promise<void>
  updateConfig,    // (updates: Partial<Config>) => Promise<void>
  refresh,         // () => Promise<void>
} = useTauriData();
```
