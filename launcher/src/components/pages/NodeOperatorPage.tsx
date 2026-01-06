import { Server, Clock, Wifi, Play, Square } from "lucide-react";
import { GlassCard, GlassCardHeader, GlassCardTitle, GlassCardContent } from "@/components/common/GlassCard";
import { StatusOrb } from "@/components/common/StatusOrb";
import { LogPanel } from "@/components/common/LogPanel";
import { Button } from "@/components/ui/button";
import type { NodeStatus, LogEntry } from "@/types";

interface NodeOperatorPageProps {
  status: NodeStatus;
  logs: LogEntry[];
  onStart: () => void;
  onStop: () => void;
}

export function NodeOperatorPage({ status, logs, onStart, onStop }: NodeOperatorPageProps) {
  const isRunning = status.status === "running";
  const isTransitioning = status.status === "starting" || status.status === "stopping";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-foreground mb-1">Node Operator</h2>
          <p className="text-muted-foreground text-sm">
            Kaspa network node with identity-based reward tracking
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

      {/* Status Section */}
      <GlassCard>
        <GlassCardHeader>
          <div className="flex items-center gap-3">
            <Server className="h-5 w-5 text-primary" />
            <GlassCardTitle>Status</GlassCardTitle>
          </div>
          <StatusOrb status={status.status} size="lg" showLabel />
        </GlassCardHeader>

        <GlassCardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <StatusItem
              icon={Server}
              label="PID"
              value={status.pid?.toString() ?? "—"}
            />
            <StatusItem
              icon={Clock}
              label="Uptime"
              value={status.uptime ?? "—"}
            />
            <StatusItem
              icon={Wifi}
              label="Last Heartbeat"
              value={status.lastHeartbeat ?? "—"}
            />
            <StatusItem
              icon={Server}
              label="Status"
              value={status.status.charAt(0).toUpperCase() + status.status.slice(1)}
              highlight={isRunning}
            />
          </div>
        </GlassCardContent>
      </GlassCard>

      {/* Logs Section */}
      <GlassCard>
        <GlassCardHeader>
          <GlassCardTitle>Live Logs</GlassCardTitle>
          <span className="text-xs text-muted-foreground font-mono">
            tail_log
          </span>
        </GlassCardHeader>

        <GlassCardContent>
          <LogPanel logs={logs} title="Live Logs (Node)" maxHeight="420px" />
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
