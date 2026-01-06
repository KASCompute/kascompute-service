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
  scriptsDirectory: string;
  dashboardUrl: string;
  role: "node" | "miner" | "both";
}

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