# Bootstrap: always re-launch in PowerShell 7 (PS5.1-parseable)
if ($PSVersionTable.PSVersion.Major -lt 7) {
  $pwshCmd = Get-Command pwsh -ErrorAction SilentlyContinue
  if (-not $pwshCmd) { Write-Host "PowerShell 7 (pwsh) not found." -ForegroundColor Red; exit 1 }
  & $pwshCmd.Source -NoExit -ExecutionPolicy Bypass -File $PSCommandPath
  exit
}

# -------- Banner (Safe ASCII) ----------
Clear-Host
Write-Host ''
Write-Host '  _  __    _    ____   ____                      _       ' -ForegroundColor Cyan
Write-Host ' | |/ /   / \  / ___| / ___|___  _ __ ___  _ __  | |_ ___ ' -ForegroundColor Cyan
Write-Host ' | '' /   / _ \ \___ \| |   / _ \| ''_ ` _ \| ''_ \ | __/ _ \' -ForegroundColor Cyan
Write-Host ' | . \  / ___ \ ___) | |__| (_) | | | | | | |_) || ||  __/' -ForegroundColor Cyan
Write-Host ' |_|\_\/_/   \_\____/ \____\___/|_| |_| |_| .__/  \__\___|' -ForegroundColor Cyan
Write-Host '                                          |_|              ' -ForegroundColor Cyan
Write-Host ''
Write-Host '            KASCOMPUTE - Miner Engine' -ForegroundColor DarkCyan
Write-Host ''

# ===============================
# KASCompute Miner Engine (PS7)
# ===============================

. "$PSScriptRoot\kascompute_env.ps1"
. "$PSScriptRoot\identity.ps1"
$IDENTITY = Initialize-Identity

# ---- API_BASE (guardrails: trim + remove trailing slash) ----
$API_BASE = $env:API_BASE
if (-not $API_BASE) { $API_BASE = "http://127.0.0.1:8080" }
$API_BASE = $API_BASE.Trim()
if ($API_BASE.EndsWith("/")) { $API_BASE = $API_BASE.TrimEnd("/") }

$NODE_ID  = $env:NODE_ID;  if (-not $NODE_ID)  { $NODE_ID  = "kct-node-001" }
$PUBKEY   = $env:PUBLIC_KEY_HEX; if (-not $PUBKEY) { $PUBKEY = "deadbeef00112233445566778899aabb" }

$POLL_SEC = 2
if ($env:POLL_SEC) { try { $POLL_SEC = [int]$env:POLL_SEC } catch { $POLL_SEC = 2 } }

$WORKLOAD_MODE = $env:WORKLOAD_MODE
if (-not $WORKLOAD_MODE) { $WORKLOAD_MODE = "sim" }
$WORKLOAD_MODE = $WORKLOAD_MODE.ToLower()

$ITERS_PER_WU = 1
if ($env:HASH_ITERS_PER_WU) { try { $ITERS_PER_WU = [int]$env:HASH_ITERS_PER_WU } catch { $ITERS_PER_WU = 1 } }

$MAX_ITERS = 200000
if ($env:HASH_MAX_ITERS) { try { $MAX_ITERS = [int]$env:HASH_MAX_ITERS } catch { $MAX_ITERS = 200000 } }

$CLIENT_VERSION = $env:CLIENT_VERSION
if (-not $CLIENT_VERSION) { $CLIENT_VERSION = "miner-pro/1.0.0" }

$AUTO_REGISTER = $env:MINER_AUTO_REGISTER
if (-not $AUTO_REGISTER) { $AUTO_REGISTER = "0" }

function UnixNow { [uint64][DateTimeOffset]::UtcNow.ToUnixTimeSeconds() }
function C([string]$Text, [ConsoleColor]$Color = "Gray") { Write-Host $Text -ForegroundColor $Color }

function OneTimeRegisterCheck {
  if ($AUTO_REGISTER -ne "1") { return }
  try {
    $body = @{
      node_id        = $NODE_ID
      public_key_hex = $PUBKEY
      timestamp_unix = (UnixNow)
      country        = $env:COUNTRY
    } | ConvertTo-Json -Depth 8

    Invoke-RestMethod -Method POST -Uri "$API_BASE/node/heartbeat" -ContentType "application/json" -Body $body | Out-Null
    C "[INFO] one-time registration check ok" DarkGray
  } catch {
    C ("[WARN] one-time registration check failed: {0}" -f $_.Exception.Message) Yellow
  }
}

function Do-Workload([uint64]$jobId, [uint64]$wu) {
  if ($WORKLOAD_MODE -ne "hash") {
    Start-Sleep -Milliseconds ([int]([math]::Min(2000, 10 + ($wu % 200))))
    return @{ mode="sim"; result_hash=$null; iters=0 }
  }

  $iters = [int]([math]::Min([double]$MAX_ITERS, [double]($wu * [uint64]$ITERS_PER_WU)))
  if ($iters -lt 1) { $iters = 1 }

  # IMPORTANT: ${} because ":" after variable breaks parsing
  $acc = "KASCompute:${NODE_ID}:${jobId}"
  for ($i = 0; $i -lt $iters; $i++) {
    $acc = [Convert]::ToHexString(
      [System.Security.Cryptography.SHA256]::HashData(
        [System.Text.Encoding]::UTF8.GetBytes("$acc|$i")
      )
    )
  }

  return @{ mode="hash"; result_hash=$acc; iters=$iters }
}

C ("API  : {0}" -f $API_BASE) DarkGray
C ("NODE : {0}" -f $NODE_ID)  DarkGray
C ("MODE : {0}" -f $WORKLOAD_MODE) DarkGray
C ("AUTO_REGISTER : {0}" -f $AUTO_REGISTER) DarkGray
C "" DarkGray

# optional one-time check (off by default)
OneTimeRegisterCheck

$accepted = 0

while ($true) {
  try {
    # 1) Get job
    $req = @{ node_id = $NODE_ID } | ConvertTo-Json
    $job = Invoke-RestMethod -Method POST -Uri "$API_BASE/jobs/next" -ContentType "application/json" -Body $req

    if (-not $job.id) {
      Write-Host "." -NoNewline -ForegroundColor DarkGray
      Start-Sleep -Seconds $POLL_SEC
      continue
    }

    $jobId = [uint64]$job.id
    $wu    = [uint64]$job.work_units

    C "" Gray
    C ("[JOB] id={0} work_units={1}" -f $jobId, $wu) Cyan

    # 2) Workload + timing
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $wl = Do-Workload -jobId $jobId -wu $wu
    $sw.Stop()

    if ($wl.mode -eq "hash") {
      C ("[WL ] mode=hash iters={0} ms={1}" -f $wl.iters, $sw.ElapsedMilliseconds) DarkGray
    } else {
      C ("[WL ] mode=sim  ms={0}" -f $sw.ElapsedMilliseconds) DarkGray
    }

    # 3) Submit proof
    $proof = @{
      node_id        = $NODE_ID
      job_id         = $jobId
      work_units     = $wu
      workload_mode  = $wl.mode
      elapsed_ms     = [uint64]$sw.ElapsedMilliseconds
      result_hash    = $wl.result_hash
      client_version = $CLIENT_VERSION
      timestamp_unix = (UnixNow)
    } | ConvertTo-Json -Depth 8

    Invoke-RestMethod -Method POST -Uri "$API_BASE/jobs/proof" -ContentType "application/json" -Body $proof | Out-Null

    $accepted++
    C ("[OK ] proof accepted total={0}" -f $accepted) Green

  } catch {
    C ("[ERR] miner error: {0}" -f $_.Exception.Message) Red
    Start-Sleep -Seconds $POLL_SEC
  }
}
