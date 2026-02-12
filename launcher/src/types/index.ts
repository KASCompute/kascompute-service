// KASCompute Launcher Types

export type ServiceStatus = "running" | "stopped" | "starting" | "stopping";

/* =========================
   SERVICE STATUS
========================= */

export interface NodeStatus {
  status: ServiceStatus;
  pid?: number;
  uptime?: string;
  lastHeartbeat?: string;
}

export interface MinerStatus {
  status: ServiceStatus;
  pid?: number;
  uptime?: string;
}

/* =========================
   LOGGING
========================= */

export interface LogEntry {
  id: string;
  target: "node" | "miner";
  timestamp: string;
  message: string;
  level: "info" | "warn" | "error";
}

/* =========================
   CONFIG
========================= */

export interface Config {
  dashboardUrl: string;

  // legacy fields (kept for backward compatibility; UI no longer uses them)
  scriptsDirectory?: string;
  role?: "node" | "miner" | "both";
}

// legacy (UI removed)
export interface RequiredScript {
  name: string;
  present: boolean;
}


/* =========================
   TAURI COMMANDS
========================= */

export type CommandName =
  | "get_config"
  | "set_config"
  | "get_status"
  | "start_node"
  | "stop_node"
  | "start_miner"
  | "stop_miner"
  | "tail_log"
  | "send_heartbeat";

/* =========================
   PROTOCOL API (v1.1)
========================= */

export type ApiEnvelope<T> = {
  status: "ok" | "error";
  data: T;
  error?: any;
  ts?: number;
};

export type NodeMiningStats = {
  node_id: string;
  total_mined_nano: number;
  last_block_reward_nano: number;
  hashrate_share_pct: number;
  cumulative_work_units: number;
};

export type MiningStats = {
  block_height: number;
  current_block_reward_kct: number;
  current_block_reward_nano: number;
  month_index: number;
  total_emitted_nano: number;
  per_node: NodeMiningStats[];
  timestamp: number;
  reward_window_sec: number;
};

export type RewardView = {
  // Backward compatible field name (server: node_id contains miner_id semantics)
  node_id: string;
  effective_work_units: number;
  verified_work_units: number;
  share: number; // 0..1
};

// =========================
// Miner Rewards (Worker)
// =========================

export type MinerBalanceView = {
  miner_id: string;
  total_mined_nano: number;
  last_block_reward_nano: number;
};

export type RewardLedgerEntry = {
  block_height: number;
  timestamp_unix: number;
  miner_id: string;
  amount_nano: number;
  share: number; // 0..1
  compute_units: number;
  proofs_count: number;
  reason: string;
};

// =========================
// Node Rewards (Operator / Coordinator)
// =========================

export type NodeBalanceView = {
  node_id: string;
  total_mined_nano: number;
  last_block_reward_nano: number;
};

export type NodeRewardLedgerEntry = {
  block_height: number;
  timestamp_unix: number;
  node_id: string;
  amount_nano: number;
  share: number; // 0..1
  compute_units: number;
  proofs_count: number;
  reason: string;
};
