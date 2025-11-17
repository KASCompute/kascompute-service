Write-Host "=== Investor Value Flow Test ===" -ForegroundColor Cyan

# Beispiel-Werte (wie auf deinem Dashboard):
$fee_annual   = 2000000
$investor_pct = 0.25
$years        = 10
$growth       = 0.02
$discount     = 0.08

$url = "http://127.0.0.1:8080/investor/value_flow?fee_annual=$fee_annual&investor_pct=$investor_pct&years=$years&growth=$growth&discount=$discount"

$response = curl.exe $url

Write-Host "`nResponse:" -ForegroundColor Green
$response
