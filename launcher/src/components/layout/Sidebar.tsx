import { cn } from "@/lib/utils";
import { LayoutDashboard, Server, Cpu, Settings } from "lucide-react";
import kascomputeLogo from "@/assets/kascompute-logo.png";

export type PageType = "overview" | "node" | "miner" | "settings";

interface SidebarProps {
  activePage: PageType;
  onNavigate: (page: PageType) => void;
}

const navItems: { id: PageType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "node", label: "Node Operator", icon: Server },
  { id: "miner", label: "Miner", icon: Cpu },
  { id: "settings", label: "Settings", icon: Settings },
];

export function Sidebar({ activePage, onNavigate }: SidebarProps) {
  return (
    <aside className="w-56 border-r border-border/50 bg-sidebar flex flex-col shrink-0">
      {/* Logo area */}
      <div className="h-16 flex items-center px-4 border-b border-border/50">
        <img 
          src={kascomputeLogo} 
          alt="KASCompute" 
          className="h-8 w-auto object-contain"
        />
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activePage === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4",
                  isActive && "drop-shadow-[0_0_8px_hsl(168,100%,45%,0.6)]"
                )}
              />
              {item.label}
              {isActive && (
                <div className="ml-auto h-1.5 w-1.5 rounded-full bg-primary animate-pulse-glow" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border/50">
        <p className="text-xs text-muted-foreground text-center">
          v1.0.0 • testnet
        </p>
      </div>
    </aside>
  );
}
