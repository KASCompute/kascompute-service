import { invoke } from "@tauri-apps/api/core";
import type {
  ApiEnvelope,
  MiningStats,
  RewardView,
  MinerBalanceView,
  RewardLedgerEntry,
  NodeBalanceView,
  NodeRewardLedgerEntry,
} from "@/types";

export type BackendStatus = {
  node: { running: boolean; pid: number | null };
  miner: { running: boolean; pid: number | null };
};

export type MetricsStatus = {
  node: { uptime: string; crashes: number };
  miner: { uptime: string; crashes: number };
};

// =========================
// Tauri invokes (existing)
// =========================

export async function getStatus(): Promise<BackendStatus> {
  return await invoke("get_status");
}

export async function getMetrics(): Promise<MetricsStatus> {
  return await invoke("get_metrics");
}

// =========================
// Protocol HTTP client (v1.1)
// =========================

const DEFAULT_API_BASE = "https://kascompute-protocol-v1.onrender.com/v1";

function apiBase(): string {
  const raw = (import.meta as any)?.env?.VITE_API_BASE ?? DEFAULT_API_BASE;
  return String(raw).trim().replace(/\/+$/, "");
}

async function fetchEnvelope<T>(path: string, init?: RequestInit): Promise<ApiEnvelope<T>> {
  const base = apiBase();
  const p = path.startsWith("/") ? path : `/${path}`;
  const url = `${base}${p}`;

  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // ignore
  }

  if (!res.ok) {
    const body = json ? JSON.stringify(json) : text;
    throw new Error(`HTTP ${res.status} ${res.statusText} – ${url} – ${body}`);
  }

  return json as ApiEnvelope<T>;
}

function assertOk<T>(env: ApiEnvelope<T>, ctx: string): T {
  if (!env) throw new Error(`${ctx}: empty response`);
  if (env.status !== "ok") {
    const msg = env.error ? JSON.stringify(env.error) : "unknown error";
    throw new Error(`${ctx}: ${msg}`);
  }
  return env.data;
}

// =========================
// Rewards endpoints
// =========================

export async function getMiningStats(): Promise<MiningStats> {
  const env = await fetchEnvelope<MiningStats>("/mining");
  return assertOk(env, "GET /v1/mining");
}

export async function getRewardsLeaderboard(): Promise<RewardView[]> {
  const env = await fetchEnvelope<RewardView[]>("/rewards/leaderboard");
  return assertOk(env, "GET /v1/rewards/leaderboard");
}

// ---- Miner (Worker) rewards ----

export async function getRewardsBalances(): Promise<MinerBalanceView[]> {
  const env = await fetchEnvelope<MinerBalanceView[]>("/rewards/balances");
  return assertOk(env, "GET /v1/rewards/balances");
}

export async function getRewardsLedger(minerId: string): Promise<RewardLedgerEntry[]> {
  const safe = encodeURIComponent(minerId);
  const env = await fetchEnvelope<RewardLedgerEntry[]>(`/rewards/ledger/${safe}`);
  return assertOk(env, "GET /v1/rewards/ledger/:miner_id");
}

// ---- Node (Operator / Coordinator) rewards ----

export async function getNodeRewardsBalances(): Promise<NodeBalanceView[]> {
  const env = await fetchEnvelope<NodeBalanceView[]>("/rewards/nodes/balances");
  return assertOk(env, "GET /v1/rewards/nodes/balances");
}

export async function getNodeRewardsLedger(nodeId: string): Promise<NodeRewardLedgerEntry[]> {
  const safe = encodeURIComponent(nodeId);
  const env = await fetchEnvelope<NodeRewardLedgerEntry[]>(`/rewards/nodes/ledger/${safe}`);
  return assertOk(env, "GET /v1/rewards/nodes/ledger/:node_id");
}
