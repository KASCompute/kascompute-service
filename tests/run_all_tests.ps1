Write-Host "### KASCompute Testnet API – Quick Check ###" -ForegroundColor Cyan
Write-Host ""

Write-Host "--- 1) Health ---" -ForegroundColor Yellow
.\test_health.ps1

Write-Host "`n--- 2) Reward Preview ---" -ForegroundColor Yellow
.\test_reward.ps1

Write-Host "`n--- 3) Treasury Vested ---" -ForegroundColor Yellow
.\test_treasury.ps1

Write-Host "`n--- 4) Investor Value Flow ---" -ForegroundColor Yellow
.\test_investor.ps1

Write-Host "`n### Done. ###" -ForegroundColor Cyan
