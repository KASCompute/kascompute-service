import React from "react";
import { Server, Cpu, Play, Square } from "lucide-react";
import {
  GlassCard,
  GlassCardHeader,
  GlassCardTitle,
  GlassCardContent,
  GlassCardFooter,
} from "@/components/common/GlassCard";
import { StatusOrb } from "@/components/common/StatusOrb";
import { Button } from "@/components/ui/button";
import type { NodeStatus, MinerStatus } from "@/types";

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

export function OverviewPage({ nodeStatus, minerStatus, actions }: OverviewPageProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-foreground mb-1">Overview</h2>
        <p className="text-muted-foreground text-sm">
          Monitor and control your KASCompute services
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ServiceCard
          title="Node Operator"
          icon={Server}
          status={nodeStatus.status}
          pid={nodeStatus.pid}
          uptime={nodeStatus.uptime}
          note="Identity-based credits tracked (internal)"
          onStart={actions.startNode}
          onStop={actions.stopNode}
        />

        <ServiceCard
          title="Miner"
          icon={Cpu}
          status={minerStatus.status}
          pid={minerStatus.pid}
          uptime={minerStatus.uptime}
          note="Remote nodes by default"
          onStart={actions.startMiner}
          onStop={actions.stopMiner}
        />
      </div>
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
    <GlassCard hover>
      <GlassCardHeader>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <GlassCardTitle>{title}</GlassCardTitle>
        </div>
        <StatusOrb status={status as any} size="lg" showLabel />
      </GlassCardHeader>

      <GlassCardContent>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">PID</span>
            <p className="font-mono text-foreground">{pid ?? "—"}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Uptime</span>
            <p className="font-mono text-foreground">{uptime ?? "—"}</p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground mt-3 bg-secondary/50 px-3 py-2 rounded-lg">
          {note}
        </p>
      </GlassCardContent>

      <GlassCardFooter>
        {/* START nur wenn nicht running & nicht starting */}
        {!isRunning && !isStarting && (
          <Button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onStart();
            }}
            disabled={isStopping}
            className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <Play className="h-4 w-4 mr-2" />
            Start
          </Button>
        )}

        {/* STOP wenn running ODER starting */}
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
            className="flex-1 border-destructive/50 text-destructive hover:bg-destructive/10"
          >
            <Square className="h-4 w-4 mr-2" />
            Stop
          </Button>
        )}
      </GlassCardFooter>
    </GlassCard>
  );
}
