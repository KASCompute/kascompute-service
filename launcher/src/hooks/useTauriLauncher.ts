import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { safeInvoke, isTauri } from "@/lib/tauri";
import { listen } from "@tauri-apps/api/event";
import type { NodeStatus, MinerStatus, LogEntry } from "@/types";

type BackendStatus = {
  node: { running: boolean; pid?: number | null };
  miner: { running: boolean; pid?: number | null };
};

type SidecarLogPayload = {
  target: "node" | "miner";
  stream: "stdout" | "stderr" | "event";
  line: string;
};

const DEFAULT_NODE: NodeStatus = {
  status: "stopped",
  pid: undefined,
  uptime: undefined,
  lastHeartbeat: undefined,
};

const DEFAULT_MINER: MinerStatus = {
  status: "stopped",
  pid: undefined,
  uptime: undefined,
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
  const apiBase = "https://kascompute-testnet.onrender.com";

  // verhindert parallele Calls
  const busyRef = useRef(false);

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

  const apply = useCallback((s: BackendStatus) => {
    // NODE
    if (s?.node?.running) {
      setNodeStatus((p) => ({
        ...p,
        status: "running",
        pid: (s.node.pid ?? undefined) as any,
      }));
    } else {
      setNodeStatus({ ...DEFAULT_NODE, status: "stopped" });
    }

    // MINER
    if (s?.miner?.running) {
      setMinerStatus((p) => ({
        ...p,
        status: "running",
        pid: (s.miner.pid ?? undefined) as any,
      }));
    } else {
      setMinerStatus({ ...DEFAULT_MINER, status: "stopped" });
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!isTauri()) return;
    if (busyRef.current) return;

    busyRef.current = true;
    try {
      const s = await safeInvoke<BackendStatus>("get_status");
      if (s) apply(s);
    } catch (e) {
      console.error("get_status failed", e);

      // Bei Fehler NICHT auf starting/stopping hängen bleiben:
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

          pushLog({
            id: newId(),
            target: p.target,
            level: levelFromStream(p.stream),
            timestamp: nowTs(),
            message: String(p.line ?? ""),
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
          if (id?.node_id && id?.public_key_hex) identityRef.current = id;
        }
        const id = identityRef.current;
        if (!id) return;

        const role =
          nodeStatus.status === "running" && minerStatus.status === "running"
            ? "both"
            : nodeStatus.status === "running"
            ? "node"
            : "miner";

        // ✅ WICHTIG: KEIN args: {...} mehr!
        // Rust command signature: send_heartbeat(api_base: String, payload: HeartbeatPayload)
        await safeInvoke("send_heartbeat", {
          apiBase,
          payload: {
            node_id: id.node_id,
            public_key_hex: id.public_key_hex,
            role,
            launcher_version: "0.1.0",
            // Geo absichtlich leer → Backend macht lookup
          },
        });

        setNodeStatus((p) => ({ ...p, lastHeartbeat: "just now" }));
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

    // sofort einmal
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
        if (busyRef.current) return;

        setNodeStatus((p) => ({ ...p, status: "starting" }));
        busyRef.current = true;

        try {
          await safeInvoke("start_node");
        } catch (e) {
          console.error("start_node failed", e);
          setNodeStatus((p) => ({ ...p, status: "stopped" }));
        } finally {
          busyRef.current = false;
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
  }, [refresh]);

  return { nodeStatus, minerStatus, nodeLogs, minerLogs, actions, refresh };
}
