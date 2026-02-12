use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};

#[derive(Serialize)]
struct HeartbeatV1 {
    node_id: String,
    public_key_hex: String,
    roles: Vec<String>,
    client_version: Option<String>,
    uptime_sec: u64,
}

#[derive(Debug, Deserialize)]
struct ApiResponse<T> {
    status: String,
    data: T,
    error: Option<serde_json::Value>,
    ts: u64,
}

#[derive(Debug, Deserialize)]
struct HeartbeatAck {
    accepted: bool,
}

fn arg_value(args: &[String], key: &str, default: &str) -> String {
    args.iter()
        .position(|a| a == key)
        .and_then(|i| args.get(i + 1))
        .cloned()
        .unwrap_or_else(|| default.to_string())
}

fn arg_value_opt(args: &[String], key: &str) -> Option<String> {
    args.iter()
        .position(|a| a == key)
        .and_then(|i| args.get(i + 1))
        .cloned()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn env_opt(key: &str) -> Option<String> {
    std::env::var(key)
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

// Removes trailing slashes, and if someone passes ".../v1" we strip it
fn normalize_endpoint(mut s: String) -> String {
    s = s.trim().trim_end_matches('/').to_string();
    if s.ends_with("/v1") {
        s.truncate(s.len() - 3);
        s = s.trim_end_matches('/').to_string();
    }
    s
}

#[tokio::main]
async fn main() {
    let args: Vec<String> = std::env::args().collect();

    // Priority:
    // 1) CLI --endpoint
    // 2) ENV KASCOMPUTE_API (set by Tauri)
    // 3) default
    let cli = arg_value(&args, "--endpoint", "");
    let endpoint = if !cli.trim().is_empty() {
        cli
    } else {
        env_opt("KASCOMPUTE_API")
            .unwrap_or_else(|| "https://kascompute-protocol-v1.onrender.com".to_string())
    };

    let endpoint = normalize_endpoint(endpoint);

    // Priority (Node):
    // 1) CLI --node-id
    // 2) ENV KASCOMPUTE_NODE_ID (set by Tauri sidecar supervisor)
    // 3) fallback
    let node_id = arg_value_opt(&args, "--node-id")
        .or_else(|| env_opt("KASCOMPUTE_NODE_ID"))
        .unwrap_or_else(|| "launcher-dev-node".to_string());

    // Priority (Pubkey):
    // 1) CLI --pubkey
    // 2) ENV KASCOMPUTE_PUBLIC_KEY_HEX
    // 3) fallback
    let public_key_hex = arg_value_opt(&args, "--pubkey")
        .or_else(|| env_opt("KASCOMPUTE_PUBLIC_KEY_HEX"))
        .unwrap_or_else(|| "dev-public-key".to_string());

    let role = arg_value(&args, "--role", "node");
    let version = arg_value(&args, "--version", "0.1.0");

    let url = format!("{}/v1/nodes/heartbeat", endpoint);

    let client = reqwest::Client::new();
    let start = Instant::now();

    println!("kascompute-node started (protocol-v1)");
    println!("endpoint       = {}", endpoint);
    println!("heartbeat_url  = {}", url);
    println!("node_id        = {}", node_id);
    println!("roles          = [{}]", role);
    println!("client_version = launcher/{}", version);

    loop {
        let payload = HeartbeatV1 {
            node_id: node_id.clone(),
            public_key_hex: public_key_hex.clone(),
            roles: vec![role.clone()],
            client_version: Some(format!("launcher/{}", version)),
            uptime_sec: start.elapsed().as_secs(),
        };

        match client.post(&url).json(&payload).send().await {
            Ok(r) => {
                let status = r.status();
                let text = r.text().await.unwrap_or_default();

                // v1 sends {status,data,error,ts}
                let parsed: Result<ApiResponse<HeartbeatAck>, _> = serde_json::from_str(&text);
                match parsed {
                    Ok(v) => {
                        println!(
                            "[NODE {}] heartbeat OK http={} accepted={} ts={} uptime={}s",
                            node_id, status, v.data.accepted, v.ts, payload.uptime_sec
                        );
                    }
                    Err(_) => {
                        // fallback: still show useful output
                        println!(
                            "[NODE {}] heartbeat http={} uptime={}s body={}",
                            node_id, status, payload.uptime_sec, text
                        );
                    }
                }
            }
            Err(e) => {
                eprintln!("[NODE {}] heartbeat ERROR {}", node_id, e);
            }
        }

        tokio::time::sleep(Duration::from_secs(10)).await;
    }
}