use anyhow::{anyhow, Context, Result};
use ed25519_dalek::{SigningKey, VerifyingKey};
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};
use std::{
    convert::TryInto,
    fs,
    path::Path,
    thread,
    time::Duration,
};

#[derive(Debug, Serialize, Deserialize)]
struct NodeConfig {
    /// Unique identifier for this node
    node_id: String,
    /// Kaspa RPC endpoint (later real Kaspa node)
    kaspa_rpc_url: String,
    /// CPU, GPU or mixed
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
    let cfg: NodeConfig = serde_yaml::from_str(&contents)
        .with_context(|| format!("Invalid YAML in {}", path))?;
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

    let sk_bytes = hex::decode(identity.secret_key_hex.clone())
        .map_err(|e| anyhow!("Invalid secret key hex: {e}"))?;

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

fn print_banner() {
    println!();
    println!("========================================");
    println!("      KASCompute Node Launcher v0.2");
    println!("        (Identity + Simulation)");
    println!("========================================");
    println!();
}

fn main() -> Result<()> {
    print_banner();

    let config_path = "configs/node-config.yaml";
    let identity_path = "configs/node-identity.json";

    let cfg = ensure_config(config_path)?;
    let (_signing_key, verify_key) = ensure_identity(identity_path)?;

    println!("Loaded node config:");
    println!("  Node ID        : {}", cfg.node_id);
    println!("  Kaspa RPC      : {}", cfg.kaspa_rpc_url);
    println!("  Compute Profile: {}", cfg.compute_profile);
    println!("  Dashboard URL  : {}", cfg.dashboard_url);
    println!();

    println!("Loaded node identity:");
    println!("  Public key (hex): {}", hex::encode(verify_key.to_bytes()));
    println!();
    println!("➜ Starting simulated node heartbeat loop...");
    println!("  (Next step: send signed heartbeats to the network.)\n");

    loop {
        println!(
            "[NODE {}] Heartbeat – RPC: {} | mode: {}",
            cfg.node_id, cfg.kaspa_rpc_url, cfg.compute_profile
        );

        thread::sleep(Duration::from_secs(10));
    }
}
