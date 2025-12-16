# KCT PRO WORKER for Node 02 (2× speed)

$ErrorActionPreference = "Stop"

$backend = "http://127.0.0.1:8080"
$node = "kct-pro-node-02"

Write-Host "Starting KCT PRO WORKER..." -ForegroundColor Cyan
Write-Host "Using node: $node" -ForegroundColor Yellow

while ($true) {

    Write-Host "[worker] Asking for next job..." -ForegroundColor Yellow

    $job = $null
    try {
        $job = Invoke-RestMethod -Uri "$backend/jobs/next" `
            -Method POST `
            -Body (@{ node_id = $node } | ConvertTo-Json) `
            -ContentType "application/json"
    }
    catch {
        # z.B. 204 No Content oder kurz Backend weg
        Start-Sleep -Seconds 2
        continue
    }

    # 🔒 Sicherheits-Check: wenn Response zwar da ist, aber keine id hat → skippen
    if ($null -eq $job -or -not $job.id) {
        Start-Sleep -Seconds 1
        continue
    }

    Write-Host "[worker] Received job #$($job.id) with $($job.work_units) WU (status=$($job.status))" -ForegroundColor Cyan

    # Work simulieren
    $sleepSeconds = [math]::Max([int]($job.work_units / 8000), 1)
    Write-Host "[worker] Simulating compute for $sleepSeconds seconds..." -ForegroundColor DarkYellow
    Start-Sleep -Seconds $sleepSeconds

    # Proof bauen – jetzt SICHER mit echten Werten
    $proof = @{
        node_id = $node
        job_id = $job.id
        work_units = $job.work_units
        timestamp_unix = [int][double]::Parse((Get-Date -UFormat %s))
    }

    Write-Host "[worker] Sending proof for job #$($job.id)..." -ForegroundColor Magenta

    try {
        Invoke-RestMethod -Uri "$backend/jobs/proof" `
            -Method POST `
            -Body ($proof | ConvertTo-Json) `
            -ContentType "application/json" | Out-Null

        Write-Host "[worker] Proof submitted for job #$($job.id)" -ForegroundColor Green
    }
    catch {
        Write-Host "[worker] ERROR submitting proof: $($_.Exception.Message)" -ForegroundColor Red
    }

    Start-Sleep -Seconds 1
}
