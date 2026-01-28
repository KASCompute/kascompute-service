import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { safeInvoke, isTauri } from "@/lib/tauri";
import { listen } from "@tauri-apps/api/event";
import type { NodeStatus, MinerStatus, LogEntry } from "@/types";

type BackendStatus = {
  node: { running: boolean; pid?: number | null };
  miner: { running: boolean; pid?: number | null };
};

type MetricsStatus = {
  node: { uptime?: string | null; crashes?: number | null };
  miner: { uptime?: string | null; crashes?: number | null };
};

type SidecarLogPayload = {
  target: "node" | "miner";
  stream: "stdout" | "stderr" | "event";
  line: string;
};

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

const DEFAULT_API = "https://kascompute-protocol-v1.onrender.com";

function normalizeApiBase(raw?: string) {
  let base = (raw || DEFAULT_API).trim().replace(/\/+$/, "");
  if (!base.endsWith("/v1")) base += "/v1";
  return base;
}

const DEFAULT_NODE: NodeStatus = {
  status: "stopped",
  pid: undefined,
  uptime: undefined,
  lastHeartbeat: undefined,
  ...({} as any),
};

const DEFAULT_MINER: MinerStatus = {
  status: "stopped",
  pid: undefined,
  uptime: undefined,
  ...({} as any),
};

function nowTs() {
  return new Date().toLocaleTimeString();
}

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function shortHex(s?: string, head = 10, tail = 8) {
  if (!s) return "—";
  if (s.length <= head + tail) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

export function useTauriLauncher() {
  const [nodeStatus, setNodeStatus] = useState<NodeStatus>(DEFAULT_NODE);
  const [minerStatus, setMinerStatus] = useState<MinerStatus>(DEFAULT_MINER);

  const [nodeLogs, setNodeLogs] = useState<LogEntry[]>([]);
  const [minerLogs, setMinerLogs] = useState<LogEntry[]>([]);

  // ✅ Miner proofs (structured)
  const [minerProofs, setMinerProofs] = useState<MinerProofUi[]>([]);

  // ✅ API Base (Render)
  const apiBase = normalizeApiBase(import.meta.env.VITE_API_BASE);

  // verhindert parallele Calls
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false); // Mutex für refresh/poll (nicht fürs UI)

  // Identity cache (kommt aus Rust get_identity)
  const identityRef = useRef<{ node_id: string; public_key_hex: string } | null>(null);

  const pushLog = useCallback((entry: LogEntry) => {
    const LIMIT = 300;

    if (entry.target === "node") {
      setNodeLogs((prev) => {
        const next = [...prev, entry];
        return next.length > LIMIT ? next.slice(next.length - LIMIT) : next;
      });
    } else {
      setMinerLogs((prev) => {
        const next = [...prev, entry];
        return next.length > LIMIT ? next.slice(next.length - LIMIT) : next;
      });
    }
  }, []);

  const apply = useCallback((s: BackendStatus, m?: MetricsStatus | null) => {
    // NODE
    if (s?.node?.running) {
      setNodeStatus((p) => ({
        ...p,
        status: "running",
        pid: (s.node.pid ?? undefined) as any,
        uptime: m?.node?.uptime ?? p.uptime,
        ...(typeof m?.node?.crashes === "number" ? ({ crashes: m.node.crashes } as any) : {}),
      }));
} else {
  setNodeStatus(() => ({
    ...DEFAULT_NODE,
    status: "stopped",
    pid: undefined,
    uptime: undefined,
    ...(typeof m?.node?.crashes === "number" ? ({ crashes: m.node.crashes } as any) : {}),
  }));
}


    // MINER
    if (s?.miner?.running) {
      setMinerStatus((p) => ({
        ...p,
        status: "running",
        pid: (s.miner.pid ?? undefined) as any,
        uptime: m?.miner?.uptime ?? p.uptime,
        ...(typeof m?.miner?.crashes === "number" ? ({ crashes: m.miner.crashes } as any) : {}),
      }));
    } else {
      setMinerStatus((p) => ({
        ...DEFAULT_MINER,
        status: "stopped",
        uptime: undefined,
        ...(typeof m?.miner?.crashes === "number" ? ({ crashes: m.miner.crashes } as any) : {}),
      }));
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!isTauri()) return;
    if (busyRef.current) return;

    busyRef.current = true;
    try {
      const [s, m] = await Promise.all([
        safeInvoke<BackendStatus>("get_status"),
        safeInvoke<MetricsStatus>("get_metrics"),
      ]);
      if (s) apply(s, m ?? null);
    } catch (e) {
      console.error("refresh failed", e);
      setNodeStatus((p) =>
        p.status === "starting" || p.status === "stopping" ? { ...p, status: "stopped" } : p
      );
      setMinerStatus((p) =>
        p.status === "starting" || p.status === "stopping" ? { ...p, status: "stopped" } : p
      );
    } finally {
      busyRef.current = false;
    }
  }, [apply]);

  // initial refresh
  useEffect(() => {
    refresh();
  }, [refresh]);

  // polling
  useEffect(() => {
    if (!isTauri()) return;
    const t = setInterval(() => refresh(), 1500);
    return () => clearInterval(t);
  }, [refresh]);

  // ✅ Live logs via events + Profi heartbeat derived from node output
  useEffect(() => {
    if (!isTauri()) return;

    let unsubs: Array<() => void> = [];
    let alive = true;

    const levelFromStream = (stream: SidecarLogPayload["stream"]): LogEntry["level"] => {
      if (stream === "stderr") return "error";
      if (stream === "event") return "info";
      return "info";
    };

    const isHeartbeatLine = (line: string) =>
      /\bkascompute-node\b.*\bheartbeat\b/i.test(line) || /\bheartbeat\s+OK\b/i.test(line);

    const subscribe = async () => {
      try {
        const handler = (payload: any) => {
          if (!alive) return;

          const p = payload as SidecarLogPayload;
          if (!p?.target || !p?.stream) return;

          const line = String(p.line ?? "");

          if (p.target === "node" && isHeartbeatLine(line)) {
            setNodeStatus((s) => ({ ...s, lastHeartbeat: "just now" }));
          }

          pushLog({
            id: newId(),
            target: p.target,
            level: levelFromStream(p.stream),
            timestamp: nowTs(),
            message: line,
          });
        };

        const u1 = await listen("sidecar:stdout", (e) => handler(e.payload));
        const u2 = await listen("sidecar:stderr", (e) => handler(e.payload));
        const u3 = await listen("sidecar:event", (e) => handler(e.payload));
        unsubs = [u1, u2, u3];
      } catch (err) {
        console.error("Failed to subscribe to sidecar events", err);
      }
    };

    subscribe();

    return () => {
      alive = false;
      unsubs.forEach((u) => {
        try {
          u();
        } catch {}
      });
    };
  }, [pushLog]);

  // ✅ Miner proof events (structured for UI)
  useEffect(() => {
    if (!isTauri()) return;

    let alive = true;
    let unlisten: null | (() => void) = null;

    (async () => {
      try {
        unlisten = await listen("miner:proof", (e) => {
          if (!alive) return;
          const p = e.payload as MinerProofUi;
          if (!p?.job_id) return;

          setMinerProofs((prev) => {
            const next = [...prev, p];
            return next.length > 200 ? next.slice(next.length - 200) : next;
          });

          // also push one human-friendly line into miner logs
          pushLog({
            id: newId(),
            target: "miner",
            level: "info",
            timestamp: nowTs(),
            message: `signed proof job=${p.job_id} hash=${shortHex(p.proof_hash_hex)} sig=${shortHex(p.signature_hex)}`,
          });
        });
      } catch (err) {
        console.error("Failed to listen miner:proof", err);
      }
    })();

    return () => {
      alive = false;
      try {
        unlisten?.();
      } catch {}
    };
  }, [pushLog]);

  // ✅ Load identity once (keep for later / UI)
  useEffect(() => {
    if (!isTauri()) return;

    (async () => {
      try {
        const id = await safeInvoke<{ node_id: string; public_key_hex: string }>("get_identity");
        if (id?.node_id && id?.public_key_hex) {
          identityRef.current = id;
          pushLog({
            id: newId(),
            target: "node",
            level: "info",
            timestamp: nowTs(),
            message: `Identity loaded: ${id.node_id}`,
          });
        }
      } catch (e) {
        console.error("get_identity failed", e);
      }
    })();
  }, [pushLog]);

  // ✅ Miner stats
  const minerStats = useMemo(() => {
    if (!minerProofs.length) {
      return {
        proofs: 0,
        avgElapsedMs: 0,
        avgWU: 0,
        wuPerSec: 0,
        lastProofTs: null as number | null,
      };
    }

    const n = minerProofs.length;
    const last = minerProofs[n - 1];
    const sumElapsed = minerProofs.reduce((a, x) => a + (x.elapsed_ms || 0), 0);
    const sumWU = minerProofs.reduce((a, x) => a + (x.work_units || 0), 0);
    const avgElapsedMs = Math.round(sumElapsed / n);
    const avgWU = Math.round(sumWU / n);

    const sumSec = sumElapsed / 1000;
    const wuPerSec = sumSec > 0 ? Math.round(sumWU / sumSec) : 0;

    return {
      proofs: n,
      avgElapsedMs,
      avgWU,
      wuPerSec,
      lastProofTs: last?.ts ?? null,
    };
  }, [minerProofs]);

  const actions = useMemo(() => {
    const requireTauri = () => {
      if (!isTauri()) {
        console.warn("Not running in Tauri - command ignored");
        return false;
      }
      return true;
    };

    return {
      startNode: async () => {
        if (!requireTauri()) return;
        if (busy) return;

        setBusy(true);
        setNodeStatus((p) => ({ ...p, status: "starting" }));

        try {
          await safeInvoke("start_node");
        } catch (e) {
          console.error("start_node failed", e);
          setNodeStatus((p) => ({ ...p, status: "stopped" }));
        } finally {
          setBusy(false);
          await refresh();
        }
      },

      stopNode: async () => {
        if (!requireTauri()) return;
        if (busyRef.current) return;

        setNodeStatus((p) => ({ ...p, status: "stopping" }));
        busyRef.current = true;

        try {
          await safeInvoke("stop_node");
        } catch (e) {
          console.error("stop_node failed", e);
          setNodeStatus((p) => ({ ...p, status: "stopped" }));
        } finally {
          busyRef.current = false;
          await refresh();
        }
      },

      startMiner: async () => {
        if (!requireTauri()) return;
        if (busyRef.current) return;

        setMinerStatus((p) => ({ ...p, status: "starting" }));
        busyRef.current = true;

        try {
          await safeInvoke("start_miner");
        } catch (e) {
          console.error("start_miner failed", e);
          setMinerStatus((p) => ({ ...p, status: "stopped" }));
        } finally {
          busyRef.current = false;
          await refresh();
        }
      },

      stopMiner: async () => {
        if (!requireTauri()) return;
        if (busyRef.current) return;

        setMinerStatus((p) => ({ ...p, status: "stopping" }));
        busyRef.current = true;

        try {
          await safeInvoke("stop_miner");
        } catch (e) {
          console.error("stop_miner failed", e);
          setMinerStatus((p) => ({ ...p, status: "stopped" }));
        } finally {
          busyRef.current = false;
          await refresh();
        }
      },
    };
  }, [refresh, busy]);

  return {
    nodeStatus,
    minerStatus,
    nodeLogs,
    minerLogs,
    minerProofs,
    minerStats,
    actions,
    refresh,
  };
}
