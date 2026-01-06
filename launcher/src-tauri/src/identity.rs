use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};

use tauri::{AppHandle, Manager};

use ed25519_dalek::{SigningKey, VerifyingKey};
use rand_core::OsRng;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Identity {
  pub node_id: String,
  pub public_key_hex: String,
  pub private_key_hex: String,
}

fn identity_path(app: &AppHandle) -> PathBuf {
  app
    .path()
    .app_data_dir()
    .expect("no app data dir")
    .join("identity.json")
}

pub fn load_or_create_identity(app: &AppHandle) -> Identity {
  let path = identity_path(app);

  if path.exists() {
    let data = fs::read_to_string(&path).expect("failed to read identity");
    return serde_json::from_str(&data).expect("invalid identity json");
  }

  // generate new keypair
  let signing = SigningKey::generate(&mut OsRng);
  let verify: VerifyingKey = signing.verifying_key();

  let public_key_hex = hex::encode(verify.to_bytes());
  let private_key_hex = hex::encode(signing.to_bytes());

  // stable-ish short id derived from pubkey prefix
  let node_id = format!("kc_{}", &public_key_hex[..16]);

  let identity = Identity {
    node_id,
    public_key_hex,
    private_key_hex,
  };

  if let Some(parent) = path.parent() {
    let _ = fs::create_dir_all(parent);
  }

  fs::write(&path, serde_json::to_string_pretty(&identity).unwrap()).unwrap();

  identity
}
