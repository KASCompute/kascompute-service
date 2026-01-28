import { useEffect, useState } from "react";
import { RefreshCw, Download, CheckCircle2, AlertTriangle } from "lucide-react";
import { GlassCard, GlassCardHeader, GlassCardTitle, GlassCardContent } from "@/components/common/GlassCard";
import { Button } from "@/components/ui/button";
import { isTauri } from "@/lib/tauri";
import { checkForUpdates, installUpdate } from "@/services/updater"; // <- EIN Import

type UpdateState =
  | { status: "idle"; message?: string }
  | { status: "checking"; message?: string }
  | { status: "available"; message?: string }
  | { status: "none"; message?: string }
  | { status: "error"; message: string }
  | { status: "downloading"; message?: string }
  | { status: "installing"; message?: string };

export function UpdateButtonCard() {
  const [st, setSt] = useState<UpdateState>({ status: "idle" });

  const runCheck = async () => {
    if (!isTauri()) {
      setSt({ status: "error", message: "Updater works only inside the installed app (Tauri)." });
      return;
    }
    setSt({ status: "checking", message: "Checking for updates…" });
    try {
      const res = await checkForUpdates();

      // Erwartung: res hat sowas wie { available: boolean, version?: string }
      if ((res as any)?.available) {
        const v = (res as any)?.version ? `v${(res as any).version}` : "Update available";
        setSt({ status: "available", message: v });
      } else {
        setSt({ status: "none", message: "Up to date" });
      }
    } catch (e: any) {
      setSt({ status: "error", message: e?.message ?? "Update check failed" });
    }
  };

  const runInstall = async () => {
    setSt({ status: "downloading", message: "Downloading…" });
    try {
      await installUpdate();
      setSt({ status: "installing", message: "Installing…" });
      // meistens macht updater danach restart, falls nicht:
      // location.reload() oder tauri relaunch – je nach impl
    } catch (e: any) {
      setSt({ status: "error", message: e?.message ?? "Install failed" });
    }
  };

  useEffect(() => {
    // optional: automatisch beim Öffnen checken
    runCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canInstall = st.status === "available";
  const busy = ["checking", "downloading", "installing"].includes(st.status);

  return (
    <GlassCard>
      <GlassCardHeader>
        <GlassCardTitle>Updates</GlassCardTitle>
      </GlassCardHeader>

      <GlassCardContent className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            {st.status === "available" ? (
              <span className="text-foreground">{st.message ?? "Update available"}</span>
            ) : st.status === "none" ? (
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success" />
                <span>{st.message ?? "Up to date"}</span>
              </span>
            ) : st.status === "error" ? (
              <span className="flex items-center gap-2 text-warning">
                <AlertTriangle className="h-4 w-4" />
                <span>{st.message}</span>
              </span>
            ) : (
              <span>{st.message ?? "—"}</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={runCheck}
              disabled={busy}
              className="h-8"
              title="Check for updates"
            >
              <RefreshCw className={`h-4 w-4 ${st.status === "checking" ? "animate-spin" : ""}`} />
            </Button>

            <Button
              size="sm"
              onClick={runInstall}
              disabled={!canInstall || busy}
              className="h-8"
              title="Install update"
            >
              <Download className="h-4 w-4 mr-2" />
              Update
            </Button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          The Update button stays visible. It activates only when an update is available.
        </p>
      </GlassCardContent>
    </GlassCard>
  );
}
