use serde::Deserialize;
use serde_json::json;
use std::{
  env,
  time::{Duration as StdDuration, Instant, SystemTime, UNIX_EPOCH},
};
use tokio::time::{sleep, Duration};

// crypto (kommt bei dir schon im Cargo.toml vor)
use ed25519_dalek::{Signer, SigningKey};
use sha2::{Digest, Sha256};

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
  args
    .iter()
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
  kascompute-miner.exe --endpoint <URL> --node-id <ID> --pubkey <HEX> --privkey <HEX> [--role <node|miner|both>] [--version <X.Y.Z>] [--compute-profile <sim|cpu|gpu|...>]
"#
  );
}

// Removes trailing slashes, and if someone passes ".../v1" we strip it
fn normalize_endpoint(mut s: String) -> String {
  s = s.trim().trim_end_matches('/').to_string();
  if s.ends_with("/v1") {
    s.truncate(s.len().saturating_sub(3));
    s = s.trim_end_matches('/').to_string();
  }
  s
}

/// pseudo-jitter without rand (0..=max_ms)
fn jitter_ms(max_ms: u64) -> u64 {
  let nanos = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.subsec_nanos() as u64)
    .unwrap_or(0);

  let mut x = nanos ^ (nanos << 13);
  x ^= x >> 7;
  x ^= x << 17;

  if max_ms == 0 { 0 } else { x % (max_ms + 1) }
}

/// Work time in ms based on Work Units (log mapping, clamped)
fn work_time_ms(work_units: u64) -> u64 {
  if work_units == 0 {
    return 900;
  }
  // logarithmisch für Mio-WU:
  let wu = work_units as f64;
  let base = 1800.0;
  let k = 900.0;
  let ms = base + k * wu.log10();
  (ms as u64).clamp(900, 12_000)
}

// pacing knobs (jobrate pro miner ~ 4–8s)
const TARGET_MIN_CYCLE_MS: u64 = 4_000;
const TARGET_MAX_CYCLE_MS: u64 = 8_000;

const NEXT_FAIL_BACKOFF_MS: u64 = 1_500;
const NEXT_IDLE_SLEEP_MS: u64 = 1_200;

// heartbeat knobs
const HEARTBEAT_EVERY_SECS: u64 = 25;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
struct ProofPayloadV1ToSign {
  node_id: String,
  job_id: u64,
  work_units: u64,
  workload_mode: String,
  elapsed_ms: u64,
  client_version: String,
  ts: u64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
struct HeartbeatPayload {
  node_id: String,
  public_key_hex: String,
  roles: Vec<String>,
  client_version: Option<String>,
  uptime_sec: u64,
  #[serde(skip_serializing_if = "Option::is_none")]
  compute_profile: Option<String>,

  // optional future fields
  #[serde(skip_serializing_if = "Option::is_none")]
  latitude: Option<f64>,
  #[serde(skip_serializing_if = "Option::is_none")]
  longitude: Option<f64>,
  #[serde(skip_serializing_if = "Option::is_none")]
  country: Option<String>,
}

async fn send_heartbeat_once(
  client: &reqwest::Client,
  hb_url: &str,
  version: &str,
  node_id: &str,
  public_key_hex: &str,
  compute_profile: &str,
  uptime_sec: u64,
) {
  let payload = HeartbeatPayload {
    node_id: node_id.to_string(),
    public_key_hex: public_key_hex.to_string(),
    roles: vec!["miner".to_string()],
    client_version: Some("protocol-v1".to_string()),
    uptime_sec,
    compute_profile: Some(compute_profile.to_string()),
    latitude: None,
    longitude: None,
    country: None,
  };

  let resp = client
    .post(hb_url)
    .header("User-Agent", format!("kascompute-miner/{}", version))
    .json(&payload)
    .send()
    .await;

  match resp {
    Ok(r) if r.status().is_success() => {
      // bewusst leise, damit logs nicht gespammt werden
    }
    Ok(r) => {
      let st = r.status();
      let body = r.text().await.unwrap_or_default();
      eprintln!("[MINER {}] heartbeat FAIL {} {}", node_id, st, body);
    }
    Err(e) => {
      eprintln!("[MINER {}] heartbeat ERROR {}", node_id, e);
    }
  }
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
    .or_else(|| std::env::var("KASCOMPUTE_API").ok())
    .unwrap_or_else(|| "https://kascompute-protocol-v1.onrender.com".to_string());

  let endpoint = normalize_endpoint(endpoint);

  let node_id = arg_value(&args, "--node-id").unwrap_or_else(|| "launcher-dev-node".to_string());

  let public_key_hex = match arg_value(&args, "--pubkey") {
    Some(v) if !v.trim().is_empty() && v != "00" => v,
    _ => {
      eprintln!("ERROR: missing --pubkey <HEX> (required)");
      usage();
      std::process::exit(2);
    }
  };

  let private_key_hex = match arg_value(&args, "--privkey") {
    Some(v) if !v.trim().is_empty() && v != "00" => v,
    _ => {
      eprintln!("ERROR: missing --privkey <HEX> (required)");
      usage();
      std::process::exit(2);
    }
  };

  let _role = arg_value(&args, "--role").unwrap_or_else(|| "miner".to_string());
  let version = arg_value(&args, "--version").unwrap_or_else(|| "1.1.0".to_string());

  // ✅ NEW
  let compute_profile = arg_value(&args, "--compute-profile")
    .unwrap_or_else(|| "sim".to_string());

  let next_url = format!("{}/v1/jobs/next", endpoint);

  // ✅ Heartbeat endpoint
  let hb_url = format!("{}/v1/nodes/heartbeat", endpoint);

  // ✅ wir unterstützen BEIDES:
  // 1) /v1/jobs/{id}/proof
  // 2) /v1/jobs/proof (fallback)
  let proof_url_per_job = |job_id: u64| format!("{}/v1/jobs/{}/proof", endpoint, job_id);
  let proof_url_global = format!("{}/v1/jobs/proof", endpoint);

  println!("kascompute-miner started (protocol-v1)");
  println!("endpoint        = {}", endpoint);
  println!("node_id         = {}", node_id);
  println!("version         = {}", version);
  println!("compute_profile = {}", compute_profile);
  println!("next_url        = {}", next_url);
  println!("hb_url          = {}", hb_url);

  // ✅ reqwest client with timeouts (profi)
  let client = reqwest::Client::builder()
    .timeout(StdDuration::from_secs(12))
    .connect_timeout(StdDuration::from_secs(6))
    .build()
    .expect("failed to build reqwest client");

  let mut last_idle_log = Instant::now() - Duration::from_secs(60);

  // validate privkey bytes once (profi)
  let sk_bytes_vec = hex::decode(&private_key_hex).unwrap_or_default();
  if sk_bytes_vec.len() != 32 {
    eprintln!(
      "ERROR: --privkey must be 32 bytes hex (got {} bytes)",
      sk_bytes_vec.len()
    );
    std::process::exit(2);
  }
  let mut sk_bytes = [0u8; 32];
  sk_bytes.copy_from_slice(&sk_bytes_vec[..32]);
  let signing = SigningKey::from_bytes(&sk_bytes);

  // uptime + heartbeat scheduling
  let start_unix = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .unwrap_or_default()
    .as_secs();

  let mut next_hb_at = Instant::now(); // send immediately once

  loop {
    // ---- heartbeat (every 25s)
    if Instant::now() >= next_hb_at {
      let now_unix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
      let uptime_sec = now_unix.saturating_sub(start_unix);

      send_heartbeat_once(
        &client,
        &hb_url,
        &version,
        &node_id,
        &public_key_hex,
        &compute_profile,
        uptime_sec,
      )
      .await;

      next_hb_at = Instant::now() + Duration::from_secs(HEARTBEAT_EVERY_SECS);
    }

    let cycle_start = Instant::now();

    // ---- get next job
    let resp = match client
      .post(&next_url)
      .header("User-Agent", format!("kascompute-miner/{}", version))
      .json(&json!({ "node_id": node_id.clone() }))
      .send()
      .await
    {
      Ok(r) => r,
      Err(e) => {
        eprintln!("[MINER {}] /v1/jobs/next ERROR: {}", node_id, e);
        sleep(Duration::from_millis(NEXT_FAIL_BACKOFF_MS + jitter_ms(1200))).await;
        continue;
      }
    };

    let http = resp.status();
    let text = resp.text().await.unwrap_or_default();

    if !http.is_success() {
      eprintln!("[MINER {}] /v1/jobs/next FAIL {} {}", node_id, http, text);
      sleep(Duration::from_millis(NEXT_FAIL_BACKOFF_MS + jitter_ms(1200))).await;
      continue;
    }

    let parsed: ApiResponse<NextJobData> = match serde_json::from_str(&text) {
      Ok(v) => v,
      Err(e) => {
        eprintln!(
          "[MINER {}] /v1/jobs/next JSON ERROR: {} body={}",
          node_id, e, text
        );
        sleep(Duration::from_millis(NEXT_FAIL_BACKOFF_MS + jitter_ms(1200))).await;
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
        sleep(Duration::from_millis(NEXT_IDLE_SLEEP_MS + jitter_ms(900))).await;
        continue;
      }
    };

    let job_id = lease.id;
    let work_units = lease.work_units;

    println!(
      "[MINER {}] job assigned id={} wu={} lease_expires_unix={} server_ts={}",
      node_id, job_id, work_units, lease.lease_expires_unix, parsed.ts
    );

    // ---- simulate work (WU mapping)
    let work_ms = work_time_ms(work_units);
    let work_start = Instant::now();
    sleep(Duration::from_millis(work_ms + jitter_ms(350))).await;
    let elapsed_ms = work_start.elapsed().as_millis() as u64;

    // ---- sign payload (strict compatible)
    let ts = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .unwrap_or_default()
      .as_secs() as u64;

    let payload_to_sign = ProofPayloadV1ToSign {
      node_id: node_id.clone(),
      job_id,
      work_units,
      workload_mode: compute_profile.clone(), // ✅ NEW: profile reflected in signature payload
      elapsed_ms,
      client_version: "protocol-v1".to_string(),
      ts,
    };

    let payload_bytes = serde_json::to_vec(&payload_to_sign).unwrap_or_default();
    let hash = Sha256::digest(&payload_bytes);
    let proof_hash_hex = hex::encode(hash);

    let sig = signing.sign(hash.as_slice());
    let signature_hex = hex::encode(sig.to_bytes());

    // ---- submit proof (per-job first, then fallback)
    let proof_body = json!({
      "node_id": payload_to_sign.node_id,
      "work_units": payload_to_sign.work_units,
      "workload_mode": payload_to_sign.workload_mode, // ✅ profile
      "elapsed_ms": payload_to_sign.elapsed_ms,
      "client_version": payload_to_sign.client_version,
      "timestamp_unix": payload_to_sign.ts,
      "signature_hex": signature_hex,
      "result_hash": null
    });

    let mut sent_ok = false;

    // 1) per-job
    let url1 = proof_url_per_job(job_id);
    let mut last_status: Option<reqwest::StatusCode> = None;
    let mut last_body = String::new();

    match client
      .post(&url1)
      .header("User-Agent", format!("kascompute-miner/{}", version))
      .json(&proof_body)
      .send()
      .await
    {
      Ok(r) => {
        last_status = Some(r.status());
        last_body = r.text().await.unwrap_or_default();
        if last_status.unwrap().is_success() {
          sent_ok = true;
        }
      }
      Err(e) => {
        eprintln!("[MINER {}] proof ERROR job={} err={}", node_id, job_id, e);
      }
    }

    // 2) fallback global (nur wenn per-job nicht supported)
    if !sent_ok {
      let fallback = match last_status {
        Some(code) => {
          code == reqwest::StatusCode::NOT_FOUND || code == reqwest::StatusCode::METHOD_NOT_ALLOWED
        }
        None => true,
      };

      if fallback {
        match client
          .post(&proof_url_global)
          .header("User-Agent", format!("kascompute-miner/{}", version))
          .json(&proof_body)
          .send()
          .await
        {
          Ok(r) => {
            let st = r.status();
            let body = r.text().await.unwrap_or_default();
            if st.is_success() {
              sent_ok = true;
              last_status = Some(st);
              last_body = body;
            } else {
              last_status = Some(st);
              last_body = body;
            }
          }
          Err(e) => {
            eprintln!("[MINER {}] proof ERROR job={} err={}", node_id, job_id, e);
          }
        }
      }
    }

    if sent_ok {
      // ✅ wichtigste Zeile: wird von sidecar.rs geparsed -> miner:proof bleibt
      println!(
        "MINER_PROOF node_id={} job={} wu={} elapsed_ms={} ts={} hash={} sig={} pubkey={}",
        node_id,
        job_id,
        work_units,
        elapsed_ms,
        ts,
        proof_hash_hex,
        signature_hex,
        public_key_hex
      );
    } else if let Some(st) = last_status {
      eprintln!(
        "[MINER {}] proof FAIL job={} {} {}",
        node_id, job_id, st, last_body
      );
    } else {
      eprintln!("[MINER {}] proof FAIL job={} (no status)", node_id, job_id);
    }

    // ---- pacing: Ziel-Jobrate 4–8s
    let target = TARGET_MIN_CYCLE_MS + jitter_ms(TARGET_MAX_CYCLE_MS - TARGET_MIN_CYCLE_MS);
    let elapsed = cycle_start.elapsed().as_millis() as u64;
    if elapsed < target {
      sleep(Duration::from_millis(target - elapsed)).await;
    }
  }
}
