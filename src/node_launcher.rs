use anyhow::{anyhow, Context, Result};
use ed25519_dalek::{SigningKey, VerifyingKey};
use ed25519_dalek::Signer;
use rand::rngs::OsRng;
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    convert::TryInto,
    fs,
    path::Path,
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

#[derive(Debug, Serialize, Deserialize)]
struct NodeConfig {
    /// Unique identifier for this node
    node_id: String,
    /// Kaspa RPC endpoint (later real Kaspa node)
    kaspa_rpc_url: String,
    /// "cpu", "gpu-amd", "gpu-nvidia", "mixed"
    compute_profile: String,
    /// Optional: dashboard URL
    dashboard_url: String,
}

impl Default for NodeConfig {
    fn default() -> Self {
        Self {
            node_id: "kct-node-01".to_string(),
            kaspa_rpc_url: "http://127.0.0.1:16110".to_string(),
            compute_profile: "cpu".to_string(),
            dashboard_url: "http://127.0.0.1:8080/dashboard/".to_string(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct NodeIdentity {
    /// Hex-encoded ed25519 public key (32 bytes)
    public_key_hex: String,
    /// Hex-encoded ed25519 secret key (32 bytes) – DO NOT SHARE
    secret_key_hex: String,
}

#[derive(Debug, Serialize)]
struct HeartbeatRequest {
    node_id: String,
    public_key_hex: String,
    compute_profile: String,
    timestamp_unix: u64,
    signature_hex: String,
}

// ---------- Proof-of-Compute Payloads ----------

#[derive(Debug, Serialize)]
struct ProofOfComputeRequest {
    job_id: String,
    node_id: String,
    result_hash: String,
    work_units: u64,
    timestamp_unix: u64,
    /// wird im Backend als `signature`-Feld erwartet
    signature: String,
}

#[derive(Debug, Deserialize)]
struct ProofOfComputeResponse {
    accepted: bool,
    message: String,
    estimated_reward_kct: f64,
    timestamp: u64,
}

// ================================================================
// CONFIG & IDENTITY
// ================================================================

fn ensure_config(path: &str) -> Result<NodeConfig> {
    let cfg_path = Path::new(path);

    if !cfg_path.exists() {
        let default_cfg = NodeConfig::default();

        if let Some(parent) = cfg_path.parent() {
            fs::create_dir_all(parent)
                .with_context(|| format!("Could not create config directory {:?}", parent))?;
        }

        let yaml = serde_yaml::to_string(&default_cfg)?;
        fs::write(cfg_path, yaml)
            .with_context(|| format!("Could not write default config to {}", path))?;

        println!("➜ Created default node config at: {}", path);
        println!("  Edit this file and restart the node.\n");
    }

    let contents = fs::read_to_string(cfg_path)
        .with_context(|| format!("Could not read node config from {}", path))?;
    let cfg: NodeConfig =
        serde_yaml::from_str(&contents).with_context(|| format!("Invalid YAML in {}", path))?;
    Ok(cfg)
}

fn ensure_identity(path: &str) -> Result<(SigningKey, VerifyingKey)> {
    let id_path = Path::new(path);

    if !id_path.exists() {
        // Generate a new keypair
        let mut rng = OsRng;
        let signing_key = SigningKey::generate(&mut rng);
        let verify_key = signing_key.verifying_key();

        let sk_hex = hex::encode(signing_key.to_bytes());
        let vk_hex = hex::encode(verify_key.to_bytes());

        let identity = NodeIdentity {
            public_key_hex: vk_hex,
            secret_key_hex: sk_hex,
        };

        if let Some(parent) = id_path.parent() {
            fs::create_dir_all(parent)
                .with_context(|| format!("Could not create identity directory {:?}", parent))?;
        }

        let json = serde_json::to_string_pretty(&identity)?;
        fs::write(id_path, json)
            .with_context(|| format!("Could not write identity file to {}", path))?;

        println!("➜ Generated new node keypair at: {}", path);
        println!("  Public key (hex): {}", identity.public_key_hex);
        println!("  Keep this file secret and back it up.\n");

        return Ok((signing_key, verify_key));
    }

    // Load existing identity
    let data = fs::read_to_string(id_path)
        .with_context(|| format!("Could not read identity file from {}", path))?;
    let identity: NodeIdentity = serde_json::from_str(&data)
        .with_context(|| format!("Invalid JSON in identity file {}", path))?;

    let sk_bytes =
        hex::decode(identity.secret_key_hex.clone()).map_err(|e| anyhow!("Invalid secret key hex: {e}"))?;

    if sk_bytes.len() != 32 {
        return Err(anyhow!(
            "Invalid secret key length in identity file (expected 32 bytes, got {})",
            sk_bytes.len()
        ));
    }

    let sk_array: [u8; 32] = sk_bytes
        .as_slice()
        .try_into()
        .map_err(|_| anyhow!("Failed to convert secret key to [u8; 32]"))?;

    let signing_key = SigningKey::from_bytes(&sk_array);
    let verify_key = signing_key.verifying_key();

    Ok((signing_key, verify_key))
}

// ================================================================
// BANNER & BASE-URL
// ================================================================

fn print_banner() {
    println!();
    println!("========================================");
    println!("      KASCompute Node Launcher v0.4");
    println!("  (Signed Heartbeats + Proof-of-Compute)");
    println!("========================================");
    println!();
}

fn api_base_url() -> String {
    std::env::var("KASCOMPUTE_API").unwrap_or_else(|_| "http://127.0.0.1:8080".to_string())
}

// ================================================================
// HEARTBEAT
// ================================================================

fn send_heartbeat(
    client: &Client,
    api_base: &str,
    cfg: &NodeConfig,
    signing_key: &SigningKey,
    verify_key: &VerifyingKey,
) -> Result<()> {
    let url = format!("{}/node/heartbeat", api_base.trim_end_matches('/'));

    // Timestamp + Nachricht bauen
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)?
        .as_secs();
    let msg = format!("{}|{}|{}", cfg.node_id, cfg.compute_profile, ts);

    // Signieren (ed25519-dalek v2 + Signer-Trait)
    let sig = signing_key.sign(msg.as_bytes());

    let payload = HeartbeatRequest {
        node_id: cfg.node_id.clone(),
        public_key_hex: hex::encode(verify_key.to_bytes()),
        compute_profile: cfg.compute_profile.clone(),
        timestamp_unix: ts,
        signature_hex: hex::encode(sig.to_bytes()),
    };

    let resp = client.post(&url).json(&payload).send()?;

    if !resp.status().is_success() {
        println!(
            "[NODE {}] Heartbeat failed with status {}",
            cfg.node_id,
            resp.status()
        );
    } else {
        println!(
            "[NODE {}] Signed heartbeat OK (ts={})",
            cfg.node_id, ts
        );
    }

    Ok(())
}

// ================================================================
// PROOF-OF-COMPUTE ENGINE (CPU / AMD / NVIDIA / MIXED)
// ================================================================

fn cpu_workload(iterations: u64) -> (u64, String) {
    let mut hasher = Sha256::new();
    for i in 0..iterations {
        hasher.update(i.to_le_bytes());
    }
    let result = hasher.finalize();
    (iterations, hex::encode(result))
}

/// Simulierter AMD-GPU-Workload: mehr parallele „Arbeit“ → mehr work_units.
/// Später können wir hier echte ROCm/OpenCL-Calls einbauen.
fn amd_gpu_workload(iterations: u64) -> (u64, String) {
    // Wir tun so, als ob AMD sehr effizient viele Threads hat:
    // einfach mehr Iterationen für jetzt
    cpu_workload(iterations * 8)
}

/// Simulierter NVIDIA-GPU-Workload (Platzhalter)
fn nvidia_gpu_workload(iterations: u64) -> (u64, String) {
    cpu_workload(iterations * 6)
}

/// Kombiniert CPU + GPU
fn mixed_workload(profile: &str) -> (u64, String) {
    let (cpu_units, cpu_hash) = cpu_workload(50_000);

    let (gpu_units, gpu_hash) = match profile {
        "gpu-amd" => amd_gpu_workload(20_000),
        "gpu-nvidia" => nvidia_gpu_workload(20_000),
        _ => cpu_workload(20_000),
    };

    // Hashes kombinieren
    let mut hasher = Sha256::new();
    hasher.update(cpu_hash.as_bytes());
    hasher.update(gpu_hash.as_bytes());
    let final_hash = hasher.finalize();

    (cpu_units + gpu_units, hex::encode(final_hash))
}

/// Wählt Workload abhängig vom compute_profile
fn run_workload_for_profile(compute_profile: &str) -> (u64, String, String) {
    match compute_profile {
        "cpu" => {
            let (units, hash) = cpu_workload(100_000);
            (units, hash, "cpu".to_string())
        }
        "gpu-amd" => {
            let (units, hash) = amd_gpu_workload(40_000);
            (units, hash, "gpu-amd".to_string())
        }
        "gpu-nvidia" => {
            let (units, hash) = nvidia_gpu_workload(40_000);
            (units, hash, "gpu-nvidia".to_string())
        }
        "mixed" => {
            let (units, hash) = mixed_workload("gpu-amd");
            (units, hash, "mixed".to_string())
        }
        other => {
            // Fallback
            let (units, hash) = cpu_workload(50_000);
            println!(
                "[NODE] Unknown compute_profile='{}', falling back to CPU workload.",
                other
            );
            (units, hash, "cpu(fallback)".to_string())
        }
    }
}

fn send_proof_of_compute(
    client: &Client,
    api_base: &str,
    cfg: &NodeConfig,
    signing_key: &SigningKey,
) -> Result<()> {
    let url = format!("{}/api/proof-of-compute", api_base.trim_end_matches('/'));

    let (work_units, result_hash, profile_used) =
        run_workload_for_profile(&cfg.compute_profile);

    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)?
        .as_secs();

    let job_id = "demo-job-1";

    // Message für Signatur
    let msg = format!(
        "{}|{}|{}|{}",
        job_id, result_hash, work_units, ts
    );
    let sig = signing_key.sign(msg.as_bytes());
    let sig_hex = hex::encode(sig.to_bytes());

    let payload = ProofOfComputeRequest {
        job_id: job_id.to_string(),
        node_id: cfg.node_id.clone(),
        result_hash,
        work_units,
        timestamp_unix: ts,
        signature: sig_hex,
    };

    println!(
        "[NODE {}] PoC → profile={} work_units={} ...",
        cfg.node_id, profile_used, payload.work_units
    );

    let resp = client.post(&url).json(&payload).send()?;

    if !resp.status().is_success() {
        println!(
            "[NODE {}] Proof-of-Compute failed with status {}",
            cfg.node_id,
            resp.status()
        );
        return Ok(());
    }

    let body: ProofOfComputeResponse = resp.json()?;
    println!(
        "[NODE {}] PoC accepted={} reward≈{} KCT message='{}'",
        cfg.node_id, body.accepted, body.estimated_reward_kct, body.message
    );

    Ok(())
}

// ================================================================
// MAIN LOOP
// ================================================================

fn main() -> Result<()> {
    print_banner();

    let config_path = "configs/node-config.yaml";
    let identity_path = "configs/node-identity.json";

    let cfg = ensure_config(config_path)?;
    let (signing_key, verify_key) = ensure_identity(identity_path)?;

    println!("Loaded node config:");
    println!("  Node ID        : {}", cfg.node_id);
    println!("  Kaspa RPC      : {}", cfg.kaspa_rpc_url);
    println!("  Compute Profile: {}", cfg.compute_profile);
    println!("  Dashboard URL  : {}", cfg.dashboard_url);
    println!();

    println!("Loaded node identity:");
    println!("  Public key (hex): {}", hex::encode(verify_key.to_bytes()));
    println!();
    println!("➜ Starting simulated node heartbeat + PoC loop...");
    println!("  Backend API base: {}", api_base_url());
    println!("  (AMD/NVIDIA/Mixed via compute_profile)\n");

    let client = Client::new();
    let api_base = api_base_url();

    let mut counter: u64 = 0;

    loop {
        println!(
            "[NODE {}] Heartbeat – RPC: {} | mode: {}",
            cfg.node_id, cfg.kaspa_rpc_url, cfg.compute_profile
        );

        if let Err(err) =
            send_heartbeat(&client, &api_base, &cfg, &signing_key, &verify_key)
        {
            eprintln!("[NODE {}] Failed to send heartbeat: {:?}", cfg.node_id, err);
        }

        // Alle 6 Zyklen (60 Sekunden, weil unten 10s Sleep) → Proof-of-Compute
        if counter % 6 == 0 {
            if let Err(err) =
                send_proof_of_compute(&client, &api_base, &cfg, &signing_key)
            {
                eprintln!(
                    "[NODE {}] Failed to send proof-of-compute: {:?}",
                    cfg.node_id, err
                );
            }
        }

        counter += 1;
        thread::sleep(Duration::from_secs(10));
    }
}
