# ===============================
# KASCompute PRO — Start All
# Starts Node + Miner in two pwsh windows
# ===============================

# Always relaunch in PowerShell 7 (PS5.1-safe)
if ($PSVersionTable.PSVersion.Major -lt 7) {
  $pwshCmd = Get-Command pwsh -ErrorAction SilentlyContinue
  if (-not $pwshCmd) {
    Write-Host "PowerShell 7 (pwsh) not found. Please install it first." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
  }
  & $pwshCmd.Source -NoExit -ExecutionPolicy Bypass -File $PSCommandPath
  exit
}

# Resolve script directory (CRITICAL)
$ROOT = Split-Path -Parent $PSCommandPath

Write-Host ""
Write-Host "Starting KASCOMPUTE PRO (node + miner)..." -ForegroundColor Cyan
Write-Host "Working directory: $ROOT" -ForegroundColor DarkGray
Write-Host ""

# --- Start Node ---
Start-Process pwsh `
  -WorkingDirectory $ROOT `
  -ArgumentList `
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-File", "`"$ROOT\start_node_pro.ps1`""

Start-Sleep -Milliseconds 600

# --- Start Miner ---
Start-Process pwsh `
  -WorkingDirectory $ROOT `
  -ArgumentList `
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-File", "`"$ROOT\start_miner_pro.ps1`""

Write-Host ""
Write-Host "Node and miner launched in separate windows." -ForegroundColor Green
Write-Host "Keep both windows open while participating in the testnet." -ForegroundColor DarkGray
Write-Host ""
