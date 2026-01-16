import React from "react";
import { Cpu, Clock, Play, Square, Hash, PenLine, Activity } from "lucide-react";
import {
  GlassCard,
  GlassCardHeader,
  GlassCardTitle,
  GlassCardContent,
} from "@/components/common/GlassCard";
import { StatusOrb } from "@/components/common/StatusOrb";
import { LogPanel } from "@/components/common/LogPanel";
import { Button } from "@/components/ui/button";
import type { MinerStatus, LogEntry } from "@/types";

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

  // ✅ optional (wenn du sie später im Hook lieferst)
  proofs?: MinerProofUi[];
  stats?: MinerStats;
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

export function MinerPage({
  status,
  logs,
  onStart,
  onStop,
  proofs = [],
  stats,
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-foreground mb-1">Miner</h2>
          <p className="text-muted-foreground text-sm">
            Mining client connected to remote nodes
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
      <GlassCard>
        <GlassCardHeader>
          <div className="flex items-center gap-3">
            <Cpu className="h-5 w-5 text-primary" />
            <GlassCardTitle>Status</GlassCardTitle>
          </div>
          <StatusOrb status={status.status} size="lg" showLabel />
        </GlassCardHeader>

        <GlassCardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
            <StatusItem icon={Cpu} label="PID" value={status.pid?.toString() ?? "—"} />
            <StatusItem icon={Clock} label="Uptime" value={status.uptime ?? "—"} />
            <StatusItem
              icon={Cpu}
              label="Status"
              value={status.status.charAt(0).toUpperCase() + status.status.slice(1)}
              highlight={isRunning}
            />
          </div>
        </GlassCardContent>
      </GlassCard>

      {/* Proof Stats */}
      <GlassCard>
        <GlassCardHeader>
          <div className="flex items-center gap-3">
            <Activity className="h-5 w-5 text-primary" />
            <GlassCardTitle>Proof Stats</GlassCardTitle>
          </div>
          <span className="text-xs text-muted-foreground font-mono">
            last={fmtTs(s.lastProofTs)}
          </span>
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

      {/* Recent Proofs (✅ scrollbar nur hier) */}
      <GlassCard>
        <GlassCardHeader>
          <GlassCardTitle>Recent Proofs</GlassCardTitle>
          <span className="text-xs text-muted-foreground font-mono">miner:proof</span>
        </GlassCardHeader>

        {/* ✅ p-0 damit der Scroll-Container sauber sitzt */}
        <GlassCardContent className="p-0">
          {proofs.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              No proofs yet. Start miner and wait for jobs.
            </div>
          ) : (
            <div className="max-h-[420px] overflow-y-auto overflow-x-auto">
              <table className="w-full text-sm">
                {/* ✅ optional sticky header (sieht premium aus) */}
                <thead className="sticky top-0 z-10 bg-background/60 backdrop-blur text-muted-foreground">
                  <tr className="border-b border-border/50">
                    <th className="text-left py-2 pl-6 pr-3 font-medium">Time</th>
                    <th className="text-left py-2 pr-3 font-medium">Job</th>
                    <th className="text-left py-2 pr-3 font-medium">WU</th>
                    <th className="text-left py-2 pr-3 font-medium">Elapsed</th>
                    <th className="text-left py-2 pr-3 font-medium">Hash</th>
                    <th className="text-left py-6 pr-3 font-medium">Signature</th>
                  </tr>
                </thead>

                <tbody>
                  {proofs
                    .slice(-200) // mehr Buffer intern
                    .reverse()  // neueste oben
                    .map((p) => (
                      <tr key={`${p.job_id}-${p.ts}`} className="border-b border-border/30">
                        <td className="py-2 pl-6 pr-3 font-mono text-xs whitespace-nowrap">
                          {fmtTs(p.ts)}
                        </td>
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
      <GlassCard>
        <GlassCardHeader>
          <GlassCardTitle>Live Logs</GlassCardTitle>
          <span className="text-xs text-muted-foreground font-mono">tail_log</span>
        </GlassCardHeader>

        <GlassCardContent>
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
      <p className={`font-mono text-sm ${highlight ? "text-primary" : "text-foreground"}`}>
        {value}
      </p>
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
