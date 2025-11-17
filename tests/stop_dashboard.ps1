<# KASCompute – Stop Dashboard
   Speichern als: stop_dashboard.ps1 im Projektordner kascompute-service
#>

$ErrorActionPreference = "SilentlyContinue"
Set-Location -Path $PSScriptRoot

# Erst gezielt das Binary schließen
Get-Process testnet-launcher | Stop-Process -Force

# Zur Sicherheit noch Port 8080 freimachen
$conns = Get-NetTCPConnection -LocalPort 8080 -State Listen
$pids  = $conns | Select-Object -ExpandProperty OwningProcess -Unique
foreach ($pid in $pids) { Stop-Process -Id $pid -Force }

Write-Host "🛑 KASCompute Launcher gestoppt." -ForegroundColor Yellow
