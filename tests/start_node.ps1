# ================================
# KASCompute Test Node (Render Version)
# ================================

$NODE_ID    = "kct-node-01"                    # gerne anpassen (muss nur eindeutig sein)
$BACKEND_URL = "https://kascompute-testnet.onrender.com"
$PROFILE    = "gpu:rtx4090"                   # oder z.B. "cpu:i5-12400"

while ($true) {

    try {
        # =======================
        # HEARTBEAT
        # =======================
        $heartbeatBody = @{
            node_id         = $NODE_ID
            public_key_hex  = "Pk_fake_public_key_12345"
            compute_profile = $PROFILE
        }

        $heartbeatJson = $heartbeatBody | ConvertTo-Json -Depth 5

        Write-Host ""
        Write-Host "========== HEARTBEAT =========="
        Write-Host "[DEBUG] POST $BACKEND_URL/node/heartbeat"
        Write-Host $heartbeatJson

        $hbResponse = Invoke-RestMethod `
            -Uri "$BACKEND_URL/node/heartbeat" `
            -Method POST `
            -ContentType "application/json" `
            -Body $heartbeatJson

        Write-Host "[HEARTBEAT OK] $(Get-Date) response:"
        Write-Host ($hbResponse | ConvertTo-Json -Depth 5)

        # =======================
        # PROOF GENERATION
        # =======================
        $jobId = "job-$([guid]::NewGuid().ToString())"
        $wu    = 32000
        $hash  = "hash-$([guid]::NewGuid().ToString())"

        $proofBody = @{
            node_id              = $NODE_ID
            job_id               = $jobId
            work_units           = $wu
            estimated_reward_kct = 0.0
            proof_hash           = $hash
        }

        $proofJson = $proofBody | ConvertTo-Json -Depth 5

        Write-Host ""
        Write-Host "=========== PROOF ==========="
        Write-Host "[DEBUG] POST $BACKEND_URL/node/proof"
        Write-Host $proofJson

        $proofResponse = Invoke-RestMethod `
            -Uri "$BACKEND_URL/node/proof" `
            -Method POST `
            -ContentType "application/json" `
            -Body $proofJson

        Write-Host "[PROOF OK] job=$jobId wu=$wu response:"
        Write-Host ($proofResponse | ConvertTo-Json -Depth 5)

    } catch {
        Write-Host ""
        Write-Host "************ ERROR ************"
        Write-Host "[ERROR] $($_.Exception.Message)"

        if ($_.Exception.Response -ne $null) {
            try {
                $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
                $responseBody = $reader.ReadToEnd()
                Write-Host "[ERROR] HTTP response body:"
                Write-Host $responseBody
            } catch {
                Write-Host "[ERROR] Could not read response body."
            }
        }
        Write-Host "********************************"
    }

    # etwas Pause zwischen Heartbeats
    Start-Sleep -Seconds 5
}
