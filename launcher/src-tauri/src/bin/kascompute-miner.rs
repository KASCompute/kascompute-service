use serde::Deserialize;
use serde_json::json;
use std::{env, time::Instant};
use tokio::time::{sleep, Duration};

use rand::{thread_rng, Rng}; // ✅ NEW

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

// ============================================================================
// ✅ Realistic pacing knobs
// ============================================================================
const NEXT_MIN_INTERVAL_MS: u64 = 1200; // /next rate limit (min)
const NEXT_JITTER_MS: u64 = 900;        // random extra delay
const IDLE_BACKOFF_START_MS: u64 = 1500;
const IDLE_BACKOFF_MAX_MS: u64 = 15_000;
const POST_PROOF_COOLDOWN_MIN_MS: u64 = 450;
const POST_PROOF_COOLDOWN_MAX_MS: u64 = 1200;

// jitter helper
fn jitter_ms(max: u64) -> u64 {
    thread_rng().gen_range(0..=max)
}

// Work duration based on work_units (demo-realistic)
fn compute_work_ms(work_units: u64) -> u64 {
    // For your typical demo WU=100 => ~1.5s–4.5s
    let base = thread_rng().gen_range(600..=1200);
    let per_wu = thread_rng().gen_range(8..=22); // ms per work_unit
    let extra = thread_rng().gen_range(0..=700);

    let raw = base + work_units.saturating_mul(per_wu) + extra;
    raw.clamp(900, 12_000)
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
    let proof_url = format!("{}/v1/jobs/proof", endpoint);

    println!("kascompute-miner started (protocol-v1)");
    println!("endpoint = {}", endpoint);
    println!("node_id  = {}", node_id);
    println!("version  = {}", version);
    println!("next_url = {}", next_url);

    let client = reqwest::Client::new();
    let mut last_idle_log = Instant::now() - Duration::from_secs(60);

    // ✅ pacing state
    let mut idle_backoff_ms = IDLE_BACKOFF_START_MS;
    let mut next_allowed_at = Instant::now(); // rate-limit gate

    loop {
        // ------------------------------------------------------------
        // ✅ Rate limit /next (prevents “rattling”)
        // ------------------------------------------------------------
        let now = Instant::now();
        if now < next_allowed_at {
            sleep(next_allowed_at - now).await;
        }

        let tick_next = Instant::now();

        let resp = match client
            .post(&next_url)
            .json(&json!({ "node_id": node_id.clone() }))
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => {
                eprintln!("[MINER {}] /v1/jobs/next ERROR: {}", node_id, e);
                // network hiccup: soft backoff
                sleep(Duration::from_millis(1500 + jitter_ms(1200))).await;
                continue;
            }
        };

        // after every /next, set next allowed time
        next_allowed_at =
            Instant::now() + Duration::from_millis(NEXT_MIN_INTERVAL_MS + jitter_ms(NEXT_JITTER_MS));

        let http = resp.status();
        let text = resp.text().await.unwrap_or_default();

        if !http.is_success() {
            eprintln!("[MINER {}] /v1/jobs/next FAIL {} {}", node_id, http, text);
            sleep(Duration::from_millis(1500 + jitter_ms(1200))).await;
            continue;
        }

        let parsed: ApiResponse<NextJobData> = match serde_json::from_str(&text) {
            Ok(v) => v,
            Err(e) => {
                eprintln!(
                    "[MINER {}] /v1/jobs/next JSON ERROR: {} body={}",
                    node_id, e, text
                );
                sleep(Duration::from_millis(1500 + jitter_ms(1200))).await;
                continue;
            }
        };

        let lease = match parsed.data.job {
            Some(j) => {
                // ✅ reset idle backoff on real work
                idle_backoff_ms = IDLE_BACKOFF_START_MS;
                j
            }
            None => {
                if last_idle_log.elapsed() >= Duration::from_secs(10) {
                    println!("[MINER {}] idle (no job) ts={}", node_id, parsed.ts);
                    last_idle_log = Instant::now();
                }

                // ✅ backoff grows when no jobs (prevents spam)
                sleep(Duration::from_millis(idle_backoff_ms + jitter_ms(700))).await;
                idle_backoff_ms = (idle_backoff_ms * 2).min(IDLE_BACKOFF_MAX_MS);
                continue;
            }
        };

        println!(
            "[MINER {}] job assigned id={} wu={} lease_expires_unix={} server_ts={}",
            node_id, lease.id, lease.work_units, lease.lease_expires_unix, parsed.ts
        );

        // ------------------------------------------------------------
        // ✅ Realistic “compute” time (based on work_units)
        // ------------------------------------------------------------
        let work_ms = compute_work_ms(lease.work_units);
        let work_start = Instant::now();
        sleep(Duration::from_millis(work_ms)).await;
        let elapsed_ms = work_start.elapsed().as_millis() as u64;

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

                    // ✅ small cool-down after success
                    let cd = thread_rng().gen_range(POST_PROOF_COOLDOWN_MIN_MS..=POST_PROOF_COOLDOWN_MAX_MS);
                    sleep(Duration::from_millis(cd)).await;
                } else {
                    eprintln!(
                        "[MINER {}] proof FAIL job={} {} {}",
                        node_id, lease.id, http2, body2
                    );

                    // ✅ don’t spam if rejected (task_not_running etc.)
                    sleep(Duration::from_millis(2000 + jitter_ms(2000))).await;
                }
            }
            Err(e) => {
                eprintln!("[MINER {}] proof ERROR job={} err={}", node_id, lease.id, e);
                sleep(Duration::from_millis(1500 + jitter_ms(1500))).await;
            }
        }

        // NOTE: we no longer do the old fixed 300ms sleep here,
        // cooldown/backoff already handles pacing properly.
        let _ = tick_next; // keep variable if you want debug
    }
}
