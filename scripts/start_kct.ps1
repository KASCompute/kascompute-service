# --- KASCompute Testnet Starter (smart) ---
# Pfade ANPASSEN, falls dein Projekt woanders liegt:
$ProjectRoot = "C:\Users\Tarik Gaming PC\Desktop\kascompute-service"
$BinPath     = Join-Path $ProjectRoot "target\release\testnet-launcher.exe"

# Optional: GENESIS_PATH setzen (falls du eine genesis.json nutzt)
# $env:GENESIS_PATH = Join-Path $ProjectRoot "genesis-builder\output\genesis.json"

# 1) In Projekt-Root wechseln
Set-Location $ProjectRoot

# 2) Freien Port suchen (8080 -> 9090 -> 10080)
$CandidatePorts = @(8080, 9090, 10080)
function Test-PortFree([int]$port) {
    try {
        $busy = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        return -not $busy
    } catch { return $true }
}

$chosen = $null
foreach ($p in $CandidatePorts) {
    if (Test-PortFree $p) { $chosen = $p; break }
}
if (-not $chosen) {
    Write-Host "❌ Kein freier Port (8080/9090/10080) gefunden." -ForegroundColor Red
    exit 1
}
$env:PORT = "$chosen"
Write-Host "✅ Verwende Port $env:PORT" -ForegroundColor Green

# 3) Build (Release)
Write-Host "🔨 Baue testnet-launcher (Release)..." -ForegroundColor Yellow
# Falls du nur den Launcher bauen willst, reicht -p testnet-launcher
cargo build -p testnet-launcher --release
if ($LASTEXITCODE -ne 0) { Write-Host "❌ Build fehlgeschlagen." -ForegroundColor Red; exit 1 }

if (-not (Test-Path $BinPath)) {
    Write-Host "❌ Binary nicht gefunden: $BinPath" -ForegroundColor Red
    exit 1
}

# 4) Vorhandene testnet-launcher Prozesse freundlich beenden
Get-Process testnet-launcher -ErrorAction SilentlyContinue | ForEach-Object {
    try { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue } catch {}
}

# 5) Launcher starten
Write-Host "🚀 Starte Launcher: $BinPath" -ForegroundColor Cyan
$proc = Start-Process -FilePath $BinPath -WorkingDirectory $ProjectRoot -PassThru

Start-Sleep -Seconds 1

# 6) Health-Check
$healthUrl = "http://127.0.0.1:$($env:PORT)/health"
try {
    $res = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 5
    if ($res.StatusCode -eq 200) {
        Write-Host "✅ Health OK: $healthUrl" -ForegroundColor Green
    } else {
        Write-Host "⚠️ Health Status: $($res.StatusCode)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠️ Health nicht erreichbar (läuft der Prozess?): $healthUrl" -ForegroundColor Yellow
}

# 7) Dashboard öffnen
$dash = "http://127.0.0.1:$($env:PORT)/dashboard/"
Write-Host "🌐 Öffne Dashboard: $dash" -ForegroundColor Green
Start-Process $dash

Write-Host "ℹ️  Tipp: POST /reward/preview mit PowerShell:"
Write-Host "    Invoke-RestMethod -Method Post -Uri http://127.0.0.1:$($env:PORT)/reward/preview -ContentType 'application/json' -Body '{""month"":12}'"
Write-Host "    GET   /investor/value_flow?fee_annual=2000000&investor_pct=0.25&years=10"
