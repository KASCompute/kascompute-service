import React, { useEffect, useMemo, useState } from "react";
import {
  Server,
  Clock,
  Wifi,
  Play,
  Square,
  Coins,
  List,
  Hash,
  Send,
  Inbox,
  Cpu,
} from "lucide-react";
import {
  GlassCard,
  GlassCardHeader,
  GlassCardTitle,
  GlassCardContent,
} from "@/components/common/GlassCard";
import { StatusOrb } from "@/components/common/StatusOrb";
import { LogPanel } from "@/components/common/LogPanel";
import { Button } from "@/components/ui/button";
import type { NodeStatus, LogEntry, NodeBalanceView, NodeRewardLedgerEntry } from "@/types";
import { getNodeRewardsBalances, getNodeRewardsLedger } from "@/services/backend";

interface NodeOperatorPageProps {
  status: NodeStatus;
  logs: LogEntry[]; // ✅ IMPORTANT: pass BOTH nodeLogs + minerLogs from Index.tsx
  onStart: () => void;
  onStop: () => void;
  nodeId?: string | null;
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

function shortId(id: string, head = 10, tail = 6) {
  if (!id) return "—";
  if (id.length <= head + tail) return id;
  return `${id.slice(0, head)}…${id.slice(-tail)}`;
}

function fmtWU(n?: number | null) {
  if (n == null) return "—";
  return n.toLocaleString();
}

type DistRow = {
  ts: string;
  job_id: number;
  miner_id: string;
  wu: number;
  lease_expires_unix?: number | null;
  server_ts?: number | null;
  raw: string;
};

type ProofRow = {
  ts: string;
  job_id: number;
  miner_id: string;
  wu: number;
  elapsed_ms: number;
  raw: string;
};

const RE_JOB_ASSIGNED =
  /\[MINER\s+(?<miner>kc_[^\]\s]+)\]\s+job assigned\s+id=(?<job>\d+)\s+wu=(?<wu>\d+)\s+lease_expires_unix=(?<lease>\d+)\s+server_ts=(?<server>\d+)/i;

const RE_PROOF_RECEIVED =
  /Proof received\s+job\s+#?(?<job>\d+)\s+←\s+miner=(?<miner>kc_[^\s]+)\s+wu=(?<wu>\d+)\s+elapsed=(?<ms>\d+)ms/i;

export function NodeOperatorPage({
  status,
  logs,
  onStart,
  onStop,
  nodeId = null,
}: NodeOperatorPageProps) {
  const isRunning = status.status === "running";
  const isTransitioning = status.status === "starting" || status.status === "stopping";

  // ===== Rewards =====
  const [balances, setBalances] = useState<NodeBalanceView[]>([]);
  const [selectedNode, setSelectedNode] = useState<string>("");
  const [errRewards, setErrRewards] = useState<string | null>(null);

  const [ledger, setLedger] = useState<NodeRewardLedgerEntry[]>([]);
  const [errLedger, setErrLedger] = useState<string | null>(null);

  // balances poll
  useEffect(() => {
    let alive = true;

    const tick = async () => {
      try {
        const b = await getNodeRewardsBalances();
        if (!alive) return;

        const list = b ?? [];
        setBalances(list);
        setErrRewards(null);

        const first = list?.[0]?.node_id ?? "";
        setSelectedNode((prev) => {
          if (nodeId) return nodeId;
          return prev || first;
        });
      } catch (e: any) {
        if (!alive) return;
        setErrRewards(e?.message ?? "Failed to load node balances");
      }
    };

    tick();
    const t = setInterval(tick, 6000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [nodeId]);

  // ledger poll
  useEffect(() => {
    let alive = true;
    if (!selectedNode) return;

    const tick = async () => {
      try {
        const l = await getNodeRewardsLedger(selectedNode);
        if (!alive) return;
        setLedger(l ?? []);
        setErrLedger(null);
      } catch (e: any) {
        if (!alive) return;
        setErrLedger(e?.message ?? "Failed to load node ledger");
      }
    };

    tick();
    const t = setInterval(tick, 6000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [selectedNode]);

  const selectedBalance = useMemo(
    () => balances.find((x) => x.node_id === selectedNode) ?? null,
    [balances, selectedNode]
  );

  const ledgerLatestFirst = useMemo(() => {
    const copy = [...(ledger ?? [])];
    copy.sort((a, b) => (b.block_height ?? 0) - (a.block_height ?? 0));
    return copy.slice(0, 200);
  }, [ledger]);

  // ===== Derive distribution + proofs from logs =====
  const { dist, proofs } = useMemo(() => {
    const distRows: DistRow[] = [];
    const proofRows: ProofRow[] = [];

    for (const l of logs ?? []) {
      const msg = String(l.message ?? "");

      // 1) Distribution from miner log: "job assigned ..."
      const m1 = msg.match(RE_JOB_ASSIGNED);
      if (m1?.groups) {
        distRows.push({
          ts: l.timestamp ?? "—",
          miner_id: m1.groups.miner,
          job_id: Number(m1.groups.job),
          wu: Number(m1.groups.wu),
          lease_expires_unix: Number(m1.groups.lease),
          server_ts: Number(m1.groups.server),
          raw: msg,
        });
        continue;
      }

      // 2) Proofs from node log: "Proof received ..."
      const m2 = msg.match(RE_PROOF_RECEIVED);
      if (m2?.groups) {
        proofRows.push({
          ts: l.timestamp ?? "—",
          miner_id: m2.groups.miner,
          job_id: Number(m2.groups.job),
          wu: Number(m2.groups.wu),
          elapsed_ms: Number(m2.groups.ms),
          raw: msg,
        });
      }
    }

    // newest first + cap
    distRows.sort((a, b) => (b.server_ts ?? 0) - (a.server_ts ?? 0));
    proofRows.sort((a, b) => b.job_id - a.job_id);

    return {
      dist: distRows.slice(0, 120),
      proofs: proofRows.slice(0, 120),
    };
  }, [logs]);

  const distCount = dist.length;
  const proofCount = proofs.length;

  // quick summary
  const summary = useMemo(() => {
    const miners = new Map<string, number>();
    let wu = 0;

    for (const r of proofs) {
      wu += r.wu || 0;
      miners.set(r.miner_id, (miners.get(r.miner_id) ?? 0) + 1);
    }

    const topMiner = [...miners.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      totalWU: wu,
      topMiner: topMiner ? { id: topMiner[0], proofs: topMiner[1] } : null,
    };
  }, [proofs]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-foreground mb-1">Node Operator</h2>
          <p className="text-muted-foreground text-sm">
            Coordinator that distributes jobs and receives proofs
          </p>
        </div>

        <div className="flex items-center gap-3">
          {!isRunning && status.status !== "starting" && (
            <Button
              onClick={onStart}
              disabled={isTransitioning}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              <Play className="h-4 w-4 mr-2" />
              Start Node
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
              Stop Node
            </Button>
          )}
        </div>
      </div>

      {/* Status */}
      <GlassCard>
        <GlassCardHeader>
          <div className="flex items-center gap-3">
            <Server className="h-5 w-5 text-primary" />
            <GlassCardTitle>Status</GlassCardTitle>
          </div>
          <StatusOrb status={status.status} size="lg" showLabel />
        </GlassCardHeader>

        <GlassCardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
            <StatusItem icon={Server} label="PID" value={status.pid?.toString() ?? "—"} />
            <StatusItem icon={Clock} label="Uptime" value={status.uptime ?? "—"} />
            <StatusItem icon={Wifi} label="Last Heartbeat" value={status.lastHeartbeat ?? "—"} />
            <StatusItem
              icon={Server}
              label="Status"
              value={status.status.charAt(0).toUpperCase() + status.status.slice(1)}
              highlight={isRunning}
            />
            <StatusItem icon={Hash} label="Node ID" value={nodeId ?? "—"} highlight={Boolean(nodeId)} />
          </div>
        </GlassCardContent>
      </GlassCard>

      {/* Activity Summary */}
      <GlassCard density="compact">
        <GlassCardHeader>
          <div className="flex items-center gap-3">
            <Cpu className="h-5 w-5 text-primary" />
            <div>
              <GlassCardTitle>Job Flow</GlassCardTitle>
              <p className="text-xs text-muted-foreground">Derived from logs (best-effort)</p>
            </div>
          </div>

          <span className="text-xs text-muted-foreground font-mono">
            dist={distCount} • proofs={proofCount}
          </span>
        </GlassCardHeader>

        <GlassCardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatusItem icon={Send} label="Jobs assigned" value={String(distCount)} highlight={distCount > 0} />
            <StatusItem icon={Inbox} label="Proofs received" value={String(proofCount)} highlight={proofCount > 0} />
            <StatusItem
              icon={Cpu}
              label="WU (proofs)"
              value={fmtWU(summary.totalWU)}
              highlight={summary.totalWU > 0}
            />
          </div>

          {summary.topMiner ? (
            <div className="text-xs text-muted-foreground">
              Top miner: <span className="font-mono text-foreground">{shortId(summary.topMiner.id)}</span>{" "}
              • proofs={summary.topMiner.proofs}
            </div>
          ) : null}
        </GlassCardContent>
      </GlassCard>

      {/* Node Rewards */}
      <GlassCard density="compact">
        <GlassCardHeader>
          <div className="flex items-center gap-3">
            <Coins className="h-5 w-5 text-primary" />
            <div>
              <GlassCardTitle>Node Rewards</GlassCardTitle>
              <p className="text-xs text-muted-foreground">Node operator share (20% pool)</p>
            </div>
          </div>

          <span className="text-xs text-muted-foreground font-mono">node={selectedNode || "—"}</span>
        </GlassCardHeader>

        <GlassCardContent className="space-y-4">
          {errRewards ? <div className="text-sm text-destructive">{errRewards}</div> : null}
          {errLedger ? <div className="text-sm text-destructive">{errLedger}</div> : null}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatusItem
              icon={Coins}
              label="Total earned"
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
                {selectedNode ? `node=${selectedNode}` : "—"}
              </span>
            </div>

            {ledgerLatestFirst.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">No ledger entries yet.</div>
            ) : (
              <div className="max-h-[260px] overflow-y-auto overflow-x-auto">
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

      {/* Job Distribution */}
      <GlassCard density="compact">
        <GlassCardHeader>
          <div className="flex items-center gap-3">
            <Send className="h-5 w-5 text-primary" />
            <div>
              <GlassCardTitle>Job Distribution</GlassCardTitle>
              <p className="text-xs text-muted-foreground">Parsed from logs: “job assigned …”</p>
            </div>
          </div>
          <span className="text-xs text-muted-foreground font-mono">matches={distCount}</span>
        </GlassCardHeader>

        <GlassCardContent className="p-0">
          {distCount === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">
              No “job assigned …” lines found yet. (Make sure Node tab receives <b>nodeLogs + minerLogs</b>.)
            </div>
          ) : (
            <div className="max-h-[320px] overflow-y-auto overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-background/60 backdrop-blur text-muted-foreground">
                  <tr className="border-b border-border/50">
                    <th className="text-left py-2 pl-4 pr-3 font-medium">Time</th>
                    <th className="text-left py-2 pr-3 font-medium">Job</th>
                    <th className="text-left py-2 pr-3 font-medium">Miner</th>
                    <th className="text-left py-2 pr-3 font-medium">WU</th>
                    <th className="text-left py-2 pr-4 font-medium">Raw</th>
                  </tr>
                </thead>
                <tbody>
                  {dist.map((x) => (
                    <tr key={`${x.server_ts ?? x.job_id}-${x.ts}`} className="border-b border-border/30">
                      <td className="py-2 pl-4 pr-3 font-mono whitespace-nowrap">{x.ts}</td>
                      <td className="py-2 pr-3 font-mono whitespace-nowrap">#{x.job_id}</td>
                      <td className="py-2 pr-3 font-mono whitespace-nowrap">{shortId(x.miner_id)}</td>
                      <td className="py-2 pr-3 font-mono whitespace-nowrap">{fmtWU(x.wu)}</td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground font-mono truncate max-w-[520px]">
                        {x.raw}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </GlassCardContent>
      </GlassCard>

      {/* Proofs Received */}
      <GlassCard density="compact">
        <GlassCardHeader>
          <div className="flex items-center gap-3">
            <Inbox className="h-5 w-5 text-primary" />
            <div>
              <GlassCardTitle>Proofs Received</GlassCardTitle>
              <p className="text-xs text-muted-foreground">Parsed from logs: “Proof received …”</p>
            </div>
          </div>
          <span className="text-xs text-muted-foreground font-mono">matches={proofCount}</span>
        </GlassCardHeader>

        <GlassCardContent className="p-0">
          {proofCount === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">No “Proof received …” lines found yet.</div>
          ) : (
            <div className="max-h-[320px] overflow-y-auto overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-background/60 backdrop-blur text-muted-foreground">
                  <tr className="border-b border-border/50">
                    <th className="text-left py-2 pl-4 pr-3 font-medium">Time</th>
                    <th className="text-left py-2 pr-3 font-medium">Job</th>
                    <th className="text-left py-2 pr-3 font-medium">Miner</th>
                    <th className="text-left py-2 pr-3 font-medium">WU</th>
                    <th className="text-left py-2 pr-3 font-medium">ms</th>
                    <th className="text-left py-2 pr-4 font-medium">Raw</th>
                  </tr>
                </thead>
                <tbody>
                  {proofs.map((x) => (
                    <tr key={`${x.job_id}-${x.ts}`} className="border-b border-border/30">
                      <td className="py-2 pl-4 pr-3 font-mono whitespace-nowrap">{x.ts}</td>
                      <td className="py-2 pr-3 font-mono whitespace-nowrap">#{x.job_id}</td>
                      <td className="py-2 pr-3 font-mono whitespace-nowrap">{shortId(x.miner_id)}</td>
                      <td className="py-2 pr-3 font-mono whitespace-nowrap">{fmtWU(x.wu)}</td>
                      <td className="py-2 pr-3 font-mono whitespace-nowrap">{x.elapsed_ms.toLocaleString()}</td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground font-mono truncate max-w-[520px]">
                        {x.raw}
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
      <GlassCard>
        <GlassCardHeader>
          <GlassCardTitle>Live Logs</GlassCardTitle>
          <span className="text-xs text-muted-foreground font-mono">tail_log</span>
        </GlassCardHeader>

        <GlassCardContent>
          <LogPanel logs={logs} title="Live Logs (Node + Miner)" maxHeight="420px" />
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
