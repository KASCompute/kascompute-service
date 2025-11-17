Write-Host "=== Health Check ===" -ForegroundColor Cyan

$response = curl.exe "http://127.0.0.1:8080/health"

Write-Host "`nResponse:" -ForegroundColor Green
$response
