use std::{
    collections::HashMap,
    env,
    net::{IpAddr, SocketAddr},
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};

use axum::{
    extract::{connect_info::ConnectInfo, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use axum::http::HeaderMap;
use axum::response::Redirect;

use rand::Rng;
use serde::{Deserialize, Serialize};
use serde_json::json;

use tokio::time::{sleep, Duration};
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::{ServeDir, ServeFile};

use std::path::PathBuf;


// =====================================
// TIME HELPERS
// =====================================

fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs()
}

/// Anzahl Monate (à 30 Tage) seit `start`
fn months_since(start: u64) -> u64 {
    let seconds_per_month = 30 * 24 * 60 * 60;
    let now = now_unix();
    (now - start) / seconds_per_month
}

// =====================================
// KCT MINING PARAMETER
// =====================================

const NANO: u64 = 100_000_000; // 1 KCT = 100_000_000 nanoKCT

fn kct_to_nano(kct: f64) -> u64 {
    (kct * NANO as f64) as u64
}

// Whitepaper-Parameter
const START_REWARD_KCT: f64 = 200.0;
const MONTHLY_DECAY: f64 = 0.99;
const BLOCK_TIME_SECONDS: u64 = 60;

// Verified bonus (hash mode)
const VERIFIED_BONUS_MULT: f64 = 1.10;

// Optional anti-spam: node must be seen for at least X seconds before rewards count
const MIN_UPTIME_FOR_REWARDS_SEC: u64 = 60;

// =====================================
// PROXY-AWARE CLIENT IP (Render-ready)
// =====================================

fn client_ip_from_headers(headers: &HeaderMap, fallback: IpAddr) -> IpAddr {
    if let Some(v) = headers.get("x-forwarded-for").and_then(|h| h.to_str().ok()) {
        if let Some(first) = v
            .split(',')
            .next()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
        {
            if let Ok(ip) = first.parse::<IpAddr>() {
                return ip;
            }
        }
    }

    if let Some(v) = headers.get("x-real-ip").and_then(|h| h.to_str().ok()) {
        if let Ok(ip) = v.trim().parse::<IpAddr>() {
            return ip;
        }
    }

    fallback
}

// =====================================
// GEO-IP MODELS
// =====================================

#[derive(Debug, Deserialize)]
struct IpApiResponse {
    status: String,
    country: Option<String>,
    lat: Option<f64>,
    lon: Option<f64>,
}

async fn geo_lookup(ip: IpAddr) -> Option<(f64, f64, Option<String>)> {
    let url = format!("https://ip-api.com/json/{ip}?fields=status,country,lat,lon");
    let resp = reqwest::get(&url).await.ok()?;
    let body: IpApiResponse = resp.json().await.ok()?;

    if body.status == "success" {
        if let (Some(lat), Some(lon)) = (body.lat, body.lon) {
            return Some((lat, lon, body.country));
        }
    }
    None
}

// =====================================
// DATA MODELS
// =====================================

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Node {
    node_id: String,
    public_key_hex: String,
    last_seen_unix: u64,
    latitude: Option<f64>,
    longitude: Option<f64>,
    country: Option<String>,
}

#[derive(Debug, Deserialize)]
struct HeartbeatPayload {
    node_id: String,
    public_key_hex: String,

    #[serde(default)]
    latitude: Option<f64>,
    #[serde(default)]
    longitude: Option<f64>,
    #[serde(default)]
    country: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
enum JobStatus {
    Pending,
    Running,
    Completed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Job {
    id: u64,
    work_units: u64,
    status: JobStatus,
    assigned_node: Option<String>,
    created_unix: u64,
    updated_unix: u64,

    // NEW: lifecycle realism
    assigned_unix: Option<u64>,
    completed_unix: Option<u64>,

    // DEMO tagging (sauber löschen ohne Überraschungen)
    is_demo: bool,
}

#[derive(Debug, Clone, Serialize)]
struct JobsSummary {
    pending: u64,
    running: u64,
    completed: u64,
    total: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ProofRecord {
    node_id: String,
    job_id: u64,

    // raw work
    work_units: u64,

    // NEW: effective work (verified bonus applied)
    effective_work_units: u64,

    timestamp_unix: u64,

    // NEW proof meta
    workload_mode: String,          // "sim" | "hash"
    elapsed_ms: u64,
    result_hash: Option<String>,
    client_version: Option<String>,
    receipt: String,
}

#[derive(Debug, Deserialize)]
struct NextJobRequest {
    node_id: String,
}

#[derive(Debug, Deserialize)]
struct ProofPayload {
    node_id: String,
    job_id: u64,
    work_units: u64,

    // NEW optional fields from miner
    #[serde(default)]
    workload_mode: Option<String>,
    #[serde(default)]
    elapsed_ms: Option<u64>,
    #[serde(default)]
    result_hash: Option<String>,
    #[serde(default)]
    client_version: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct NodeMiningStats {
    node_id: String,
    total_mined_nano: u64,
    last_block_reward_nano: u64,
    hashrate_share: f64,
    cumulative_work_units: u64,
}

#[derive(Debug, Clone, Serialize)]
struct MiningStats {
    block_height: u64,
    current_block_reward_kct: f64,
    current_block_reward_nano: u64,
    month_index: u64,
    total_emitted_nano: u64,
    per_node: Vec<NodeMiningStats>,
    timestamp: u64,
}

// NEW: persistent per-node accounting (fairness + leaderboard)
#[derive(Debug, Clone, Serialize, Deserialize)]
struct NodeStats {
    node_id: String,
    first_seen_unix: u64,
    last_seen_unix: u64,
    total_effective_work_units: u64,
    verified_work_units: u64,
}

// NEW: recent jobs view for frontend audit table
#[derive(Debug, Clone, Serialize)]
struct RecentJobView {
    id: u64,
    status: JobStatus,
    work_units: u64,
    assigned_node: Option<String>,
    created_unix: u64,
    updated_unix: u64,
    assigned_unix: Option<u64>,
    completed_unix: Option<u64>,

    workload_mode: Option<String>,
    elapsed_ms: Option<u64>,
    result_hash: Option<String>,
    client_version: Option<String>,
    receipt: Option<String>,
}

// NEW: reward leaderboard view
#[derive(Debug, Clone, Serialize)]
struct RewardView {
    node_id: String,
    effective_work_units: u64,
    verified_work_units: u64,
    share: f64,
}

// DEMO: status response
#[derive(Debug, Clone, Serialize)]
struct DemoStatus {
    enabled: bool,
    demo_nodes: usize,
    demo_jobs: usize,
}

// METRICS: mainnet-friendly telemetry (read-only)
#[derive(Debug, Clone, Serialize)]
struct Metrics {
    window_sec: u64,
    active_nodes_90s: usize,
    active_miners_90s: usize,
    jobs_completed_window: usize,
    jobs_per_min: f64,
    avg_job_ms: u64,
    proofs_window: usize,
    timestamp: u64,
}


// =====================================
// GLOBAL STATE
// =====================================

#[derive(Clone)]
struct AppState {
    inner: Arc<Mutex<InnerState>>,
}

struct InnerState {
    nodes: HashMap<String, Node>,
    jobs: HashMap<u64, Job>,
    proofs: Vec<ProofRecord>,
    next_job_id: u64,

    genesis_time: u64,
    block_height: u64,
    total_emitted_nano: u64,
    node_rewards: HashMap<String, u64>,
    node_last_block_reward: HashMap<String, u64>,
    node_cumulative_work: HashMap<String, u64>,

    // NEW
    node_stats: HashMap<String, NodeStats>,

    // DEMO
    demo_running: bool,
}

impl AppState {
    fn new() -> Self {
        let genesis = now_unix();
        let inner = InnerState {
            nodes: HashMap::new(),
            jobs: HashMap::new(),
            proofs: Vec::new(),
            next_job_id: 1,
            genesis_time: genesis,
            block_height: 0,
            total_emitted_nano: 0,
            node_rewards: HashMap::new(),
            node_last_block_reward: HashMap::new(),
            node_cumulative_work: HashMap::new(),
            node_stats: HashMap::new(),
            demo_running: false,
        };

        AppState {
            inner: Arc::new(Mutex::new(inner)),
        }
    }

    fn list_recent_proofs(&self, limit: usize) -> Vec<ProofRecord> {
        let s = self.inner.lock().unwrap();
        let mut v = s.proofs.clone();
        v.sort_by(|a, b| b.timestamp_unix.cmp(&a.timestamp_unix));
        if v.len() > limit {
            v.truncate(limit);
        }
        v
    }

    fn list_nodes(&self) -> Vec<Node> {
        let s = self.inner.lock().unwrap();
        let mut nodes: Vec<Node> = s.nodes.values().cloned().collect();
        nodes.sort_by(|a, b| a.node_id.cmp(&b.node_id));
        nodes
    }

    // NEW: recent jobs + proof meta (audit table)
    fn list_recent_jobs_with_proofs(&self, limit: usize) -> Vec<RecentJobView> {
        let s = self.inner.lock().unwrap();

        let mut jobs: Vec<Job> = s.jobs.values().cloned().collect();
        jobs.sort_by(|a, b| b.updated_unix.cmp(&a.updated_unix));
        if jobs.len() > limit {
            jobs.truncate(limit);
        }

        jobs.into_iter()
            .map(|j| {
                let proof = s.proofs.iter().rev().find(|p| p.job_id == j.id);

                RecentJobView {
                    id: j.id,
                    status: j.status.clone(),
                    work_units: j.work_units,
                    assigned_node: j.assigned_node.clone(),
                    created_unix: j.created_unix,
                    updated_unix: j.updated_unix,
                    assigned_unix: j.assigned_unix,
                    completed_unix: j.completed_unix,

                    workload_mode: proof.map(|p| p.workload_mode.clone()),
                    elapsed_ms: proof.map(|p| p.elapsed_ms),
                    result_hash: proof.and_then(|p| p.result_hash.clone()),
                    client_version: proof.and_then(|p| p.client_version.clone()),
                    receipt: proof.map(|p| p.receipt.clone()),
                }
            })
            .collect()
    }

    // NEW: rewards leaderboard (fair shares)
    fn rewards_leaderboard(&self) -> Vec<RewardView> {
        let s = self.inner.lock().unwrap();

        let total: u64 = s
            .node_stats
            .values()
            .map(|n| n.total_effective_work_units)
            .sum();

        let mut out: Vec<RewardView> = s
            .node_stats
            .values()
            .map(|n| RewardView {
                node_id: n.node_id.clone(),
                effective_work_units: n.total_effective_work_units,
                verified_work_units: n.verified_work_units,
                share: if total > 0 {
                    n.total_effective_work_units as f64 / total as f64
                } else {
                    0.0
                },
            })
            .collect();

        out.sort_by(|a, b| b.effective_work_units.cmp(&a.effective_work_units));
        out
    }

    // =========================
    // DEMO MODE (LOCAL ONLY)
    // =========================

    fn demo_spawn(&self, nodes: usize, jobs: usize) {
        let mut s = self.inner.lock().unwrap();
        s.demo_running = true;

        let now = now_unix();

        // demo nodes
        for i in 0..nodes {
            let node_id = format!("demo-node-{:02}", i + 1);

            // deterministic geo spread
            let lat = 48.0 + (i as f64 * 0.18);
            let lon = 11.0 + (i as f64 * 0.22);

            s.nodes.insert(
                node_id.clone(),
                Node {
                    node_id: node_id.clone(),
                    public_key_hex: format!("demo{:02}deadbeef", i + 1),
                    last_seen_unix: now,
                    latitude: Some(lat),
                    longitude: Some(lon),
                    country: Some("DEMO".to_string()),
                },
            );

            // init accounting maps
            s.node_rewards.entry(node_id.clone()).or_insert(0);
            s.node_last_block_reward.entry(node_id.clone()).or_insert(0);
            s.node_cumulative_work.entry(node_id.clone()).or_insert(0);

            // let demo nodes pass uptime gate immediately
            s.node_stats.entry(node_id.clone()).or_insert(NodeStats {
                node_id,
                first_seen_unix: now.saturating_sub(MIN_UPTIME_FOR_REWARDS_SEC + 10),
                last_seen_unix: now,
                total_effective_work_units: 0,
                verified_work_units: 0,
            });
        }

        // demo jobs pending
        let mut rng = rand::thread_rng();
        for _ in 0..jobs {
            let wu = rng.gen_range(500_000..=5_000_000);

            let id = s.next_job_id;
            s.next_job_id += 1;

            s.jobs.insert(
                id,
                Job {
                    id,
                    work_units: wu,
                    status: JobStatus::Pending,
                    assigned_node: None,
                    created_unix: now,
                    updated_unix: now,
                    assigned_unix: None,
                    completed_unix: None,
                    is_demo: true,
                },
            );
        }
    }

    fn demo_clear(&self) {
        let mut s = self.inner.lock().unwrap();
        s.demo_running = false;

        // remove demo nodes + accounting
        s.nodes.retain(|k, _| !k.starts_with("demo-"));
        s.node_rewards.retain(|k, _| !k.starts_with("demo-"));
        s.node_last_block_reward.retain(|k, _| !k.starts_with("demo-"));
        s.node_cumulative_work.retain(|k, _| !k.starts_with("demo-"));
        s.node_stats.retain(|k, _| !k.starts_with("demo-"));

        // remove demo proofs
        s.proofs.retain(|p| !p.node_id.starts_with("demo-"));

        // remove demo jobs (EXAKT, ohne Überraschungen)
        s.jobs.retain(|_, j| !j.is_demo);
    }

    fn demo_status(&self) -> DemoStatus {
        let s = self.inner.lock().unwrap();
        let demo_nodes = s.nodes.keys().filter(|k| k.starts_with("demo-")).count();
        let demo_jobs = s.jobs.values().filter(|j| j.is_demo).count();
        DemoStatus {
            enabled: s.demo_running,
            demo_nodes,
            demo_jobs,
        }
    }

    // =========================
    // HEARTBEATS + GEO
    // =========================

    fn upsert_node(&self, payload: HeartbeatPayload) {
        let mut s = self.inner.lock().unwrap();
        let now = now_unix();

        let node_id = payload.node_id.clone();

        // nodes map (geo + last_seen)
        let entry = s.nodes.entry(node_id.clone()).or_insert(Node {
            node_id: node_id.clone(),
            public_key_hex: payload.public_key_hex.clone(),
            last_seen_unix: now,
            latitude: payload.latitude,
            longitude: payload.longitude,
            country: payload.country.clone(),
        });

        entry.last_seen_unix = now;
        if payload.latitude.is_some() {
            entry.latitude = payload.latitude;
        }
        if payload.longitude.is_some() {
            entry.longitude = payload.longitude;
        }
        if let Some(country) = payload.country.clone() {
            entry.country = Some(country);
        }

        // ensure rewards maps exist
        s.node_rewards.entry(node_id.clone()).or_insert(0);

        // NEW: node_stats init/update
        let st = s.node_stats.entry(node_id.clone()).or_insert(NodeStats {
            node_id: node_id.clone(),
            first_seen_unix: now,
            last_seen_unix: now,
            total_effective_work_units: 0,
            verified_work_units: 0,
        });
        st.last_seen_unix = now;
    }

    // =========================
    // JOBS
    // =========================

    fn create_scheduled_job(&self) {
        let mut s = self.inner.lock().unwrap();

        let mut rng = rand::thread_rng();
        let wu = rng.gen_range(500_000..=5_000_000);

        let id = s.next_job_id;
        s.next_job_id += 1;

        let now = now_unix();

        s.jobs.insert(
            id,
            Job {
                id,
                work_units: wu,
                status: JobStatus::Pending,
                assigned_node: None,
                created_unix: now,
                updated_unix: now,
                assigned_unix: None,
                completed_unix: None,
                is_demo: false,
            },
        );

        println!("[scheduler] new job #{} ({} wu)", id, wu);
    }

    fn assign_job(&self, node_id: &str) -> Option<Job> {
        let mut s = self.inner.lock().unwrap();

        if !s.nodes.contains_key(node_id) {
            return None;
        }

        // pick first pending
        let mut picked: Option<u64> = None;
        for (id, job) in s.jobs.iter() {
            if matches!(job.status, JobStatus::Pending) {
                picked = Some(*id);
                break;
            }
        }

        let job_id = picked?;
        let job = s.jobs.get_mut(&job_id).unwrap();

        job.status = JobStatus::Running;
        job.assigned_node = Some(node_id.to_string());
        job.assigned_unix = Some(now_unix());
        job.updated_unix = now_unix();

        Some(job.clone())
    }

    fn complete_job(&self, proof: ProofPayload) -> Result<(), &'static str> {
        let mut s = self.inner.lock().unwrap();

        let job = s.jobs.get_mut(&proof.job_id).ok_or("job_not_found")?;
        if !matches!(job.status, JobStatus::Running) {
            return Err("job_not_running");
        }
        if job.assigned_node.as_ref() != Some(&proof.node_id) {
            return Err("job_wrong_node");
        }

        let ts = now_unix();

        // finalize job
        job.status = JobStatus::Completed;
        job.updated_unix = ts;
        job.completed_unix = Some(ts);

        // workload mode default
        let mode = proof
            .workload_mode
            .clone()
            .unwrap_or_else(|| "sim".to_string());

        // miner time (fallback)
        let elapsed_ms = proof.elapsed_ms.unwrap_or_else(|| {
            if let Some(a) = job.assigned_unix {
                (ts.saturating_sub(a)) * 1000
            } else {
                0
            }
        });

        // verified?
        let is_verified = mode.as_str() == "hash";

        // effective work units (verified bonus)
        let effective_wu = if is_verified {
            (proof.work_units as f64 * VERIFIED_BONUS_MULT) as u64
        } else {
            proof.work_units
        };

        // receipt (simple, no new deps)
        let receipt = format!("rcpt:{}:{}:{}:{}", proof.node_id, proof.job_id, ts, proof.work_units);

        // store proof
        s.proofs.push(ProofRecord {
            node_id: proof.node_id.clone(),
            job_id: proof.job_id,
            work_units: proof.work_units,
            effective_work_units: effective_wu,
            timestamp_unix: ts,
            workload_mode: mode.clone(),
            elapsed_ms,
            result_hash: proof.result_hash.clone(),
            client_version: proof.client_version.clone(),
            receipt,
        });

        // cumulative work tracking (raw)
        let entry = s.node_cumulative_work.entry(proof.node_id.clone()).or_insert(0);
        *entry += proof.work_units;

        // NEW: per-node stats tracking (effective + verified raw)
        let st = s.node_stats.entry(proof.node_id.clone()).or_insert(NodeStats {
            node_id: proof.node_id.clone(),
            first_seen_unix: ts,
            last_seen_unix: ts,
            total_effective_work_units: 0,
            verified_work_units: 0,
        });
        st.last_seen_unix = ts;
        st.total_effective_work_units += effective_wu;
        if is_verified {
            st.verified_work_units += proof.work_units;
        }

        println!(
            "[proof] node={} completed job #{} ({} wu, effective={}, mode={})",
            proof.node_id, proof.job_id, proof.work_units, effective_wu, mode
        );

        Ok(())
    }

    fn list_jobs(&self) -> Vec<Job> {
        let s = self.inner.lock().unwrap();
        let mut v: Vec<_> = s.jobs.values().cloned().collect();
        v.sort_by_key(|j| j.id);
        v
    }

    fn summarize_jobs(&self) -> JobsSummary {
        let s = self.inner.lock().unwrap();
        let mut p = 0;
        let mut r = 0;
        let mut c = 0;

        for j in s.jobs.values() {
            match j.status {
                JobStatus::Pending => p += 1,
                JobStatus::Running => r += 1,
                JobStatus::Completed => c += 1,
            }
        }

        JobsSummary {
            pending: p,
            running: r,
            completed: c,
            total: p + r + c,
        }
    }

    // =========================
    // MINING ENGINE
    // =========================

    fn mine_new_block(&self) {
        let mut s = self.inner.lock().unwrap();

        s.block_height += 1;

        let months = months_since(s.genesis_time);
        let reward_kct = START_REWARD_KCT * MONTHLY_DECAY.powf(months as f64);
        let reward_nano = kct_to_nano(reward_kct);

        let now = now_unix();
        let window: u64 = 300;

        let mut weight_map: HashMap<String, f64> = HashMap::new();
        let mut total_wu: f64 = 0.0;

        for p in s.proofs.iter() {
            if now >= p.timestamp_unix && now - p.timestamp_unix <= window {
                // anti-spam: require node uptime
                let allow = s.node_stats.get(&p.node_id).map(|st| {
                    now.saturating_sub(st.first_seen_unix) >= MIN_UPTIME_FOR_REWARDS_SEC
                }).unwrap_or(false);

                if !allow {
                    continue;
                }

                *weight_map.entry(p.node_id.clone()).or_insert(0.0) += p.effective_work_units as f64;
                total_wu += p.effective_work_units as f64;
            }
        }

        s.node_last_block_reward.clear();

        if total_wu > 0.0 {
            for (node, wu) in weight_map {
                let share = wu / total_wu;
                let amount = (reward_nano as f64 * share) as u64;

                *s.node_rewards.entry(node.clone()).or_insert(0) += amount;
                s.node_last_block_reward.insert(node, amount);
            }
        }

        s.total_emitted_nano += reward_nano;

        println!(
            "[mining] Block #{} • reward {} nanoKCT",
            s.block_height, reward_nano
        );
    }

    fn mining_stats(&self) -> MiningStats {
        let s = self.inner.lock().unwrap();

        let months = months_since(s.genesis_time);
        let reward_kct = START_REWARD_KCT * MONTHLY_DECAY.powf(months as f64);
        let reward_nano = kct_to_nano(reward_kct);

        let now = now_unix();
        let window: u64 = 300;

        let mut weight_map: HashMap<String, f64> = HashMap::new();
        let mut total_wu: f64 = 0.0;

        for p in s.proofs.iter() {
            if now >= p.timestamp_unix && now - p.timestamp_unix <= window {
                let allow = s.node_stats.get(&p.node_id).map(|st| {
                    now.saturating_sub(st.first_seen_unix) >= MIN_UPTIME_FOR_REWARDS_SEC
                }).unwrap_or(false);

                if !allow {
                    continue;
                }

                *weight_map.entry(p.node_id.clone()).or_insert(0.0) += p.effective_work_units as f64;
                total_wu += p.effective_work_units as f64;
            }
        }

        let mut per_node = Vec::new();
        for (node_id, _) in s.nodes.iter() {
            let total = *s.node_rewards.get(node_id).unwrap_or(&0);
            let last = *s.node_last_block_reward.get(node_id).unwrap_or(&0);

            let wu_for_node = *weight_map.get(node_id).unwrap_or(&0.0);
            let share_pct = if total_wu > 0.0 {
                (wu_for_node / total_wu) * 100.0
            } else {
                0.0
            };

            let cumulative_work = *s.node_cumulative_work.get(node_id).unwrap_or(&0);

            per_node.push(NodeMiningStats {
                node_id: node_id.clone(),
                total_mined_nano: total,
                last_block_reward_nano: last,
                hashrate_share: share_pct,
                cumulative_work_units: cumulative_work,
            });
        }

        MiningStats {
            block_height: s.block_height,
            current_block_reward_kct: (reward_nano as f64) / (NANO as f64),
            current_block_reward_nano: reward_nano,
            month_index: months,
            total_emitted_nano: s.total_emitted_nano,
            per_node,
            timestamp: now_unix(),
        }
    }
}

impl AppState {
    fn compute_metrics(&self, window_sec: u64) -> Metrics {
        let s = self.inner.lock().unwrap();
        let now = now_unix();
        let window = window_sec;

        // Active nodes (90s)
        let active_nodes_90s = s
            .nodes
            .values()
            .filter(|n| now.saturating_sub(n.last_seen_unix) <= 90)
            .count();

        // Proofs in window
        let proofs_window: Vec<&ProofRecord> = s
            .proofs
            .iter()
            .filter(|p| now >= p.timestamp_unix && now - p.timestamp_unix <= window)
            .collect();

        let proofs_count = proofs_window.len();

        // Active miners (90s) = nodes that produced proofs recently
        let mut active_miners = std::collections::HashSet::<String>::new();
        for p in proofs_window.iter() {
            if now.saturating_sub(p.timestamp_unix) <= 90 {
                active_miners.insert(p.node_id.clone());
            }
        }
        let active_miners_90s = active_miners.len();

        // Jobs completed in window + avg duration
        let mut completed_jobs = 0usize;
        let mut total_job_ms: u128 = 0;

        for j in s.jobs.values() {
            if let (Some(assigned), Some(done)) = (j.assigned_unix, j.completed_unix) {
                if now >= done && now - done <= window {
                    completed_jobs += 1;
                    total_job_ms += ((done - assigned) as u128) * 1000;
                }
            }
        }

        let avg_job_ms = if completed_jobs > 0 {
            (total_job_ms / completed_jobs as u128) as u64
        } else {
            0
        };

        let jobs_per_min = if window > 0 {
            (completed_jobs as f64) * 60.0 / (window as f64)
        } else {
            0.0
        };

        Metrics {
            window_sec,
            active_nodes_90s,
            active_miners_90s,
            jobs_completed_window: completed_jobs,
            jobs_per_min,
            avg_job_ms,
            proofs_window: proofs_count,
            timestamp: now,
        }
    }
}


// =====================================
// BACKGROUND TASKS
// =====================================

fn spawn_scheduler(state: AppState) {
    tokio::spawn(async move {
        loop {
            state.create_scheduled_job();
            sleep(Duration::from_secs(10)).await;
        }
    });
}

fn spawn_block_miner(state: AppState) {
    tokio::spawn(async move {
        loop {
            sleep(Duration::from_secs(BLOCK_TIME_SECONDS)).await;
            state.mine_new_block();
        }
    });
}

// =====================================
// HANDLERS
// =====================================

async fn health() -> &'static str {
    "OK"
}

#[derive(Serialize)]
struct HealthPayload {
    ok: bool,
    uptime_sec: u64,
    nodes_total: usize,
    nodes_online_90s: usize,
    jobs_total: usize,
    jobs_pending: u64,
    jobs_running: u64,
    jobs_completed: u64,
    block_height: u64,
    month_index: u64,
    total_emitted_nano: u64,
    timestamp: u64,
}

async fn api_health(State(state): State<AppState>) -> Json<HealthPayload> {
    let now = now_unix();

    let s = state.inner.lock().unwrap();

    let nodes_total = s.nodes.len();
    let nodes_online_90s = s
        .nodes
        .values()
        .filter(|n| now.saturating_sub(n.last_seen_unix) <= 90)
        .count();

    let mut pending = 0;
    let mut running = 0;
    let mut completed = 0;
    for j in s.jobs.values() {
        match j.status {
            JobStatus::Pending => pending += 1,
            JobStatus::Running => running += 1,
            JobStatus::Completed => completed += 1,
        }
    }

    let uptime_sec = now.saturating_sub(s.genesis_time);

    Json(HealthPayload {
        ok: true,
        uptime_sec,
        nodes_total,
        nodes_online_90s,
        jobs_total: s.jobs.len(),
        jobs_pending: pending,
        jobs_running: running,
        jobs_completed: completed,
        block_height: s.block_height,
        month_index: months_since(s.genesis_time),
        total_emitted_nano: s.total_emitted_nano,
        timestamp: now,
    })
}

async fn heartbeat(
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(state): State<AppState>,
    Json(mut payload): Json<HeartbeatPayload>,
) -> StatusCode {
    let client_ip = client_ip_from_headers(&headers, addr.ip());

    if payload.latitude.is_none() || payload.longitude.is_none() {
        if let Some((lat, lon, country)) = geo_lookup(client_ip).await {
            payload.latitude = Some(lat);
            payload.longitude = Some(lon);
            if payload.country.is_none() {
                payload.country = country;
            }
        }
    }

    state.upsert_node(payload);
    StatusCode::OK
}

#[derive(Serialize)]
struct NextJobResponse {
    id: Option<u64>,
    work_units: Option<u64>,
}

async fn next_job(
    State(state): State<AppState>,
    Json(req): Json<NextJobRequest>,
) -> Json<NextJobResponse> {
    if let Some(job) = state.assign_job(&req.node_id) {
        Json(NextJobResponse {
            id: Some(job.id),
            work_units: Some(job.work_units),
        })
    } else {
        Json(NextJobResponse {
            id: None,
            work_units: None,
        })
    }
}

async fn submit_proof(
    State(state): State<AppState>,
    Json(p): Json<ProofPayload>,
) -> (StatusCode, Json<serde_json::Value>) {
    match state.complete_job(p) {
        Ok(()) => (StatusCode::OK, Json(json!({ "status": "ok" }))),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(json!({ "status": "error", "message": e })),
        ),
    }
}

async fn list_jobs(State(state): State<AppState>) -> Json<Vec<Job>> {
    Json(state.list_jobs())
}

async fn jobs_summary(State(state): State<AppState>) -> Json<JobsSummary> {
    Json(state.summarize_jobs())
}

async fn mining_info(State(state): State<AppState>) -> Json<MiningStats> {
    Json(state.mining_stats())
}

async fn list_nodes_handler(State(state): State<AppState>) -> Json<Vec<Node>> {
    Json(state.list_nodes())
}

async fn list_proofs(State(state): State<AppState>) -> Json<Vec<ProofRecord>> {
    Json(state.list_recent_proofs(200))
}

// NEW: recent jobs (audit)
async fn recent_jobs(State(state): State<AppState>) -> Json<Vec<RecentJobView>> {
    Json(state.list_recent_jobs_with_proofs(50))
}

// NEW: rewards leaderboard
async fn rewards_leaderboard(State(state): State<AppState>) -> Json<Vec<RewardView>> {
    Json(state.rewards_leaderboard())
}

async fn metrics_handler(State(state): State<AppState>) -> Json<Metrics> {
    // v1: 5-Minuten Fenster (passt zu deinem Reward-Window 300s)
    Json(state.compute_metrics(300))
}


// =====================
// DEMO HANDLERS (LOCAL ONLY)
// =====================

async fn demo_status_handler(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(state): State<AppState>,
) -> (StatusCode, Json<DemoStatus>) {
    if !addr.ip().is_loopback() {
        return (
            StatusCode::FORBIDDEN,
            Json(DemoStatus {
                enabled: false,
                demo_nodes: 0,
                demo_jobs: 0,
            }),
        );
    }
    (StatusCode::OK, Json(state.demo_status()))
}

async fn demo_start(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(state): State<AppState>,
) -> (StatusCode, Json<DemoStatus>) {
    if !addr.ip().is_loopback() {
        return (
            StatusCode::FORBIDDEN,
            Json(DemoStatus {
                enabled: false,
                demo_nodes: 0,
                demo_jobs: 0,
            }),
        );
    }

    // idempotent: clean first
    state.demo_clear();
    state.demo_spawn(25, 300);

    (StatusCode::OK, Json(state.demo_status()))
}

async fn demo_stop(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(state): State<AppState>,
) -> (StatusCode, Json<DemoStatus>) {
    if !addr.ip().is_loopback() {
        return (
            StatusCode::FORBIDDEN,
            Json(DemoStatus {
                enabled: false,
                demo_nodes: 0,
                demo_jobs: 0,
            }),
        );
    }

    state.demo_clear();
    (StatusCode::OK, Json(state.demo_status()))
}

// =====================================
// MAIN
// =====================================

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter("info")
        .init();

    let app_state = AppState::new();

    spawn_scheduler(app_state.clone());
    spawn_block_miner(app_state.clone());

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_headers(Any)
        .allow_methods(Any);

    let dashboard_root: PathBuf = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("dashboard-pro");

    println!("dashboard_root = {:?}", dashboard_root);
    println!("index exists? {}", dashboard_root.join("index.html").exists());
    println!("style exists? {}", dashboard_root.join("style.css").exists());

    let dashboard_service = ServeDir::new(dashboard_root.clone())
        .append_index_html_on_directories(true)
        .not_found_service(ServeFile::new(dashboard_root.join("index.html")));

    let app = Router::new()
        .route("/", get(|| async { Redirect::permanent("/dashboard/") }))
        .route("/dashboard", get(|| async { Redirect::permanent("/dashboard/") }))
        .nest_service("/dashboard/", dashboard_service)
        .route("/health", get(health))
        .route("/node/heartbeat", post(heartbeat))
        .route("/nodes", get(list_nodes_handler))
        .route("/jobs/next", post(next_job))
        .route("/jobs/proof", post(submit_proof))
        .route("/jobs", get(list_jobs))
        .route("/jobs/summary", get(jobs_summary))
        .route("/jobs/recent", get(recent_jobs))
        .route("/proofs", get(list_proofs))
        .route("/mining", get(mining_info))
        .route("/rewards/leaderboard", get(rewards_leaderboard))

        // Dashboard API
        .route("/api/health", get(api_health))
        .route("/api/nodes", get(list_nodes_handler))
        .route("/api/jobs", get(list_jobs))
        .route("/api/jobs/summary", get(jobs_summary))
        .route("/api/jobs/recent", get(recent_jobs))
        .route("/api/proofs", get(list_proofs))
        .route("/api/mining", get(mining_info))
        .route("/api/rewards/leaderboard", get(rewards_leaderboard))
        .route("/api/metrics", get(metrics_handler))


        // DEMO API (LOCAL ONLY)
        .route("/api/debug/demo/status", get(demo_status_handler))
        .route("/api/debug/demo/start", post(demo_start))
        .route("/api/debug/demo/stop", post(demo_stop))

        .layer(cors)
        .with_state(app_state);

    // Render-ready PORT
    let port: u16 = env::var("PORT")
        .ok()
        .and_then(|v| v.parse::<u16>().ok())
        .unwrap_or(8080);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();

    println!("KCT PRO Mining Engine running on 0.0.0.0:{port}");

    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await
    .unwrap();
}
