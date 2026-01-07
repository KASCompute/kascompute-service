import { RefreshCw } from "lucide-react";
import { StatusOrb } from "@/components/common/StatusOrb";
import { Button } from "@/components/ui/button";
import type { NodeStatus, MinerStatus } from "@/types";

interface HeaderProps {
  nodeStatus: NodeStatus;
  minerStatus: MinerStatus;
  onRefresh?: () => void;
}

export function Header({ nodeStatus, minerStatus, onRefresh }: HeaderProps) {
  const getStatusText = () => {
    const nodeUp = nodeStatus.uptime ?? "—";
    const minerUp = minerStatus.uptime ?? "—";

    if (nodeStatus.status === "running" && minerStatus.status === "running") {
      return `Both running • Node uptime ${nodeUp}`;
    }
    if (nodeStatus.status === "running") return `Node running • uptime ${nodeUp}`;
    if (minerStatus.status === "running") return `Miner running • uptime ${minerUp}`;
    return "All services stopped";
  };

  const isAnyRunning = nodeStatus.status === "running" || minerStatus.status === "running";

  return (
    <header className="h-16 border-b border-border/50 bg-card/50 backdrop-blur-sm px-6 flex items-center justify-between shrink-0">
      {/* ✅ NUR DIESER BLOCK IST DRAG */}
      <div data-tauri-drag-region className="flex flex-col select-none">
        <h1 className="text-lg font-semibold text-foreground tracking-tight">
          KASCompute Launcher
        </h1>
        <p className="text-xs text-muted-foreground">Node Operator / Miner</p>
      </div>

      {/* ✅ alles rechts bleibt klickbar */}
      <div className="flex items-center gap-4">
        <span className="px-2.5 py-1 text-xs font-medium rounded-md bg-muted/50 text-muted-foreground border border-border/50">
          TESTNET
        </span>

        <div className="flex items-center gap-3">
          <StatusOrb status={isAnyRunning ? "running" : "stopped"} size="md" />
          <span className="text-sm text-muted-foreground">{getStatusText()}</span>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onRefresh?.()}
          className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-secondary"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
