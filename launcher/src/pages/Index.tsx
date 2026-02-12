import React, { useEffect, useMemo, useState } from "react";
import { Layout, PageType } from "@/components/layout/Layout";

import { OverviewPage } from "@/components/pages/OverviewPage";
import { NodeOperatorPage } from "@/components/pages/NodeOperatorPage";
import { MinerPage } from "@/components/pages/MinerPage";
import { SettingsPage } from "@/components/pages/SettingsPage";

import type { Config } from "@/types";
import { useTauriLauncher } from "@/hooks/useTauriLauncher";

// ✅ Simple error boundary so a page crash doesn't blank the whole UI
class PageErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: any }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  componentDidCatch(error: any, info: any) {
    console.error("Page crashed:", error, info);
  }
  render() {
    if (this.state.hasError) {
      const msg =
        this.state.error?.message ||
        (typeof this.state.error === "string" ? this.state.error : "Unknown error");
      return (
        <div className="p-6 space-y-3">
          <div className="text-lg font-semibold text-foreground">UI crashed</div>
          <div className="text-sm text-muted-foreground">
            A page component threw an error. Check DevTools Console.
          </div>
          <pre className="text-xs bg-black/30 border border-border/40 rounded-xl p-3 overflow-auto">
            {String(msg)}
          </pre>
        </div>
      );
    }
    return this.props.children as any;
  }
}

export default function Index() {
  // -----------------------------
  // STATE
  // -----------------------------
  const [activePage, setActivePage] = useState<PageType>("overview");

  const [cfg, setCfg] = useState<Config>({
    scriptsDirectory: "",
    dashboardUrl: "https://dashboard.kascompute.org",
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
    nodeId,
    minerId,
    actions,
    refresh,
  } = useTauriLauncher();

  // ✅ DEBUG: expose logs to DevTools Console
  useEffect(() => {
    (window as any).__logs_debug = {
      node: (nodeLogs ?? []).slice(-200),
      miner: (minerLogs ?? []).slice(-200),
      all: [...(nodeLogs ?? []), ...(minerLogs ?? [])].slice(-400),
    };
  }, [nodeLogs, minerLogs]);

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
        return <OverviewPage nodeStatus={nodeStatus} minerStatus={minerStatus} actions={actions} />;

      case "node":
        return (
<NodeOperatorPage
  status={nodeStatus}
  logs={[...nodeLogs, ...minerLogs]} // 
  onStart={actions.startNode}
  onStop={actions.stopNode}
  nodeId={nodeId}
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
            minerId={minerId}
          />
        );

      case "settings":
        return (
          <SettingsPage
            config={cfg}
            requiredScripts={requiredScripts}
            onUpdateConfig={(updates: Partial<Config>) => setCfg((prev) => ({ ...prev, ...updates }))}
          />
        );

      default:
        return <OverviewPage nodeStatus={nodeStatus} minerStatus={minerStatus} actions={actions} />;
    }
  }, [
    activePage,
    nodeStatus,
    minerStatus,
    nodeLogs,
    minerLogs,
    minerProofs,
    minerStats,
    nodeId,
    minerId,
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
      <PageErrorBoundary>{content}</PageErrorBoundary>
    </Layout>
  );
}
