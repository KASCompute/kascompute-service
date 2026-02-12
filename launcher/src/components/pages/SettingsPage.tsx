import { useEffect, useMemo, useState } from "react";
import { Globe, RefreshCw, Download, ExternalLink } from "lucide-react";
import {
  GlassCard,
  GlassCardHeader,
  GlassCardTitle,
  GlassCardContent,
} from "@/components/common/GlassCard";
import { ValidatedInput } from "@/components/common/ValidatedInput";
import { Button } from "@/components/ui/button";
import { isTauri } from "@/lib/tauri";
import type { Config } from "@/types";
import { checkForUpdates } from "@/lib/updater";

interface SettingsPageProps {
  config: Config;
  requiredScripts?: any[]; // legacy prop, not used
  onUpdateConfig: (updates: Partial<Config>) => void;
}

type UpdateState =
  | { status: "idle"; msg?: string }
  | { status: "checking"; msg?: string }
  | { status: "available"; msg?: string; update: any }
  | { status: "none"; msg?: string }
  | { status: "error"; msg: string };

export function SettingsPage({ config, onUpdateConfig }: SettingsPageProps) {
  const [dashboardUrl, setDashboardUrl] = useState(config.dashboardUrl);

  const [u, setU] = useState<UpdateState>({ status: "idle" });

  const isValidUrl =
    dashboardUrl.startsWith("http://") || dashboardUrl.startsWith("https://");

  const handleDashboardUrlChange = (value: string) => {
    setDashboardUrl(value);
    onUpdateConfig({ dashboardUrl: value });
  };

  // Always-safe opener: no imports, never breaks build
  const openDashboard = async () => {
    const url = dashboardUrl.trim();
    if (!url || !isValidUrl) return;

    // Try Tauri global if available (v1 style). If not, fallback to window.open.
    try {
      const w = window as any;
      const tauriOpen = w?.__TAURI__?.shell?.open;
      if (typeof tauriOpen === "function") {
        await tauriOpen(url);
        return;
      }
    } catch {
      // ignore and fallback
    }

    window.open(url, "_blank", "noopener,noreferrer");
  };

  const runUpdateCheck = async () => {
    if (!isTauri()) {
      setU({ status: "error", msg: "Updater works only inside the installed app (Tauri)." });
      return;
    }
    setU({ status: "checking", msg: "Checking for updates…" });
    try {
      const update = await checkForUpdates(); // returns Update | null
      if (update) {
        const v = (update as any)?.version ? `v${(update as any).version}` : "Update available";
        setU({ status: "available", msg: v, update });
      } else {
        setU({ status: "none", msg: "Up to date" });
      }
    } catch (e: any) {
      setU({ status: "error", msg: e?.message ?? "Update check failed" });
    }
  };

  const runInstall = async () => {
    if (u.status !== "available") return;
    try {
      await u.update.download();
      await u.update.install();
    } catch (e: any) {
      setU({ status: "error", msg: e?.message ?? "Install failed" });
    }
  };

  useEffect(() => {
    runUpdateCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateBusy = u.status === "checking";
  const updateAvailable = u.status === "available";

  const cleanUrl = useMemo(() => dashboardUrl.trim(), [dashboardUrl]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-foreground mb-1">Settings</h2>
        <p className="text-muted-foreground text-sm">Configure your KASCompute launcher</p>
      </div>

      {/* Configuration */}
      <GlassCard>
        <GlassCardHeader>
          <GlassCardTitle>Configuration</GlassCardTitle>
          <span className="text-xs text-muted-foreground font-mono">get_config / set_config</span>
        </GlassCardHeader>

        <GlassCardContent className="space-y-6">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-6">
              <Globe className="h-5 w-5 text-primary" />
            </div>

            <div className="flex-1">
              <ValidatedInput
                label="Dashboard URL"
                value={dashboardUrl}
                onChange={(e) => handleDashboardUrlChange(e.target.value)}
                placeholder="https://dashboard.kascompute.org"
                validationState={dashboardUrl ? (isValidUrl ? "valid" : "invalid") : "none"}
                validationMessage={
                  dashboardUrl && !isValidUrl ? "URL must start with http:// or https://" : undefined
                }
                hint="The KASCompute dashboard endpoint for reporting"
              />

              {/* Clickable row (safe everywhere) */}
              <div className="mt-2 flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={openDashboard}
                  disabled={!isValidUrl}
                  className="h-8"
                  title="Open dashboard"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open
                </Button>

                {isValidUrl ? (
                  <a
                    href={cleanUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-mono text-primary hover:underline truncate max-w-[420px]"
                    title={cleanUrl}
                  >
                    {cleanUrl}
                  </a>
                ) : (
                  <span className="text-xs font-mono text-muted-foreground truncate max-w-[420px]">
                    {cleanUrl || "—"}
                  </span>
                )}
              </div>
            </div>
          </div>
        </GlassCardContent>
      </GlassCard>

      {/* Updates */}
      <GlassCard>
        <GlassCardHeader>
          <GlassCardTitle>Updates</GlassCardTitle>
        </GlassCardHeader>

        <GlassCardContent className="flex items-center justify-between gap-4">
          <div className="text-sm text-muted-foreground">
            {!isTauri()
              ? "Installierte App nötig (Updater nur in Tauri)."
              : u.status === "available"
              ? `Update verfügbar${u.msg ? ` • ${u.msg}` : ""}`
              : u.status === "none"
              ? "Up to date"
              : u.status === "checking"
              ? "Checking…"
              : u.status === "error"
              ? u.msg
              : "—"}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={runUpdateCheck}
              disabled={!isTauri() || updateBusy}
              className="h-8"
              title="Check for updates"
            >
              <RefreshCw className={`h-4 w-4 ${updateBusy ? "animate-spin" : ""}`} />
            </Button>

            <Button
              size="sm"
              onClick={runInstall}
              disabled={!isTauri() || !updateAvailable}
              className="h-8"
              title="Install update"
            >
              <Download className="h-4 w-4 mr-2" />
              Update
            </Button>
          </div>
        </GlassCardContent>
      </GlassCard>
    </div>
  );
}
     