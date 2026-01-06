use std::time::{Duration, Instant};

use serde::Serialize;

#[derive(Serialize)]
struct Heartbeat {
    node_id: String,
    public_key_hex: String,
    role: String,
    launcher_version: String,
    uptime_sec: u64,
}

fn arg_value(args: &[String], key: &str, default: &str) -> String {
    args.iter()
        .position(|a| a == key)
        .and_then(|i| args.get(i + 1))
        .cloned()
        .unwrap_or_else(|| default.to_string())
}

#[tokio::main]
async fn main() {
    let args: Vec<String> = std::env::args().collect();

    // Defaults (für Dev)
    let endpoint = arg_value(
        &args,
        "--endpoint",
        "https://kascompute-testnet.onrender.com",
    );
    let node_id = arg_value(&args, "--node-id", "launcher-dev-node");
    let public_key_hex = arg_value(&args, "--pubkey", "dev-public-key");
    let role = arg_value(&args, "--role", "node");
    let version = arg_value(&args, "--version", "0.1.0");

    let url = format!("{}/node/heartbeat", endpoint.trim_end_matches('/'));

    let client = reqwest::Client::new();
    let start = Instant::now();

    eprintln!("[kascompute-node] heartbeat -> {}", url);
    eprintln!(
        "[kascompute-node] node_id={} role={} version={}",
        node_id, role, version
    );

    loop {
        let payload = Heartbeat {
            node_id: node_id.clone(),
            public_key_hex: public_key_hex.clone(),
            role: role.clone(),
            launcher_version: version.clone(),
            uptime_sec: start.elapsed().as_secs(),
        };

        let res = client.post(&url).json(&payload).send().await;

        match res {
            Ok(r) => {
                let code = r.status();
                eprintln!("[kascompute-node] heartbeat ok {}", code);
            }
            Err(e) => {
                eprintln!("[kascompute-node] heartbeat failed: {}", e);
            }
        }

        tokio::time::sleep(Duration::from_secs(10)).await;
    }
}
