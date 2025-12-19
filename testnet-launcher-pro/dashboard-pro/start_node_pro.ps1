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
Write-Host '            KASCOMPUTE - Node Agent' -ForegroundColor DarkCyan
Write-Host ''

# ===============================
# KASCompute Node Agent (PS7)
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

$HB_SEC = 10
if ($env:HEARTBEAT_SEC) { try { $HB_SEC = [int]$env:HEARTBEAT_SEC } catch { $HB_SEC = 10 } }

function UnixNow { [uint64][DateTimeOffset]::UtcNow.ToUnixTimeSeconds() }
function C([string]$Text, [ConsoleColor]$Color = "Gray") { Write-Host $Text -ForegroundColor $Color }

C ("API  : {0}" -f $API_BASE) DarkGray
C ("NODE : {0}" -f $NODE_ID)  DarkGray
C ("HB   : every {0}s" -f $HB_SEC) DarkGray
C "" DarkGray

while ($true) {
  try {
    $body = @{
      node_id        = $NODE_ID
      public_key_hex = $PUBKEY
      timestamp_unix = (UnixNow)
      country        = $env:COUNTRY
    } | ConvertTo-Json -Depth 8

    Invoke-RestMethod -Method POST -Uri "$API_BASE/node/heartbeat" -ContentType "application/json" -Body $body | Out-Null
    C "[OK ] heartbeat sent" Green
  }
  catch {
    C ("[ERR] heartbeat failed: {0}" -f $_.Exception.Message) Red
  }

  Start-Sleep -Seconds $HB_SEC
}
