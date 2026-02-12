use serde::Deserialize;
use serde_json::json;
use std::{
  env,
  time::{Duration as StdDuration, Instant, SystemTime, UNIX_EPOCH},
};
use tokio::time::{sleep, Duration};

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
  args.iter().position(|a| a == key).and_then(|i| args.get(i + 1)).cloned()
}

fn has_flag(args: &[String], flag: &str) -> bool {
  args.iter().any(|a| a == flag)
}

fn usage() {
  eprintln!(
    r#"kascompute-miner (protocol-v1)
Usage:
  kascompute-miner.exe --endpoint <URL> --node-id <COORDINATOR_ID> --pubkey <HEX> --privkey <HEX>
    [--version <X.Y.Z>] [--compute-profile <sim|cpu|gpu|...>]

Identity:
  - coordinator_id (job owner) comes from --node-id (lease owner)
  - miner_id (worker) is:
      1) ENV KASCOMPUTE_MINER_ID (if set)
      2) otherwise derived deterministically from pubkey: kc_miner_<16hex>
"#
  );
}

fn normalize_endpoint(mut s: String) -> String {
  s = s.trim().trim_end_matches('/').to_string();
  if s.ends_with("/v1") {
    s.truncate(s.len().saturating_sub(3));
    s = s.trim_end_matches('/').to_string();
  }
  s
}

fn env_nonempty(key: &str) -> Option<String> {
  std::env::var(key)
    .ok()
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty())
}

fn derive_id_from_pubkey(prefix: &str, salt: &str, pubkey_hex: &str) -> String {
  let pk_bytes = hex::decode(pubkey_hex).unwrap_or_default();
  let mut hasher = Sha256::new();
  hasher.update(b"kascompute:");
  hasher.update(salt.as_bytes());
  hasher.update(b":");
  hasher.update(&pk_bytes);
  let digest = hasher.finalize();
  let short = hex::encode(&digest[..8]);
  format!("{}{}", prefix, short)
}

fn miner_id_from_env_or_pubkey(public_key_hex: &str) -> String {
  env_nonempty("KASCOMPUTE_MINER_ID")
    .unwrap_or_else(|| derive_id_from_pubkey("kc_miner_", "miner", public_key_hex))
}

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

fn work_time_ms(work_units: u64) -> u64 {
  if work_units == 0 {
    return 900;
  }
  let wu = work_units as f64;
  let base = 1800.0;
  let k = 900.0;
  let ms = base + k * wu.log10();
  (ms as u64).clamp(900, 12_000)
}

const TARGET_MIN_CYCLE_MS: u64 = 4_000;
const TARGET_MAX_CYCLE_MS: u64 = 8_000;

const NEXT_FAIL_BACKOFF_MS: u64 = 1_500;
const NEXT_IDLE_SLEEP_MS: u64 = 1_200;

const HEARTBEAT_EVERY_SECS: u64 = 25;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
struct ProofPayloadV1ToSign {
  node_id: String,
  miner_id: Option<String>,
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

  #[serde(skip_serializing_if = "Option::is_none")]
  latitude: Option<f64>,
  #[serde(skip_serializing_if = "Option::is_none")]
  longitude: Option<f64>,
  #[serde(skip_serializing_if = "Option::is_none")]
  country: Option<String>,
}

async fn send_heartbeat(
  client: &reqwest::Client,
  hb_url: &str,
  ua_version: &str,
  actor_id: &str,
  roles: Vec<String>,
  public_key_hex: &str,
  compute_profile: Option<String>,
  uptime_sec: u64,
) {
  let payload = HeartbeatPayload {
    node_id: actor_id.to_string(),
    public_key_hex: public_key_hex.to_string(),
    roles,
    client_version: Some(format!("miner/{}", env!("CARGO_PKG_VERSION"))),
    uptime_sec,
    compute_profile,
    latitude: None,
    longitude: None,
    country: None,
  };

  let resp = client
    .post(hb_url)
    .header("User-Agent", format!("kascompute-miner/{}", ua_version))
    .json(&payload)
    .send()
    .await;

  match resp {
    Ok(r) if r.status().is_success() => {}
    Ok(r) => {
      let st = r.status();
      let body = r.text().await.unwrap_or_default();
      eprintln!("[HB {}] FAIL {} {}", actor_id, st, body);
    }
    Err(e) => {
      eprintln!("[HB {}] ERROR {}", actor_id, e);
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

  let coordinator_id =
    arg_value(&args, "--node-id").unwrap_or_else(|| "launcher-dev-node".to_string());

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

  let miner_id = miner_id_from_env_or_pubkey(&public_key_hex);

  let version = arg_value(&args, "--version").unwrap_or_else(|| "1.1.2".to_string());
  let compute_profile = arg_value(&args, "--compute-profile").unwrap_or_else(|| "sim".to_string());

  let next_url = format!("{}/v1/jobs/next", endpoint);
  let hb_url = format!("{}/v1/nodes/heartbeat", endpoint);
  let proof_url_per_job = |job_id: u64| format!("{}/v1/jobs/{}/proof", endpoint, job_id);

  println!("kascompute-miner started (protocol-v1)");
  println!("endpoint        = {}", endpoint);
  println!("coordinator_id  = {}", coordinator_id);
  println!("miner_id        = {}", miner_id);
  println!("version         = {}", version);
  println!("compute_profile = {}", compute_profile);
  println!("next_url        = {}", next_url);
  println!("hb_url          = {}", hb_url);

  let client = reqwest::Client::builder()
    .timeout(StdDuration::from_secs(12))
    .connect_timeout(StdDuration::from_secs(6))
    .build()
    .expect("failed to build reqwest client");

  let mut last_idle_log = Instant::now() - Duration::from_secs(60);

  let sk_bytes_vec = hex::decode(&private_key_hex).unwrap_or_default();
  if sk_bytes_vec.len() != 32 {
    eprintln!("ERROR: --privkey must be 32 bytes hex (got {} bytes)", sk_bytes_vec.len());
    std::process::exit(2);
  }
  let mut sk_bytes = [0u8; 32];
  sk_bytes.copy_from_slice(&sk_bytes_vec[..32]);
  let signing = SigningKey::from_bytes(&sk_bytes);

  let start_unix = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
  let mut next_hb_at = Instant::now();

  loop {
    if Instant::now() >= next_hb_at {
      let now_unix = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
      let uptime_sec = now_unix.saturating_sub(start_unix);

      send_heartbeat(
        &client,
        &hb_url,
        &version,
        &miner_id,
        vec!["miner".to_string()],
        &public_key_hex,
        Some(compute_profile.clone()),
        uptime_sec,
      )
      .await;

      next_hb_at = Instant::now() + Duration::from_secs(HEARTBEAT_EVERY_SECS);
    }

    let cycle_start = Instant::now();

    let resp = match client
      .post(&next_url)
      .header("User-Agent", format!("kascompute-miner/{}", version))
      .json(&json!({ "node_id": coordinator_id.clone() }))
      .send()
      .await
    {
      Ok(r) => r,
      Err(e) => {
        eprintln!("[MINER {}] /v1/jobs/next ERROR: {}", miner_id, e);
        sleep(Duration::from_millis(NEXT_FAIL_BACKOFF_MS + jitter_ms(1200))).await;
        continue;
      }
    };

    let http = resp.status();
    let text = resp.text().await.unwrap_or_default();

    if !http.is_success() {
      eprintln!("[MINER {}] /v1/jobs/next FAIL {} {}", miner_id, http, text);
      sleep(Duration::from_millis(NEXT_FAIL_BACKOFF_MS + jitter_ms(1200))).await;
      continue;
    }

    let parsed: ApiResponse<NextJobData> = match serde_json::from_str(&text) {
      Ok(v) => v,
      Err(e) => {
        eprintln!("[MINER {}] /v1/jobs/next JSON ERROR: {} body={}", miner_id, e, text);
        sleep(Duration::from_millis(NEXT_FAIL_BACKOFF_MS + jitter_ms(1200))).await;
        continue;
      }
    };

    let lease = match parsed.data.job {
      Some(j) => j,
      None => {
        if last_idle_log.elapsed() >= Duration::from_secs(10) {
          println!("[MINER {}] idle (no job) ts={}", miner_id, parsed.ts);
          last_idle_log = Instant::now();
        }
        sleep(Duration::from_millis(NEXT_IDLE_SLEEP_MS + jitter_ms(900))).await;
        continue;
      }
    };

    let job_id = lease.id;
    let work_units = lease.work_units;

    // ✅ NEW: include coordinator_id for launcher parsing / node activity feed
    println!(
      "[MINER {}] job assigned coordinator_id={} id={} wu={} lease_expires_unix={} server_ts={}",
      miner_id, coordinator_id, job_id, work_units, lease.lease_expires_unix, parsed.ts
    );

    let work_ms = work_time_ms(work_units);
    let work_start = Instant::now();
    sleep(Duration::from_millis(work_ms + jitter_ms(350))).await;
    let elapsed_ms = work_start.elapsed().as_millis() as u64;

    let ts = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs() as u64;

    let payload_to_sign = ProofPayloadV1ToSign {
      node_id: coordinator_id.clone(),
      miner_id: Some(miner_id.clone()),
      job_id,
      work_units,
      workload_mode: compute_profile.clone(),
      elapsed_ms,
      client_version: "protocol-v1".to_string(),
      ts,
    };

    let payload_bytes = serde_json::to_vec(&payload_to_sign).unwrap_or_default();
    let hash = Sha256::digest(&payload_bytes);
    let proof_hash_hex = hex::encode(hash);

    let sig = signing.sign(hash.as_slice());
    let signature_hex = hex::encode(sig.to_bytes());

    let proof_body = json!({
      "node_id": coordinator_id.clone(),
      "miner_id": miner_id.clone(),
      "work_units": work_units,
      "workload_mode": compute_profile.clone(),
      "elapsed_ms": elapsed_ms,
      "client_version": "protocol-v1",
      "timestamp_unix": ts,
      "signature_hex": signature_hex.clone(),
      "public_key_hex": public_key_hex.clone(),
      "result_hash": null
    });

    let url = proof_url_per_job(job_id);

    let mut sent_ok = false;
    let mut last_status: Option<reqwest::StatusCode> = None;
    let mut last_body = String::new();

    match client
      .post(&url)
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
        eprintln!("[MINER {}] proof ERROR job={} err={}", miner_id, job_id, e);
      }
    }

    if sent_ok {
      println!(
        "MINER_PROOF node_id={} miner_id={} coordinator_id={} job={} wu={} elapsed_ms={} ts={} hash={} sig={} pubkey={}",
        coordinator_id,
        miner_id,
        coordinator_id,
        job_id,
        work_units,
        elapsed_ms,
        ts,
        proof_hash_hex,
        signature_hex,
        public_key_hex
      );
    } else if let Some(st) = last_status {
      eprintln!("[MINER {}] proof FAIL job={} {} {}", miner_id, job_id, st, last_body);
    } else {
      eprintln!("[MINER {}] proof FAIL job={} (no status)", miner_id, job_id);
    }

    let target = TARGET_MIN_CYCLE_MS + jitter_ms(TARGET_MAX_CYCLE_MS - TARGET_MIN_CYCLE_MS);
    let elapsed = cycle_start.elapsed().as_millis() as u64;
    if elapsed < target {
      sleep(Duration::from_millis(target - elapsed)).await;
    }
  }
}
