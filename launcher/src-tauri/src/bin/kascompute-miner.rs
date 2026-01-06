use serde::Deserialize;
use serde_json::json;
use std::{env, time::Instant};
use tokio::time::{sleep, Duration};

#[derive(Debug, Deserialize)]
struct NextJobResponse {
    id: Option<u64>,
    work_units: Option<u64>,
}

fn arg_value(args: &[String], key: &str) -> Option<String> {
    args.iter()
        .position(|a| a == key)
        .and_then(|i| args.get(i + 1))
        .cloned()
}

fn has_flag(args: &[String], flag: &str) -> bool {
    args.iter().any(|a| a == flag)
}

fn usage() {
    eprintln!(
        r#"kascompute-miner (dummy)
Usage:
  kascompute-miner.exe --endpoint <URL> --node-id <ID> [--pubkey <HEX>] [--role <node|miner|both>] [--version <X.Y.Z>]

Examples:
  kascompute-miner.exe --endpoint https://kascompute-testnet.onrender.com --node-id launcher-dev-node --pubkey dev --role miner --version 0.1.0
"#
    );
}

#[tokio::main]
async fn main() {
    let args: Vec<String> = env::args().collect();

    if has_flag(&args, "--help") || has_flag(&args, "-h") {
        usage();
        return;
    }

    let endpoint = arg_value(&args, "--endpoint")
        .or_else(|| arg_value(&args, "--api"))
        .unwrap_or_else(|| "https://kascompute-testnet.onrender.com".to_string());

    let node_id = arg_value(&args, "--node-id").unwrap_or_else(|| "launcher-dev-node".to_string());
    let pubkey = arg_value(&args, "--pubkey").unwrap_or_else(|| "dev-public-key".to_string());
    let role = arg_value(&args, "--role").unwrap_or_else(|| "miner".to_string());
    let version = arg_value(&args, "--version").unwrap_or_else(|| "0.1.0".to_string());

    let base = endpoint.trim_end_matches('/').to_string();
    let next_url = format!("{}/jobs/next", base);
    let proof_url = format!("{}/jobs/proof", base);

    println!("kascompute-miner dummy starting");
    println!("endpoint = {}", base);
    println!("node_id  = {}", node_id);
    println!("pubkey   = {}", pubkey);
    println!("role     = {}", role);
    println!("version  = {}", version);

    let client = reqwest::Client::new();

    loop {
        // 1) request next job
        let t0 = Instant::now();
        let resp = client
            .post(&next_url)
            .json(&json!({ "node_id": node_id }))
            .send()
            .await;

        let resp = match resp {
            Ok(r) => r,
            Err(e) => {
                eprintln!("jobs/next request error: {}", e);
                sleep(Duration::from_millis(1200)).await;
                continue;
            }
        };

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            eprintln!("jobs/next bad status: {} {}", status, body);
            sleep(Duration::from_millis(1200)).await;
            continue;
        }

        let next: NextJobResponse = match resp.json().await {
            Ok(v) => v,
            Err(e) => {
                eprintln!("jobs/next json parse error: {}", e);
                sleep(Duration::from_millis(1200)).await;
                continue;
            }
        };

        let job_id = match next.id {
            Some(id) => id,
            None => {
                // no job right now
                sleep(Duration::from_millis(900)).await;
                continue;
            }
        };

        let work_units = next.work_units.unwrap_or(0);

        // 2) do "work" (SIM)
        // Mainnet-ready: hier kannst du später echte Arbeit/Hashing reinstecken.
        sleep(Duration::from_millis(150)).await;
        let elapsed_ms = t0.elapsed().as_millis() as u64;

        // 3) submit proof
        let proof_body = json!({
            "node_id": node_id,
            "job_id": job_id,
            "work_units": work_units,

            // meta (matches your backend optional fields)
            "workload_mode": "sim",
            "elapsed_ms": elapsed_ms,
            "result_hash": null,
            "client_version": format!("kascompute-miner/{}", version),
        });

        let proof_resp = client.post(&proof_url).json(&proof_body).send().await;

        match proof_resp {
            Ok(r) if r.status().is_success() => {
                println!("proof ok job={} wu={} elapsed={}ms", job_id, work_units, elapsed_ms);
            }
            Ok(r) => {
                let status = r.status();
                let body = r.text().await.unwrap_or_default();
                eprintln!("jobs/proof bad status: {} {}", status, body);
            }
            Err(e) => {
                eprintln!("jobs/proof request error: {}", e);
            }
        }

        sleep(Duration::from_millis(300)).await;
    }
}
