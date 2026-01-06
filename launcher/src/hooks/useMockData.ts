import { useState, useCallback } from "react";
import type { NodeStatus, MinerStatus, LogEntry, Config, RequiredScript } from "@/types";

// Generate mock log entries
const generateMockLogs = (count: number, type: "node" | "miner"): LogEntry[] => {
  const now = new Date();
  const messages = {
    node: [
      "Node initialized successfully",
      "Connected to network peers",
      "Sync in progress...",
      "Received new header",
      "Heartbeat sent to dashboard",
      "Identity verification complete",
      "Credits tracked (internal)",
      "Peer connection established",
    ],
    miner: [
      "Miner started",
      "Connected to remote node",
      "Received new job",
      "Work unit accepted",
      "Hashrate: 1.2 GH/s",
      "Work unit completed",
      "Submitting work...",
      "Pool response: OK",
    ],
  };

  return Array.from({ length: count }, (_, i) => {
    const timestamp = new Date(now.getTime() - (count - i) * 5000);
    const level = Math.random() > 0.9 ? "warn" : Math.random() > 0.95 ? "error" : "info";
    const msgList = messages[type];
    const message = msgList[Math.floor(Math.random() * msgList.length)];

    return {
      id: `${type}-${i}`,
      timestamp: timestamp.toLocaleTimeString("en-US", { hour12: false }),
      message,
      level: level as LogEntry["level"],
    };
  });
};

export function useMockData() {
  const [nodeStatus, setNodeStatus] = useState<NodeStatus>({
    status: "running",
    pid: 12847,
    uptime: "12h 34m",
    lastHeartbeat: "2 seconds ago",
  });

  const [minerStatus, setMinerStatus] = useState<MinerStatus>({
    status: "stopped",
    pid: undefined,
    uptime: undefined,
  });

  const [nodeLogs] = useState<LogEntry[]>(() => generateMockLogs(15, "node"));
  const [minerLogs] = useState<LogEntry[]>(() => generateMockLogs(10, "miner"));

  const [config, setConfig] = useState<Config>({
    scriptsDirectory: "C:\\KASCompute\\scripts",
    dashboardUrl: "https://dashboard.kascompute.io",
    role: "both",
  });

  const [requiredScripts] = useState<RequiredScript[]>([
    { name: "node-operator.ps1", present: true },
    { name: "miner.ps1", present: true },
    { name: "config.json", present: true },
    { name: "identity.key", present: false },
  ]);

  // Mock command handlers
  const startNode = useCallback(() => {
    setNodeStatus((prev) => ({ ...prev, status: "starting" }));
    setTimeout(() => {
      setNodeStatus({
        status: "running",
        pid: Math.floor(Math.random() * 50000) + 10000,
        uptime: "0m",
        lastHeartbeat: "just now",
      });
    }, 1500);
  }, []);

  const stopNode = useCallback(() => {
    setNodeStatus((prev) => ({ ...prev, status: "stopping" }));
    setTimeout(() => {
      setNodeStatus({
        status: "stopped",
        pid: undefined,
        uptime: undefined,
        lastHeartbeat: undefined,
      });
    }, 1000);
  }, []);

  const startMiner = useCallback(() => {
    setMinerStatus((prev) => ({ ...prev, status: "starting" }));
    setTimeout(() => {
      setMinerStatus({
        status: "running",
        pid: Math.floor(Math.random() * 50000) + 10000,
        uptime: "0m",
      });
    }, 1500);
  }, []);

  const stopMiner = useCallback(() => {
    setMinerStatus((prev) => ({ ...prev, status: "stopping" }));
    setTimeout(() => {
      setMinerStatus({
        status: "stopped",
        pid: undefined,
        uptime: undefined,
      });
    }, 1000);
  }, []);

  const updateConfig = useCallback((updates: Partial<Config>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  }, []);

  return {
    nodeStatus,
    minerStatus,
    nodeLogs,
    minerLogs,
    config,
    requiredScripts,
    // Commands (matching Tauri command names)
    startNode,    // start_node
    stopNode,     // stop_node
    startMiner,   // start_miner
    stopMiner,    // stop_miner
    updateConfig, // set_config
  };
}
