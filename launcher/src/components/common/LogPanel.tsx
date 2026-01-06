import { cn } from "@/lib/utils";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LogEntry } from "@/types";
import { Button } from "@/components/ui/button";
import { Copy, Pause, Play, Trash2 } from "lucide-react";

interface LogPanelProps {
  logs: LogEntry[];
  className?: string;
  maxHeight?: string;
  title?: string;
  copyLines?: number;
}

export function LogPanel({
  logs,
  className,
  maxHeight = "400px",
  title = "Live Logs",
  copyLines = 200,
}: LogPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const [paused, setPaused] = useState(false);

  // ✅ Merkt sich die letzte Log-ID zum Zeitpunkt von "Clear"
  const [clearAfterId, setClearAfterId] = useState<string | null>(null);

  const finalLogs = useMemo(() => {
    const arr = logs ?? [];
    if (!clearAfterId) return arr;

    // finde Index der Log mit clearAfterId und zeige alles danach
    const idx = arr.findIndex((l) => l.id === clearAfterId);
    if (idx === -1) {
      // falls die alte ID nicht mehr existiert (z.B. logs wurden ersetzt),
      // dann zeigen wir einfach alles (weil es dann "neue" Logs sind)
      return arr;
    }
    return arr.slice(idx + 1);
  }, [logs, clearAfterId]);

  useEffect(() => {
    if (paused) return;
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [finalLogs, paused]);

  const handleClear = () => {
    const arr = logs ?? [];
    const last = arr[arr.length - 1];
    setClearAfterId(last?.id ?? "__cleared__");
  };

  const handleCopy = async () => {
    const arr = finalLogs.slice(Math.max(0, finalLogs.length - copyLines));
    const text = arr
      .map((l) => `[${l.timestamp}] ${l.level.toUpperCase()} ${l.message}`)
      .join("\n");

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-foreground">{title}</div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPaused((p) => !p)}
            className="h-8"
          >
            {paused ? (
              <>
                <Play className="h-4 w-4 mr-2" />
                Resume
              </>
            ) : (
              <>
                <Pause className="h-4 w-4 mr-2" />
                Pause
              </>
            )}
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="h-8"
          >
            <Copy className="h-4 w-4 mr-2" />
            Copy
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClear}
            className="h-8 border-destructive/40 text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Clear
          </Button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="space-y-2 overflow-y-auto rounded-xl bg-secondary/30 p-4 border border-border/50"
        style={{ maxHeight }}
      >
        {finalLogs.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-10">
            {clearAfterId ? "Cleared. Waiting for new logs…" : "No logs available"}
          </div>
        ) : (
          finalLogs.map((log) => <LogEntryCard key={log.id} log={log} />)
        )}
      </div>
    </div>
  );
}

interface LogEntryCardProps {
  log: LogEntry;
}

function LogEntryCard({ log }: LogEntryCardProps) {
  return (
    <div
      className={cn(
        "log-entry",
        log.level === "info" && "log-entry-info",
        log.level === "warn" && "log-entry-warn",
        log.level === "error" && "log-entry-error"
      )}
    >
      <div className="flex items-start gap-3">
        <span className="text-muted-foreground text-xs shrink-0 font-mono">
          {log.timestamp}
        </span>
        <span
          className={cn(
            "flex-1",
            log.level === "warn" && "text-warning",
            log.level === "error" && "text-destructive"
          )}
        >
          {log.message}
        </span>
      </div>
    </div>
  );
}
