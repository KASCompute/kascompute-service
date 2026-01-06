import { useState } from "react";
import { FolderOpen, Globe, Check, AlertCircle } from "lucide-react";
import { GlassCard, GlassCardHeader, GlassCardTitle, GlassCardContent } from "@/components/common/GlassCard";
import { ValidatedInput } from "@/components/common/ValidatedInput";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Config, RequiredScript } from "@/types";

interface SettingsPageProps {
  config: Config;
  requiredScripts: RequiredScript[];
  onUpdateConfig: (updates: Partial<Config>) => void;
}

export function SettingsPage({ config, requiredScripts, onUpdateConfig }: SettingsPageProps) {
  const [scriptsDir, setScriptsDir] = useState(config.scriptsDirectory);
  const [dashboardUrl, setDashboardUrl] = useState(config.dashboardUrl);

  // Simple validation
  const isValidPath = scriptsDir.length > 0 && (scriptsDir.includes("\\") || scriptsDir.includes("/"));
  const isValidUrl = dashboardUrl.startsWith("http://") || dashboardUrl.startsWith("https://");

  const handleScriptsDirChange = (value: string) => {
    setScriptsDir(value);
    onUpdateConfig({ scriptsDirectory: value });
  };

  const handleDashboardUrlChange = (value: string) => {
    setDashboardUrl(value);
    onUpdateConfig({ dashboardUrl: value });
  };

  const handleRoleChange = (value: string) => {
    onUpdateConfig({ role: value as Config["role"] });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-foreground mb-1">Settings</h2>
        <p className="text-muted-foreground text-sm">
          Configure your KASCompute launcher
        </p>
      </div>

      {/* Configuration Section */}
      <GlassCard>
        <GlassCardHeader>
          <GlassCardTitle>Configuration</GlassCardTitle>
          <span className="text-xs text-muted-foreground font-mono">
            get_config / set_config
          </span>
        </GlassCardHeader>

        <GlassCardContent className="space-y-6">
          {/* Scripts Directory */}
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-6">
              <FolderOpen className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <ValidatedInput
                label="Scripts Directory"
                value={scriptsDir}
                onChange={(e) => handleScriptsDirChange(e.target.value)}
                placeholder="C:\KASCompute\scripts"
                validationState={scriptsDir ? (isValidPath ? "valid" : "warning") : "none"}
                validationMessage={
                  scriptsDir && !isValidPath ? "Enter a valid directory path" : undefined
                }
                hint="Path to the folder containing your KASCompute scripts"
              />
            </div>
          </div>

          {/* Dashboard URL */}
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-6">
              <Globe className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <ValidatedInput
                label="Dashboard URL"
                value={dashboardUrl}
                onChange={(e) => handleDashboardUrlChange(e.target.value)}
                placeholder="https://dashboard.kascompute.io"
                validationState={dashboardUrl ? (isValidUrl ? "valid" : "invalid") : "none"}
                validationMessage={
                  dashboardUrl && !isValidUrl ? "URL must start with http:// or https://" : undefined
                }
                hint="The KASCompute dashboard endpoint for reporting"
              />
            </div>
          </div>

          {/* Role Selector */}
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-6">
              <span className="text-primary font-bold text-sm">R</span>
            </div>
            <div className="flex-1 space-y-2">
              <Label className="text-sm font-medium text-foreground">Role</Label>
              <Select value={config.role} onValueChange={handleRoleChange}>
                <SelectTrigger className="bg-input border-border/50 focus:border-primary">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="node">Node Operator Only</SelectItem>
                  <SelectItem value="miner">Miner Only</SelectItem>
                  <SelectItem value="both">Both (dev)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Select which services to enable
              </p>
            </div>
          </div>
        </GlassCardContent>
      </GlassCard>

      {/* Required Scripts Section */}
      <GlassCard>
        <GlassCardHeader>
          <GlassCardTitle>Required Scripts</GlassCardTitle>
        </GlassCardHeader>

        <GlassCardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {requiredScripts.map((script) => (
              <ScriptCheckItem key={script.name} script={script} />
            ))}
          </div>
        </GlassCardContent>
      </GlassCard>
    </div>
  );
}

interface ScriptCheckItemProps {
  script: RequiredScript;
}

function ScriptCheckItem({ script }: ScriptCheckItemProps) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
        script.present
          ? "border-success/30 bg-success/5"
          : "border-warning/30 bg-warning/5"
      }`}
    >
      {script.present ? (
        <Check className="h-4 w-4 text-success" />
      ) : (
        <AlertCircle className="h-4 w-4 text-warning" />
      )}
      <span className={`text-sm font-mono ${script.present ? "text-foreground" : "text-warning"}`}>
        {script.name}
      </span>
    </div>
  );
}
