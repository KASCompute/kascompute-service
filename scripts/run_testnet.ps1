# =============================
# KASCompute Testnet Starter
# =============================

Write-Host "🚀 Checking for process on port 8080..."
$port = 8080
$process = netstat -ano | findstr ":$port" | ForEach-Object {
    ($_ -split '\s+')[-1]
}

if ($process) {
    Write-Host "⚠️ Port 8080 is in use. Killing process ID(s): $process"
    foreach ($pid in $process) {
        try {
            taskkill /PID $pid /F | Out-Null
        } catch {
            Write-Host "⚠️ Could not kill PID $pid"
        }
    }
} else {
    Write-Host "✅ Port 8080 is free."
}

# =============================
# Build and Run
# =============================
$projectPath = "C:\Users\Tarik Gaming PC\Desktop\kascompute-service"
Set-Location $projectPath

Write-Host "`n🔧 Building testnet-launcher (release)..."
cargo build -p testnet-launcher --release

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Build finished successfully!"
    Start-Process "http://127.0.0.1:8080/dashboard/"
    Write-Host "`n🌍 Launching KASCompute Testnet Launcher..."
    & ".\target\release\testnet-launcher.exe"
} else {
    Write-Host "`n❌ Build failed. Please check errors above."
}
