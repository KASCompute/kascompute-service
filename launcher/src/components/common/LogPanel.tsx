import { cn } from "@/lib/utils";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LogEntry } from "@/types";
import { Button } from "@/components/ui/button";
import { Copy, Pause, Play, Trash2, ArrowDown } from "lucide-react";

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
  maxHeight = "420px",
  title = "Live Logs",
  copyLines = 250,
}: LogPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const [paused, setPaused] = useState(false);

  // remembers last visible log id at "clear"
  const [clearAfterId, setClearAfterId] = useState<string | null>(null);

  // smart autoscroll: only scroll if user is at bottom
  const [autoScroll, setAutoScroll] = useState(true);

  const finalLogs = useMemo(() => {
    const arr = logs ?? [];
    if (!clearAfterId) return arr;

    const idx = arr.findIndex((l) => l.id === clearAfterId);
    if (idx === -1) return arr;
    return arr.slice(idx + 1);
  }, [logs, clearAfterId]);

  // track whether user is at bottom (so we don't yank scroll when user is reading)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onScroll = () => {
      const threshold = 24;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - threshold;
      setAutoScroll(atBottom);
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener("scroll", onScroll as any);
  }, []);

  // autoscroll only if not paused AND user is at bottom
  useEffect(() => {
    if (paused) return;
    if (!autoScroll) return;
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [finalLogs, paused, autoScroll]);

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

  const scrollToBottom = () => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setAutoScroll(true);
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-foreground">{title}</div>

        <div className="flex items-center gap-2">
          {!autoScroll && !paused && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={scrollToBottom}
              className="h-8"
              title="Scroll to bottom"
            >
              <ArrowDown className="h-4 w-4 mr-2" />
              Bottom
            </Button>
          )}

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
        className={cn(
          "overflow-y-auto rounded-xl border border-border/50",
          "bg-black/20 backdrop-blur-sm",
          "px-4 py-3"
        )}
        style={{ maxHeight }}
      >
        {finalLogs.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-10">
            {clearAfterId ? "Cleared. Waiting for new logs…" : "No logs available"}
          </div>
        ) : (
          <div className="font-mono text-xs leading-5">
            {finalLogs.map((log) => (
              <LogLine key={log.id} log={log} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LogLine({ log }: { log: LogEntry }) {
  const levelDot =
    log.level === "error"
      ? "bg-destructive"
      : log.level === "warn"
      ? "bg-yellow-400"
      : "bg-primary";

  const levelText =
    log.level === "error"
      ? "text-destructive"
      : log.level === "warn"
      ? "text-yellow-300"
      : "text-foreground";

  return (
    <div className="flex items-start gap-3 py-1">
      <span className="text-muted-foreground shrink-0 w-[92px]">{log.timestamp}</span>

      <span className="shrink-0 mt-[6px]">
        <span className={cn("inline-block h-2 w-2 rounded-full", levelDot)} />
      </span>

      <span className={cn("flex-1 break-words", levelText)}>{log.message}</span>
    </div>
  );
}
