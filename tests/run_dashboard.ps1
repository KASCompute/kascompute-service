param(
    [switch]$NoBuild
)

$ErrorActionPreference = "Stop"

# 👉 Pfad zu deinem Projekt (mit Anführungszeichen wegen "Gaming PC")
$projectPath = "C:\Users\Tarik Gaming PC\Desktop\kascompute-service"

Write-Host ">>> Changing directory to project..." -ForegroundColor Cyan
Set-Location $projectPath

if (-not $NoBuild) {
    Write-Host ">>> Building testnet-launcher (release)..." -ForegroundColor Cyan
    cargo build -p testnet-launcher --release
    Write-Host ">>> Build finished." -ForegroundColor Green
} else {
    Write-Host ">>> Skipping build (NoBuild flag set)." -ForegroundColor Yellow
}

# Pfad zur EXE
$exe = Join-Path $projectPath "target\release\testnet-launcher.exe"

if (-not (Test-Path $exe)) {
    Write-Host "!!! Launcher EXE not found: $exe" -ForegroundColor Red
    Write-Host "   Run without -NoBuild so it can be compiled." -ForegroundColor Red
    exit 1
}

Write-Host ">>> Starting testnet-launcher in a new window..." -ForegroundColor Cyan
Start-Process $exe

Start-Sleep -Seconds 2

$dashUrl = "http://127.0.0.1:8080/dashboard/"
Write-Host ">>> Opening dashboard: $dashUrl" -ForegroundColor Cyan
Start-Process $dashUrl

Write-Host ">>> Done. Launcher is running, dashboard opened." -ForegroundColor Green
