use serde::Deserialize;
use serde_json::json;
use std::{env, time::Instant};
use tokio::time::{sleep, Duration};

#[derive(Debug, Deserialize)]
struct ApiResponse<T> {
    status: String,
    data: T,
    error: Option<serde_json::Value>,
    ts: u64,
}

#[derive(Debug, Deserialize)]
struct JobLease {
    id: u64,
    work_units: u64,
    lease_expires_unix: u64,
}

#[derive(Debug, Deserialize)]
struct NextJobData {
    job: Option<JobLease>,
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
        r#"kascompute-miner (protocol-v1)
Usage:
  kascompute-miner.exe --endpoint <URL> --node-id <ID> [--pubkey <HEX>] [--role <node|miner|both>] [--version <X.Y.Z>]
"#
    );
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
    let args: Vec<String> = env::args().collect();

    if has_flag(&args, "--help") || has_flag(&args, "-h") {
        usage();
        return;
    }

    // Priority:
    // 1) CLI --endpoint/--api
    // 2) ENV KASCOMPUTE_API (set by Tauri)
    // 3) default
    let endpoint = arg_value(&args, "--endpoint")
        .or_else(|| arg_value(&args, "--api"))
        .or_else(|| std::env::var("KASCOMPUTE_API").ok())
        .unwrap_or_else(|| "https://kascompute-protocol-v1.onrender.com".to_string());

    let endpoint = normalize_endpoint(endpoint);

    let node_id = arg_value(&args, "--node-id").unwrap_or_else(|| "launcher-dev-node".to_string());
    let _pubkey = arg_value(&args, "--pubkey").unwrap_or_else(|| "dev-public-key".to_string());
    let _role = arg_value(&args, "--role").unwrap_or_else(|| "miner".to_string());
    let version = arg_value(&args, "--version").unwrap_or_else(|| "0.1.0".to_string());

    // ✅ protocol-v1 endpoints
    let next_url = format!("{}/v1/jobs/next", endpoint);
    let proof_url_for = |job_id: u64| format!("{}/v1/jobs/{}/proof", endpoint, job_id);

    println!("kascompute-miner started (protocol-v1)");
    println!("endpoint = {}", endpoint);
    println!("node_id  = {}", node_id);
    println!("version  = {}", version);
    println!("next_url = {}", next_url);

    let client = reqwest::Client::new();
    let mut last_idle_log = Instant::now() - Duration::from_secs(60);

    loop {
        let tick = Instant::now();

        // v1 expects POST and returns wrapper {status,data,error,ts}
        let resp = match client
            .post(&next_url)
            .json(&json!({ "node_id": node_id.clone() }))
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => {
                eprintln!("[MINER {}] /v1/jobs/next ERROR: {}", node_id, e);
                sleep(Duration::from_millis(1200)).await;
                continue;
            }
        };

        let http = resp.status();
        let text = resp.text().await.unwrap_or_default();

        if !http.is_success() {
            eprintln!("[MINER {}] /v1/jobs/next FAIL {} {}", node_id, http, text);
            sleep(Duration::from_millis(1200)).await;
            continue;
        }

        let parsed: ApiResponse<NextJobData> = match serde_json::from_str(&text) {
            Ok(v) => v,
            Err(e) => {
                eprintln!(
                    "[MINER {}] /v1/jobs/next JSON ERROR: {} body={}",
                    node_id, e, text
                );
                sleep(Duration::from_millis(1200)).await;
                continue;
            }
        };

        let lease = match parsed.data.job {
            Some(j) => j,
            None => {
                if last_idle_log.elapsed() >= Duration::from_secs(10) {
                    println!("[MINER {}] idle (no job) ts={}", node_id, parsed.ts);
                    last_idle_log = Instant::now();
                }
                sleep(Duration::from_millis(900)).await;
                continue;
            }
        };

        println!(
            "[MINER {}] job assigned id={} wu={} lease_expires_unix={} server_ts={}",
            node_id, lease.id, lease.work_units, lease.lease_expires_unix, parsed.ts
        );

        // SIM work (replace later with real workload)
        sleep(Duration::from_millis(150)).await;
        let elapsed_ms = tick.elapsed().as_millis() as u64;

        let proof_url = proof_url_for(lease.id);

        let proof_body = json!({
            "node_id": node_id.clone(),
            "work_units": lease.work_units,
            "workload_mode": "sim",
            "elapsed_ms": elapsed_ms,
            "result_hash": null,
            "client_version": "protocol-v1"
        });

        match client.post(&proof_url).json(&proof_body).send().await {
            Ok(r) => {
                let http2 = r.status();
                let body2 = r.text().await.unwrap_or_default();
                if http2.is_success() {
                    println!(
                        "[MINER {}] proof ACCEPTED job={} elapsed={}ms resp={}",
                        node_id, lease.id, elapsed_ms, body2
                    );
                } else {
                    eprintln!(
                        "[MINER {}] proof FAIL job={} {} {}",
                        node_id, lease.id, http2, body2
                    );
                }
            }
            Err(e) => {
                eprintln!("[MINER {}] proof ERROR job={} err={}", node_id, lease.id, e);
            }
        }

        sleep(Duration::from_millis(300)).await;
    }
}
