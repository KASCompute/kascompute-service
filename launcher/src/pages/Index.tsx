import { useMemo, useState } from "react";
import { Layout, PageType } from "@/components/layout/Layout";

import { OverviewPage } from "@/components/pages/OverviewPage";
import { NodeOperatorPage } from "@/components/pages/NodeOperatorPage";
import { MinerPage } from "@/components/pages/MinerPage";
import { SettingsPage } from "@/components/pages/SettingsPage";

import type { Config } from "@/types";
import { useTauriLauncher } from "@/hooks/useTauriLauncher";

export default function Index() {
  // -----------------------------
  // STATE
  // -----------------------------
  const [activePage, setActivePage] = useState<PageType>("overview");

  const [cfg, setCfg] = useState<Config>({
    scriptsDirectory: "",
    dashboardUrl: "https://kascompute.org",
    role: "both",
  });

  // -----------------------------
  // TAURI LAUNCHER HOOK
  // -----------------------------
  const {
    nodeStatus,
    minerStatus,
    nodeLogs,
    minerLogs,
    minerProofs,
    minerStats,
    actions,
    refresh,
  } = useTauriLauncher();

  // -----------------------------
  // STATIC DATA
  // -----------------------------
  const requiredScripts = useMemo(
    () => [
      { name: "kascompute-node.exe", present: true },
      { name: "kascompute-miner.exe", present: true },
    ],
    []
  );

  // -----------------------------
  // PAGE CONTENT
  // -----------------------------
  const content = useMemo(() => {
    switch (activePage) {
      case "overview":
        return (
          <OverviewPage
            nodeStatus={nodeStatus}
            minerStatus={minerStatus}
            actions={actions}
          />
        );

      case "node":
        return (
          <NodeOperatorPage
            status={nodeStatus}
            logs={nodeLogs}
            onStart={actions.startNode}
            onStop={actions.stopNode}
          />
        );

      case "miner":
        return (
          <MinerPage
            status={minerStatus}
            logs={minerLogs}
            onStart={actions.startMiner}
            onStop={actions.stopMiner}
            proofs={minerProofs}
            stats={minerStats}
          />
        );

      case "settings":
        return (
          <SettingsPage
            config={cfg}
            requiredScripts={requiredScripts}
            onUpdateConfig={(updates: Partial<Config>) =>
              setCfg((prev) => ({ ...prev, ...updates }))
            }
          />
        );

      default:
        return (
          <OverviewPage
            nodeStatus={nodeStatus}
            minerStatus={minerStatus}
            actions={actions}
          />
        );
    }
  }, [
    activePage,
    nodeStatus,
    minerStatus,
    nodeLogs,
    minerLogs,
    minerProofs,
    minerStats,
    actions,
    cfg,
    requiredScripts,
  ]);

  // -----------------------------
  // LAYOUT
  // -----------------------------
  return (
    <Layout
      activePage={activePage}
      onNavigate={setActivePage}
      nodeStatus={nodeStatus}
      minerStatus={minerStatus}
      onRefresh={refresh}
    >
      {content}
    </Layout>
  );
}
