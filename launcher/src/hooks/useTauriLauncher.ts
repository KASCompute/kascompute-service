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
  ...( {} as any ),
};

const DEFAULT_MINER: MinerStatus = {
  status: "stopped",
  pid: undefined,
  uptime: undefined,
  ...( {} as any ),
};

function nowTs() {
  return new Date().toLocaleTimeString();
}

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function useTauriLauncher() {
  const [nodeStatus, setNodeStatus] = useState<NodeStatus>(DEFAULT_NODE);
  const [minerStatus, setMinerStatus] = useState<MinerStatus>(DEFAULT_MINER);

  const [nodeLogs, setNodeLogs] = useState<LogEntry[]>([]);
  const [minerLogs, setMinerLogs] = useState<LogEntry[]>([]);

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
      setNodeStatus((p) => ({
        ...DEFAULT_NODE,
        status: "stopped",
        uptime: m?.node?.uptime ?? p.uptime,
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
        uptime: m?.miner?.uptime ?? p.uptime,
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

  // ✅ Live logs via events
  useEffect(() => {
    if (!isTauri()) return;

    let unsubs: Array<() => void> = [];
    let alive = true;

    const levelFromStream = (stream: SidecarLogPayload["stream"]): LogEntry["level"] => {
      if (stream === "stderr") return "error";
      if (stream === "event") return "info";
      return "info";
    };

    const subscribe = async () => {
      try {
        const handler = (payload: any) => {
          if (!alive) return;
          const p = payload as SidecarLogPayload;
          if (!p?.target || !p?.stream) return;

          const line = String(p.line ?? "");

          // ✅ Profi: lastHeartbeat wird aus node-sidecar Output abgeleitet
          if (p.target === "node" && /heartbeat\s+OK/i.test(line)) {
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

  // ✅ Load identity once (from Rust)
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

  // ✅ uptime baseline for heartbeat (persisted while app runs)
  const startedAtMsRef = useRef<number>(Date.now());

  // ✅ HEARTBEAT LOOP (läuft wenn Node ODER Miner läuft)
  useEffect(() => {
    if (!isTauri()) return;

    const shouldSend = nodeStatus.status === "running" || minerStatus.status === "running";
    if (!shouldSend) return;

    let stopped = false;

    const tick = async () => {
      try {
        // ensure identity exists
        if (!identityRef.current) {
          const id = await safeInvoke<{ node_id: string; public_key_hex: string }>("get_identity");
          if (id?.node_id && id?.public_key_hex) {
            identityRef.current = id;
            startedAtMsRef.current = Date.now();
          }
        }

        const id = identityRef.current;
        if (!id) return;

        // protocol-v1 roles[]
        const roles =
          nodeStatus.status === "running" && minerStatus.status === "running"
            ? ["node", "miner"]
            : nodeStatus.status === "running"
            ? ["node"]
            : ["miner"];

        // ✅ IMPORTANT: Tauri command erwartet api_base (snake_case) + payload
await safeInvoke("send_heartbeat", {
  args: {
    api_base: apiBase,
    payload: {
      node_id: id.node_id,
      public_key_hex: id.public_key_hex,
      roles,
      client_version: "launcher/0.2.0",
      uptime_sec: Math.floor((Date.now() - startedAtMsRef.current) / 1000),
    },
  },
});

      } catch (e) {
        pushLog({
          id: newId(),
          target: "node",
          level: "warn",
          timestamp: nowTs(),
          message: `heartbeat failed: ${String(e)}`,
        });
      }
    };

    tick();

    const t = setInterval(() => {
      if (!stopped) tick();
    }, 8000);

    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [apiBase, nodeStatus.status, minerStatus.status, pushLog]);

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
          startedAtMsRef.current = Date.now();
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
          startedAtMsRef.current = Date.now();
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
  }, [refresh, busy, apiBase]);

  return { nodeStatus, minerStatus, nodeLogs, minerLogs, actions, refresh };
}
