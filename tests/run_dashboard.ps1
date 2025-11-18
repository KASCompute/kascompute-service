param(
    [switch]$NoBuild
)

$ErrorActionPreference = "Stop"

# Pfad zu deinem Projekt
$projectPath = "C:\Users\Tarik Gaming PC\Desktop\kascompute-service"

Write-Host ">>> Changing directory to project..." -ForegroundColor Cyan
Set-Location $projectPath

if (-not $NoBuild) {
    Write-Host ">>> Building kascompute-service (release)..." -ForegroundColor Cyan
    cargo build --release
    Write-Host ">>> Build finished." -ForegroundColor Green
}

# Pfad zum neuen Backend-Binary
$exe = Join-Path $projectPath "target\release\kascompute-service.exe"

if (-not (Test-Path $exe)) {
    Write-Host "ERROR: Executable not found: $exe" -ForegroundColor Red
    Write-Host "   Did the build fail? Try running without -NoBuild." -ForegroundColor Yellow
    exit 1
}

Write-Host ">>> Starting kascompute-service in a new window..." -ForegroundColor Cyan
Start-Process $exe

Start-Sleep -Seconds 2

$dashUrl = "http://127.0.0.1:8080/dashboard/"
Write-Host ">>> Opening dashboard: $dashUrl" -ForegroundColor Cyan
Start-Process $dashUrl

Write-Host ">>> Done. Launcher is running, dashboard opened." -ForegroundColor Green
