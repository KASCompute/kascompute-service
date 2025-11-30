# ================================
# KASCompute Test Node  (Render Backend)
# ================================

$NODE_ID     = "kct-node-01"
$PROFILE     = "gpu:rtx4090"
$BACKEND_URL = "https://kascompute-testnet.onrender.com"
$PUBLIC_KEY  = "Pk_" + ([Guid]::NewGuid().ToString("N").Substring(0,32))

while ($true) {

    # HEARTBEAT
    $heartbeatBody = @{
        node_id        = $NODE_ID
        public_key_hex = $PUBLIC_KEY
        compute_profile = $PROFILE
    }

    Invoke-RestMethod -Uri "$BACKEND_URL/node/heartbeat" -Method POST -ContentType "application/json" -Body (ConvertTo-Json $heartbeatBody)
    Write-Host "[HEARTBEAT OK]"

    # PROOF
    $jobId  = "job-$((Get-Random))"
    $wu     = 32000
    $reward = [Math]::Round($wu * 0.000001, 6)
    $hash   = "hash-$([Guid]::NewGuid().ToString('N'))"

    $proofBody = @{
        node_id              = $NODE_ID
        job_id               = $jobId
        work_units           = $wu
        estimated_reward_kct = $reward
        proof_hash           = $hash
    }

    Invoke-RestMethod -Uri "$BACKEND_URL/node/proof" -Method POST -ContentType "application/json" -Body (ConvertTo-Json $proofBody)
    Write-Host "[PROOF OK] job=$jobId wu=$wu"
    
    Start-Sleep -Seconds 3
}
