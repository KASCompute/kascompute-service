use axum::{
    Json,
    routing::post,
    Router,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use axum::http::StatusCode;
use ed25519_dalek::{VerifyingKey, Signature, Verifier};
use hex;
use std::time::{SystemTime, UNIX_EPOCH};

/// GLOBAL STORAGE (später DB)
/// -------------------------------------
#[derive(Debug, Clone)]
pub struct NodeRegistry {
    inner: Arc<Mutex<HashMap<String, String>>>, // node_id -> public_key_hex
}

impl NodeRegistry {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn insert(&self, node_id: &str, public_key_hex: &str) {
        self.inner
            .lock()
            .unwrap()
            .insert(node_id.to_string(), public_key_hex.to_string());
    }

    pub fn get_public_key(&self, node_id: &str) -> Option<String> {
        self.inner
            .lock()
            .unwrap()
            .get(node_id)
            .cloned()
    }
}

/// SHARED REGISTRY
static mut REGISTRY: Option<NodeRegistry> = None;

pub fn registry() -> &'static NodeRegistry {
    unsafe {
        if REGISTRY.is_none() {
            REGISTRY = Some(NodeRegistry::new());
        }
        REGISTRY.as_ref().unwrap()
    }
}


/// REQUEST/RESPONSE MODELS
/// -------------------------------------

#[derive(Debug, Deserialize)]
pub struct NodeRegisterRequest {
    pub node_id: String,
    pub capabilities: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct NodeRegisterResponse {
    pub accepted: bool,
    pub message: String,
}

#[derive(Debug, Deserialize)]
pub struct ProofOfComputeRequest {
    pub job_id: String,
    pub node_id: String,
    pub result_hash: String,
    pub work_units: u64,
    pub timestamp_unix: u64,
    pub signature: String, // hex-encoded signature from node-launcher
}

#[derive(Debug, Serialize)]
pub struct ProofOfComputeResponse {
    pub accepted: bool,
    pub message: String,
    pub estimated_reward_kct: f64,
    pub timestamp: u64,
}


/// -------------------------------------
/// NODE REGISTER
/// -------------------------------------
async fn register_node(
    Json(req): Json<NodeRegisterRequest>,
) -> Json<NodeRegisterResponse> {
    println!(
        "[BACKEND] Register node {} capabilities={:?}",
        req.node_id, req.capabilities
    );

    // Node wird einfach eingetragen. REAL: Identity muss vom Node mitgeschickt werden.
    if let Some(cap) = req.capabilities {
        if cap.contains("pk=") {
            // später Public Key auslesen
        }
    }

    // v1: Node nur registrieren, Key kommt später durch Heartbeat
    Json(NodeRegisterResponse {
        accepted: true,
        message: "Node registered (testnet) – public key will be added on first heartbeat".into(),
    })
}


/// -------------------------------------
/// SIGNATURE VERIFICATION
/// -------------------------------------
fn verify_signature(
    public_key_hex: &str,
    signature_hex: &str,
    message: &str,
) -> bool {
    // 1) Public Key hex → Bytes
    let pubkey_bytes = match hex::decode(public_key_hex) {
        Ok(b) => b,
        Err(_) => return false,
    };

    if pubkey_bytes.len() != 32 {
        return false;
    }

    let mut pub_arr = [0u8; 32];
    pub_arr.copy_from_slice(&pubkey_bytes);

    let verify_key = match VerifyingKey::from_bytes(&pub_arr) {
        Ok(k) => k,
        Err(_) => return false,
    };

    // 2) Signature hex → Bytes
    let sig_bytes = match hex::decode(signature_hex) {
        Ok(b) => b,
        Err(_) => return false,
    };

    if sig_bytes.len() != 64 {
        return false;
    }

    let mut sig_arr = [0u8; 64];
    sig_arr.copy_from_slice(&sig_bytes);

    let signature = Signature::from_bytes(&sig_arr);

    // 3) Signatur prüfen
    verify_key.verify(message.as_bytes(), &signature).is_ok()
}

/// -------------------------------------
/// PROOF-OF-COMPUTE VERIFICATION
/// -------------------------------------
async fn submit_proof(
    Json(req): Json<ProofOfComputeRequest>,
) -> (StatusCode, Json<ProofOfComputeResponse>) {

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();

    // 1) Node registriert?
    let reg = registry();
    let Some(pubkey_hex) = reg.get_public_key(&req.node_id) else {
        return (
            StatusCode::UNAUTHORIZED,
            Json(ProofOfComputeResponse {
                accepted: false,
                message: "Node not registered".into(),
                estimated_reward_kct: 0.0,
                timestamp: now,
            }),
        );
    };

    // 2) Replay-Schutz (Proof älter als 30 Sekunden? Reject)
    if now.abs_diff(req.timestamp_unix) > 30 {
        return (
            StatusCode::BAD_REQUEST,
            Json(ProofOfComputeResponse {
                accepted: false,
                message: "Timestamp invalid/replay detected".into(),
                estimated_reward_kct: 0.0,
                timestamp: now,
            }),
        );
    }

    // 3) Signatur überprüfen
    let msg = format!(
        "{}|{}|{}|{}",
        req.job_id, req.result_hash, req.work_units, req.timestamp_unix
    );

    let signature_valid = verify_signature(&pubkey_hex, &req.signature, &msg);

    if !signature_valid {
        return (
            StatusCode::UNAUTHORIZED,
            Json(ProofOfComputeResponse {
                accepted: false,
                message: "Invalid signature".into(),
                estimated_reward_kct: 0.0,
                timestamp: now,
            }),
        );
    }

    // 4) Hash mindestens plausibel? (min 16 chars)
    if req.result_hash.len() < 16 {
        return (
            StatusCode::BAD_REQUEST,
            Json(ProofOfComputeResponse {
                accepted: false,
                message: "Result hash too short".into(),
                estimated_reward_kct: 0.0,
                timestamp: now,
            }),
        );
    }

    // 5) Work Units plausibel?
    if req.work_units == 0 || req.work_units > 5_000_000_000 {
        return (
            StatusCode::BAD_REQUEST,
            Json(ProofOfComputeResponse {
                accepted: false,
                message: "work_units invalid".into(),
                estimated_reward_kct: 0.0,
                timestamp: now,
            }),
        );
    }

    println!(
        "[BACKEND] PoC VALIDATED OK: node={} job={} work_units={} hash={}",
        req.node_id, req.job_id, req.work_units, req.result_hash
    );

    // Reward Calculation (DEMO)
    let reward = (req.work_units as f64 / 10000.0) * 0.001;

    (
        StatusCode::OK,
        Json(ProofOfComputeResponse {
            accepted: true,
            message: "Proof validated successfully".into(),
            estimated_reward_kct: reward,
            timestamp: now,
        }),
    )
}


/// PUBLIC ROUTER EXPORT
/// -------------------------------------
pub fn router() -> Router {
    Router::new()
        .route("/api/nodes/register", post(register_node))
        .route("/api/proof-of-compute", post(submit_proof))
}
