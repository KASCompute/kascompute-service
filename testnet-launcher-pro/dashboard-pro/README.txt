KASCompute Testnet — Community Pack

1) Install PowerShell 7:
   https://learn.microsoft.com/powershell/

2) Unzip this folder.

3) Start:
   - Easiest: right-click "start_all_pro.ps1" → Run with PowerShell
   - Or:
     pwsh -ExecutionPolicy Bypass -File .\start_all_pro.ps1

Workload:
- Edit kascompute_env.ps1
  WORKLOAD_MODE="sim"  (light demo)
  WORKLOAD_MODE="hash" (real CPU work / verified compute)

Identity:
- identity.json is created on first run (persistent node_id).
- Keep it to preserve your node identity across restarts.
