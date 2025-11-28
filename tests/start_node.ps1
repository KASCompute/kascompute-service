# ============================================
# KASCompute Node Launcher – Start Script
# ============================================

Write-Host "🚀 Starting KASCompute Node..." -ForegroundColor Cyan
Write-Host ""

# >>> Pfad zu deinem kascompute-service-Projekt anpassen! <<<
$projectPath = "C:\Users\Tarik Gaming PC\Desktop\kascompute-service"

Set-Location $projectPath

# Optional: Browser-Dashboard automatisch öffnen
Start-Process "https://kascompute-testnet.onrender.com/dashboard/"

# Node starten (cargo run)
Write-Host "⏳ Launching node-launcher (cargo run --release --bin node-launcher)"
Write-Host "--------------------------------------"

cargo run --release --bin node-launcher

Write-Host ""
Write-Host "❗ Node stopped. Close this window to exit." -ForegroundColor Yellow
Read-Host "Press Enter to close"
