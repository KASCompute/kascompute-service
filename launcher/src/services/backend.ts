import { invoke } from "@tauri-apps/api/core";

export type BackendStatus = {
  node: { running: boolean; pid: number | null };
  miner: { running: boolean; pid: number | null };
};

export type MetricsStatus = {
  node: { uptime: string; crashes: number };
  miner: { uptime: string; crashes: number };
};

export async function getStatus(): Promise<BackendStatus> {
  return await invoke("get_status");
}

export async function getMetrics(): Promise<MetricsStatus> {
  return await invoke("get_metrics");
}
