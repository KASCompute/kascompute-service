# KASCompute - PRO Local Node Starter (Node 02)

$ErrorActionPreference = "Stop"

Write-Host "Starting KCT PRO LOCAL Node 02..." -ForegroundColor Cyan

$backend = "http://127.0.0.1:8080"
$nodeName = "kct-pro-node-02"
$keyFile = "pro_node2_key.txt"

if (Test-Path $keyFile) {
    $pubKey = (Get-Content $keyFile -Raw).Trim()
    Write-Host "Loaded existing node key: $pubKey" -ForegroundColor Yellow
} else {
    $pubKey = [System.Guid]::NewGuid().ToString("N")
    Set-Content -Path $keyFile -Value $pubKey
    Write-Host "Generated NEW node key: $pubKey" -ForegroundColor Yellow
}

Write-Host "Backend:  $backend"  -ForegroundColor DarkCyan
Write-Host "NodeName: $nodeName" -ForegroundColor DarkCyan
Write-Host "PubKey:   $pubKey"   -ForegroundColor DarkCyan
Write-Host ""

while ($true) {
    $payloadObj = [PSCustomObject]@{
        node_id        = $nodeName
        public_key_hex = $pubKey
    }
    $payload = $payloadObj | ConvertTo-Json -Depth 3

    try {
        Invoke-RestMethod `
            -Uri "$backend/node/heartbeat" `
            -Method POST `
            -Body $payload `
            -ContentType "application/json" | Out-Null

        Write-Host "Heartbeat OK → $backend" -ForegroundColor Green
    }
    catch {
        Write-Host "Heartbeat FAILED → $($_.Exception.Message)" -ForegroundColor Red
    }

    Start-Sleep -Seconds 10
}
