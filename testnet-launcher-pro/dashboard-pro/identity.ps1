# ===============================
# KASCompute Identity Manager
# ===============================

$IdentityFile = Join-Path $PSScriptRoot "identity.json"

function New-RandomHex($bytes) {
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $buf = New-Object byte[] $bytes
  $rng.GetBytes($buf)
  ($buf | ForEach-Object { $_.ToString("x2") }) -join ""
}

function Initialize-Identity {
  if (Test-Path $IdentityFile) {
    $id = Get-Content $IdentityFile | ConvertFrom-Json
  } else {
    $suffix = (New-RandomHex 4)
    $id = @{
      node_id = "kct-node-$suffix"
      public_key_hex = (New-RandomHex 32)
      created_unix = [uint64][DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    }
    $id | ConvertTo-Json -Depth 5 | Set-Content $IdentityFile -Encoding UTF8
  }

  # export to env for Node & Miner
  $env:NODE_ID = $id.node_id
  $env:PUBLIC_KEY_HEX = $id.public_key_hex

  return $id
}
