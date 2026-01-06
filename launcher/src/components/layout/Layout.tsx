import { ReactNode } from "react";
import { Header } from "./Header";
import { Sidebar, PageType } from "./Sidebar";
import type { NodeStatus, MinerStatus } from "@/types";

interface LayoutProps {
  children: ReactNode;
  activePage: PageType;
  onNavigate: (page: PageType) => void;
  nodeStatus: NodeStatus;
  minerStatus: MinerStatus;
  onRefresh?: () => void;
}

export function Layout({
  children,
  activePage,
  onNavigate,
  nodeStatus,
  minerStatus,
  onRefresh,
}: LayoutProps) {
  return (
    <div className="h-screen w-full flex bg-background overflow-hidden">
      {/* Sidebar */}
      <Sidebar activePage={activePage} onNavigate={onNavigate} />

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <Header
          nodeStatus={nodeStatus}
          minerStatus={minerStatus}
          onRefresh={onRefresh}
        />

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

export type { PageType };
