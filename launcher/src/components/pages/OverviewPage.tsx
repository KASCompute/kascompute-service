import React, { useEffect, useMemo, useState } from "react";
import { Server, Cpu, Play, Square, Trophy, Coins } from "lucide-react";
import {
  GlassCard,
  GlassCardHeader,
  GlassCardTitle,
  GlassCardContent,
  GlassCardFooter,
} from "@/components/common/GlassCard";
import { StatusOrb } from "@/components/common/StatusOrb";
import { Button } from "@/components/ui/button";
import type { NodeStatus, MinerStatus, MiningStats, RewardView } from "@/types";
import { getMiningStats, getRewardsLeaderboard } from "@/services/backend";

interface OverviewPageProps {
  nodeStatus: NodeStatus;
  minerStatus: MinerStatus;
  actions: {
    startNode: () => Promise<void> | void;
    stopNode: () => Promise<void> | void;
    startMiner: () => Promise<void> | void;
    stopMiner: () => Promise<void> | void;
  };
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

function fmtTs(ts?: number | null) {
  if (!ts) return "—";
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString();
}

function shortId(id: string, head = 10, tail = 6) {
  if (!id) return "—";
  if (id.length <= head + tail) return id;
  return `${id.slice(0, head)}…${id.slice(-tail)}`;
}

export function OverviewPage({ nodeStatus, minerStatus, actions }: OverviewPageProps) {
  const [mining, setMining] = useState<MiningStats | null>(null);
  const [leaderboard, setLeaderboard] = useState<RewardView[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const top = useMemo(() => leaderboard.slice(0, 5), [leaderboard]);

  useEffect(() => {
    let alive = true;

    const tick = async () => {
      try {
        const [m, lb] = await Promise.all([getMiningStats(), getRewardsLeaderboard()]);
        if (!alive) return;
        setMining(m);
        setLeaderboard(lb ?? []);
        setErr(null);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message ?? "Failed to load mining stats");
      }
    };

    tick();
    const t = setInterval(tick, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const rewardNano = mining?.current_block_reward_nano ?? null;
  const minerRewardNano = rewardNano != null ? Math.floor(rewardNano * 0.8) : null;
  const nodeRewardNano = rewardNano != null ? Math.floor(rewardNano * 0.2) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold text-foreground mb-1">Overview</h2>
        <p className="text-muted-foreground text-sm">
          Status & rewards summary for your KASCompute services
        </p>
      </div>

      {/* Services */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ServiceCard
          title="Node"
          icon={Server}
          status={nodeStatus.status}
          pid={nodeStatus.pid}
          uptime={nodeStatus.uptime}
          note="Runs jobs scheduling + proof submission"
          onStart={actions.startNode}
          onStop={actions.stopNode}
        />

        <ServiceCard
          title="Miner"
          icon={Cpu}
          status={minerStatus.status}
          pid={minerStatus.pid}
          uptime={minerStatus.uptime}
          note="Executes deterministic compute + submits proofs"
          onStart={actions.startMiner}
          onStop={actions.stopMiner}
        />
      </div>

      {/* Rewards + Leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Rewards card */}
        <GlassCard density="compact">
          <GlassCardHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Coins className="h-5 w-5 text-primary" />
              </div>
              <div>
                <GlassCardTitle>Rewards (Current Window)</GlassCardTitle>
                <p className="text-xs text-muted-foreground">Miner 80% • Node 20%</p>
              </div>
            </div>

            <span className="text-xs text-muted-foreground font-mono">
              {mining ? `updated ${fmtTs(mining.timestamp)}` : "—"}
            </span>
          </GlassCardHeader>

          <GlassCardContent>
            {err ? (
              <div className="text-sm text-destructive">{err}</div>
            ) : (
              <>
                {/* Primary stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <Stat label="Block height" value={String(mining?.block_height ?? "—")} />
                  <Stat
                    label="Reward / block"
                    value={rewardNano != null ? `${fmtKctFromNano(rewardNano)} KCT` : "—"}
                  />
                  <Stat
                    label="Reward window"
                    value={mining ? `${mining.reward_window_sec}s` : "—"}
                  />
                  <Stat
                    label="Active miners"
                    value={String(mining?.per_node?.length ?? "—")}
                  />
                </div>

                {/* Split box */}
                <div className="mt-4 rounded-xl border border-border/40 bg-card/30 p-4">
                  <div className="text-xs text-muted-foreground mb-2">Split preview</div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm text-foreground">Miner (80%)</div>
                      <div className="font-mono text-primary">
                        {minerRewardNano != null ? `${fmtKctFromNano(minerRewardNano)} KCT` : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-foreground">Node (20%)</div>
                      <div className="font-mono text-primary">
                        {nodeRewardNano != null ? `${fmtKctFromNano(nodeRewardNano)} KCT` : "—"}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 text-xs text-muted-foreground font-mono">
                    {mining
                      ? `total emitted: ${fmtKctFromNano(mining.total_emitted_nano)} KCT • month=${mining.month_index}`
                      : "—"}
                  </div>
                </div>
              </>
            )}
          </GlassCardContent>
        </GlassCard>

        {/* Leaderboard card */}
        <GlassCard density="compact">
          <GlassCardHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Trophy className="h-5 w-5 text-primary" />
              </div>
              <div>
                <GlassCardTitle>Top Miners</GlassCardTitle>
                <p className="text-xs text-muted-foreground">Leaderboard snapshot</p>
              </div>
            </div>
            <span className="text-xs text-muted-foreground font-mono">
              {top.length ? `top=${top.length}` : "—"}
            </span>
          </GlassCardHeader>

          <GlassCardContent className="p-0">
            {err ? (
              <div className="p-4 text-sm text-destructive">{err}</div>
            ) : top.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">No reward stats yet.</div>
            ) : (
              <div className="max-h-[260px] overflow-y-auto overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-background/60 backdrop-blur text-muted-foreground">
                    <tr className="border-b border-border/50">
                      <th className="text-left py-2 pl-4 pr-3 font-medium">#</th>
                      <th className="text-left py-2 pr-3 font-medium">Miner</th>
                      <th className="text-left py-2 pr-3 font-medium">Share</th>
                      <th className="text-left py-2 pr-4 font-medium">Eff WU</th>
                    </tr>
                  </thead>
                  <tbody>
                    {top.map((r, i) => (
                      <tr key={r.node_id} className="border-b border-border/30">
                        <td className="py-2 pl-4 pr-3 font-mono whitespace-nowrap text-muted-foreground">
                          {String(i + 1)}
                        </td>
                        <td className="py-2 pr-3 font-mono whitespace-nowrap">
                          {shortId(r.node_id)}
                        </td>
                        <td className="py-2 pr-3 font-mono whitespace-nowrap">
                          {fmtPct(r.share)}
                        </td>
                        <td className="py-2 pr-4 font-mono whitespace-nowrap">
                          {r.effective_work_units.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="px-4 py-3 text-xs text-muted-foreground border-t border-border/40">
                  Full balances + ledger are in the <span className="text-foreground">Miner</span> tab.
                </div>
              </div>
            )}
          </GlassCardContent>
        </GlassCard>
      </div>
    </div>
  );
}

/* ---------- helpers ---------- */

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}</span>
      <p className="font-mono text-foreground">{value}</p>
    </div>
  );
}

interface ServiceCardProps {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  status: string;
  pid?: number;
  uptime?: string;
  note: string;
  onStart: () => void;
  onStop: () => void;
}

function ServiceCard({
  title,
  icon: Icon,
  status,
  pid,
  uptime,
  note,
  onStart,
  onStop,
}: ServiceCardProps) {
  const isRunning = status === "running";
  const isStarting = status === "starting";
  const isStopping = status === "stopping";

  return (
    <GlassCard density="compact">
      <GlassCardHeader>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <GlassCardTitle>{title}</GlassCardTitle>
            <p className="text-xs text-muted-foreground">{note}</p>
          </div>
        </div>
        <StatusOrb status={status as any} size="lg" showLabel />
      </GlassCardHeader>

      <GlassCardContent>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <Stat label="PID" value={String(pid ?? "—")} />
          <Stat label="Uptime" value={uptime ?? "—"} />
        </div>
      </GlassCardContent>

      <GlassCardFooter>
        {!isRunning && !isStarting && (
          <Button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onStart();
            }}
            disabled={isStopping}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <Play className="h-4 w-4 mr-2" />
            Start
          </Button>
        )}

        {(isRunning || isStarting) && (
          <Button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onStop();
            }}
            disabled={isStopping}
            variant="outline"
            className="border-destructive/50 text-destructive hover:bg-destructive/10"
          >
            <Square className="h-4 w-4 mr-2" />
            Stop
          </Button>
        )}
      </GlassCardFooter>
    </GlassCard>
  );
}
