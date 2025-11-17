# --- KASCompute Testnet Stopper ---
$procs = Get-Process testnet-launcher -ErrorAction SilentlyContinue
if ($procs) {
    $procs | ForEach-Object {
        try { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue } catch {}
    }
    Write-Host "🛑 testnet-launcher beendet." -ForegroundColor Green
} else {
    Write-Host "ℹ️  Kein testnet-launcher Prozess gefunden." -ForegroundColor Yellow
}
