import React, { useEffect, useMemo, useState } from "react";
import { Cpu, Clock, Play, Square, Hash, PenLine, Activity, Coins, List } from "lucide-react";
import {
  GlassCard,
  GlassCardHeader,
  GlassCardTitle,
  GlassCardContent,
} from "@/components/common/GlassCard";
import { StatusOrb } from "@/components/common/StatusOrb";
import { LogPanel } from "@/components/common/LogPanel";
import { Button } from "@/components/ui/button";
import type { MinerStatus, LogEntry, MinerBalanceView, RewardLedgerEntry } from "@/types";
import { getRewardsBalances, getRewardsLedger } from "@/services/backend";

type MinerProofUi = {
  node_id: string;
  job_id: number;
  work_units: number;
  elapsed_ms: number;
  workload_mode: string;
  client_version: string;
  ts: number;
  proof_hash_hex: string;
  signature_hex: string;
  public_key_hex: string;
};

type MinerStats = {
  proofs: number;
  avgElapsedMs: number;
  avgWU: number;
  wuPerSec: number;
  lastProofTs: number | null;
};

interface MinerPageProps {
  status: MinerStatus;
  logs: LogEntry[];
  onStart: () => void;
  onStop: () => void;

  proofs?: MinerProofUi[];
  stats?: MinerStats;

  // ✅ NEW: show only local miner id
  minerId?: string | null;
}

function shortHex(s?: string, head = 10, tail = 8) {
  if (!s) return "—";
  if (s.length <= head + tail) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

function fmtTs(ts?: number | null) {
  if (!ts) return "—";
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString();
}

function fmtKctFromNano(nano?: number | null) {
  if (nano == null) return "—";
  const kct = nano / 1e8;
  return kct.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function fmtPct(x?: number | null) {
  if (x == null) return "—";
  return `${(x * 100).toFixed(2)}%`;
}

export function MinerPage({
  status,
  logs,
  onStart,
  onStop,
  proofs = [],
  stats,
  minerId = null,
}: MinerPageProps) {
  const isRunning = status.status === "running";
  const isTransitioning = status.status === "starting" || status.status === "stopping";

  const s: MinerStats = stats ?? {
    proofs: proofs.length,
    avgElapsedMs: 0,
    avgWU: 0,
    wuPerSec: 0,
    lastProofTs: proofs.length ? proofs[proofs.length - 1].ts : null,
  };

  const last = proofs.length ? proofs[proofs.length - 1] : null;

  // ===== Rewards UI state =====
  const [balances, setBalances] = useState<MinerBalanceView[]>([]);
  const [selectedMiner, setSelectedMiner] = useState<string>("");
  const [ledger, setLedger] = useState<RewardLedgerEntry[]>([]);
  const [err, setErr] = useState<string | null>(null);

  // load balances periodically
  useEffect(() => {
    let alive = true;

    const tick = async () => {
      try {
        const b = await getRewardsBalances();
        if (!alive) return;

        const list = b ?? [];
        setBalances(list);
        setErr(null);

        // ✅ prefer local minerId, else keep current, else first item
        const first = list?.[0]?.miner_id ?? "";
        setSelectedMiner((prev) => {
          if (minerId) return minerId;
          return prev || first;
        });
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message ?? "Failed to load balances");
      }
    };

    tick();
    const t = setInterval(tick, 6000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [minerId]);

  // load ledger when miner changes
  useEffect(() => {
    let alive = true;
    if (!selectedMiner) return;

    const tick = async () => {
      try {
        const l = await getRewardsLedger(selectedMiner);
        if (!alive) return;
        setLedger(l ?? []);
        setErr(null);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message ?? "Failed to load ledger");
      }
    };

    tick();
    const t = setInterval(tick, 6000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [selectedMiner]);

  const selectedBalance = useMemo(
    () => balances.find((x) => x.miner_id === selectedMiner) ?? null,
    [balances, selectedMiner]
  );

  const ledgerLatestFirst = useMemo(() => {
    const copy = [...(ledger ?? [])];
    copy.sort((a, b) => (b.block_height ?? 0) - (a.block_height ?? 0));
    return copy.slice(0, 200);
  }, [ledger]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-foreground mb-1">Miner</h2>
          <p className="text-muted-foreground text-sm">Worker that executes jobs and submits proofs</p>
        </div>

        <div className="flex items-center gap-3">
          {!isRunning && status.status !== "starting" && (
            <Button
              onClick={onStart}
              disabled={isTransitioning}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              <Play className="h-4 w-4 mr-2" />
              Start Miner
            </Button>
          )}

          {(isRunning || status.status === "starting") && (
            <Button
              onClick={onStop}
              disabled={isTransitioning}
              variant="outline"
              className="border-destructive/50 text-destructive hover:bg-destructive/10"
            >
              <Square className="h-4 w-4 mr-2" />
              Stop Miner
            </Button>
          )}
        </div>
      </div>

      {/* Status */}
      <GlassCard density="compact">
        <GlassCardHeader>
          <div className="flex items-center gap-3">
            <Cpu className="h-5 w-5 text-primary" />
            <GlassCardTitle>Status</GlassCardTitle>
          </div>
          <StatusOrb status={status.status} size="lg" showLabel />
        </GlassCardHeader>

        <GlassCardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <StatusItem icon={Cpu} label="PID" value={status.pid?.toString() ?? "—"} />
            <StatusItem icon={Clock} label="Uptime" value={status.uptime ?? "—"} />
            <StatusItem
              icon={Cpu}
              label="Status"
              value={status.status.charAt(0).toUpperCase() + status.status.slice(1)}
              highlight={isRunning}
            />
            <StatusItem
              icon={Hash}
              label="Miner ID"
              value={minerId ?? "—"}
              highlight={Boolean(minerId)}
            />
          </div>
        </GlassCardContent>
      </GlassCard>

      {/* Rewards (v1.1) */}
      <GlassCard density="compact">
        <GlassCardHeader>
          <div className="flex items-center gap-3">
            <Coins className="h-5 w-5 text-primary" />
            <div>
              <GlassCardTitle>Miner Rewards</GlassCardTitle>
              <p className="text-xs text-muted-foreground">Miner 80% • Node 20%</p>
            </div>
          </div>

          <span className="text-xs text-muted-foreground font-mono">
            miner={selectedMiner || "—"}
          </span>
        </GlassCardHeader>

        <GlassCardContent className="space-y-4">
          {err ? <div className="text-sm text-destructive">{err}</div> : null}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatusItem
              icon={Coins}
              label="Total mined"
              value={`${fmtKctFromNano(selectedBalance?.total_mined_nano ?? null)} KCT`}
              highlight={Boolean(selectedBalance?.total_mined_nano)}
            />
            <StatusItem
              icon={Coins}
              label="Last block reward"
              value={`${fmtKctFromNano(selectedBalance?.last_block_reward_nano ?? null)} KCT`}
              highlight={Boolean(selectedBalance?.last_block_reward_nano)}
            />
            <StatusItem icon={List} label="Ledger entries" value={String(ledger?.length ?? 0)} />
          </div>

          {/* Ledger table */}
          <div className="rounded-xl border border-border/40 bg-card/30 overflow-hidden">
            <div className="px-4 py-3 border-b border-border/40 text-sm font-medium text-foreground flex items-center gap-2">
              <List className="h-4 w-4 text-primary" />
              Ledger
              <span className="text-xs text-muted-foreground font-mono ml-auto">
                {selectedMiner ? `miner=${selectedMiner}` : "—"}
              </span>
            </div>

            {ledgerLatestFirst.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">No ledger entries yet.</div>
            ) : (
              <div className="max-h-[360px] overflow-y-auto overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-background/60 backdrop-blur text-muted-foreground">
                    <tr className="border-b border-border/50">
                      <th className="text-left py-2 pl-4 pr-3 font-medium">Block</th>
                      <th className="text-left py-2 pr-3 font-medium">Amount</th>
                      <th className="text-left py-2 pr-3 font-medium">Share</th>
                      <th className="text-left py-2 pr-3 font-medium">CU</th>
                      <th className="text-left py-2 pr-4 font-medium">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerLatestFirst.map((x) => (
                      <tr key={`${x.block_height}-${x.timestamp_unix}`} className="border-b border-border/30">
                        <td className="py-2 pl-4 pr-3 font-mono whitespace-nowrap">{x.block_height}</td>
                        <td className="py-2 pr-3 font-mono whitespace-nowrap">
                          {fmtKctFromNano(x.amount_nano)} KCT
                        </td>
                        <td className="py-2 pr-3 font-mono whitespace-nowrap">{fmtPct(x.share)}</td>
                        <td className="py-2 pr-3 font-mono whitespace-nowrap">
                          {x.compute_units.toLocaleString()}
                        </td>
                        <td className="py-2 pr-4 font-mono whitespace-nowrap">{x.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </GlassCardContent>
      </GlassCard>

      {/* Proof Stats */}
      <GlassCard density="compact">
        <GlassCardHeader>
          <div className="flex items-center gap-3">
            <Activity className="h-5 w-5 text-primary" />
            <GlassCardTitle>Proof Stats</GlassCardTitle>
          </div>
          <span className="text-xs text-muted-foreground font-mono">last={fmtTs(s.lastProofTs)}</span>
        </GlassCardHeader>

        <GlassCardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <StatusItem icon={Cpu} label="Proofs" value={String(s.proofs)} highlight={s.proofs > 0} />
            <StatusItem icon={Clock} label="Avg elapsed" value={`${s.avgElapsedMs} ms`} />
            <StatusItem icon={Cpu} label="Avg WU" value={String(s.avgWU)} />
            <StatusItem icon={Activity} label="WU/sec" value={String(s.wuPerSec)} highlight={s.wuPerSec > 0} />
          </div>

          {last && (
            <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
              <MiniItem icon={Hash} label="Last proof hash" value={shortHex(last.proof_hash_hex, 14, 12)} />
              <MiniItem icon={PenLine} label="Last signature" value={shortHex(last.signature_hex, 14, 12)} />
              <MiniItem
                icon={Cpu}
                label="Last job"
                value={`job=${last.job_id} wu=${last.work_units} elapsed=${last.elapsed_ms}ms`}
              />
            </div>
          )}
        </GlassCardContent>
      </GlassCard>

      {/* Recent Proofs */}
      <GlassCard density="compact">
        <GlassCardHeader>
          <GlassCardTitle>Recent Proofs</GlassCardTitle>
          <span className="text-xs text-muted-foreground font-mono">miner:proof</span>
        </GlassCardHeader>

        <GlassCardContent className="p-0">
          {proofs.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No proofs yet. Start miner and wait for jobs.</div>
          ) : (
            <div className="max-h-[420px] overflow-y-auto overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-background/60 backdrop-blur text-muted-foreground">
                  <tr className="border-b border-border/50">
                    <th className="text-left py-2 pl-6 pr-3 font-medium">Time</th>
                    <th className="text-left py-2 pr-3 font-medium">Job</th>
                    <th className="text-left py-2 pr-3 font-medium">WU</th>
                    <th className="text-left py-2 pr-3 font-medium">Elapsed</th>
                    <th className="text-left py-2 pr-3 font-medium">Hash</th>
                    <th className="text-left py-2 pr-6 font-medium">Signature</th>
                  </tr>
                </thead>

                <tbody>
                  {proofs
                    .slice(-200)
                    .reverse()
                    .map((p) => (
                      <tr key={`${p.job_id}-${p.ts}`} className="border-b border-border/30">
                        <td className="py-2 pl-6 pr-3 font-mono text-xs whitespace-nowrap">{fmtTs(p.ts)}</td>
                        <td className="py-2 pr-3 font-mono whitespace-nowrap">{p.job_id}</td>
                        <td className="py-2 pr-3 font-mono whitespace-nowrap">{p.work_units}</td>
                        <td className="py-2 pr-3 font-mono whitespace-nowrap">{p.elapsed_ms}ms</td>
                        <td className="py-2 pr-3 font-mono text-xs whitespace-nowrap">
                          {shortHex(p.proof_hash_hex, 12, 10)}
                        </td>
                        <td className="py-2 pr-6 font-mono text-xs whitespace-nowrap">
                          {shortHex(p.signature_hex, 12, 10)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </GlassCardContent>
      </GlassCard>

      {/* Logs */}
      <GlassCard density="compact">
        <GlassCardHeader>
          <GlassCardTitle>Live Logs</GlassCardTitle>
          <span className="text-xs text-muted-foreground font-mono">tail_log</span>
        </GlassCardHeader>

        <GlassCardContent className="space-y-0">
          <LogPanel logs={logs} title="Live Logs (Miner)" maxHeight="420px" />
        </GlassCardContent>
      </GlassCard>
    </div>
  );
}

interface StatusItemProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  highlight?: boolean;
}

function StatusItem({ icon: Icon, label, value, highlight }: StatusItemProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-xs">{label}</span>
      </div>
      <p className={`font-mono text-sm ${highlight ? "text-primary" : "text-foreground"}`}>{value}</p>
    </div>
  );
}

function MiniItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border/40 bg-card/40 p-3">
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-xs">{label}</span>
      </div>
      <div className="font-mono text-xs text-foreground break-all">{value}</div>
    </div>
  );
}
