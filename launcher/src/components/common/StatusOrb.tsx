import { cn } from "@/lib/utils";
import type { ServiceStatus } from "@/types";

interface StatusOrbProps {
  status: ServiceStatus;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: "h-2.5 w-2.5",
  md: "h-3.5 w-3.5",
  lg: "h-5 w-5",
};

const statusLabels: Record<ServiceStatus, string> = {
  running: "Running",
  stopped: "Stopped",
  starting: "Starting...",
  stopping: "Stopping...",
};

export function StatusOrb({ status, size = "md", showLabel = false, className }: StatusOrbProps) {
  const isActive = status === "running";
  const isTransitioning = status === "starting" || status === "stopping";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className={cn(
          "rounded-full transition-all duration-300",
          sizeClasses[size],
          isActive && "bg-primary animate-pulse-glow",
          isTransitioning && "bg-warning animate-pulse",
          status === "stopped" && "bg-muted-foreground/40"
        )}
      />
      {showLabel && (
        <span
          className={cn(
            "text-sm font-medium",
            isActive && "text-primary",
            isTransitioning && "text-warning",
            status === "stopped" && "text-muted-foreground"
          )}
        >
          {statusLabels[status]}
        </span>
      )}
    </div>
  );
}
