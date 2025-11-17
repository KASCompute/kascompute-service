Write-Host "=== Treasury Vested Test ===" -ForegroundColor Cyan

# Beispiel: 1,5 Jahre
$t_years = 1.5

$url = "http://127.0.0.1:8080/treasury/vested?t_years=$t_years"

$response = curl.exe $url

Write-Host "`nResponse:" -ForegroundColor Green
$response
