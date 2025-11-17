Write-Host "=== Reward Preview Test ===" -ForegroundColor Cyan

# JSON korrekt escapen:
$json = '{\"month\": 12}'

$response = curl.exe -X POST "http://127.0.0.1:8080/reward/preview" `
  -H "Content-Type: application/json" `
  -d $json

Write-Host "`nResponse:" -ForegroundColor Green
$response
