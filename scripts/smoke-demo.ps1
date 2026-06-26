$ErrorActionPreference = "Stop"

$api = $env:DUOFY_API_URL
if (-not $api) {
  $api = "http://localhost:8000"
}

$email = $env:DUOFY_ADMIN_EMAIL
if (-not $email) {
  $email = "admin@duofy.com.br"
}

$password = $env:DUOFY_ADMIN_PASSWORD
if (-not $password) {
  $password = "admin123456"
}

Write-Host "Checking health..."
$health = Invoke-RestMethod -Uri "$api/health"
if ($health.status -ne "ok") {
  throw "Health is not ok"
}

Write-Host "Logging in..."
$login = Invoke-RestMethod -Uri "$api/api/auth/login" -Method Post -ContentType "application/json" -Body (@{
  email = $email
  password = $password
} | ConvertTo-Json)
$headers = @{ Authorization = "Bearer $($login.access_token)" }

Write-Host "Checking core endpoints..."
Invoke-RestMethod -Uri "$api/api/brands" -Headers $headers | Out-Null
Invoke-RestMethod -Uri "$api/api/admin/agents" -Headers $headers | Out-Null
Invoke-RestMethod -Uri "$api/api/metrics/summary" -Headers $headers | Out-Null

Write-Host "Creating chat session..."
$session = Invoke-RestMethod -Uri "$api/api/chat/sessions" -Method Post -Headers $headers -ContentType "application/json" -Body (@{
  title = "Smoke demo"
  brand_slug = "duofy_solucoes"
} | ConvertTo-Json)

Write-Host "Sending metrics task through chat..."
$response = Invoke-RestMethod -Uri "$api/api/chat/sessions/$($session.id)/messages" -Method Post -Headers $headers -ContentType "application/json" -Body (@{
  content = "Gere um relatorio interno de metricas para validar a demo."
  brand_slug = "duofy_solucoes"
} | ConvertTo-Json)

$task = $response.task
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Seconds 2
  $task = Invoke-RestMethod -Uri "$api/api/tasks/$($task.id)" -Headers $headers
  Write-Host "Task status: $($task.status)"
  if ($task.status -in @("completed", "failed")) {
    break
  }
}

if ($task.status -ne "completed") {
  throw "Task did not complete: $($task.status) $($task.error)"
}

Write-Host "Checking report PDF..."
$reports = Invoke-RestMethod -Uri "$api/api/reports" -Headers $headers
if ($reports.Count -lt 1) {
  throw "No reports found"
}
$pdf = Invoke-WebRequest -Uri "$api/api/reports/$($reports[0].id)/pdf" -Headers $headers -UseBasicParsing
if ($pdf.StatusCode -ne 200 -or $pdf.Headers["Content-Type"] -notlike "application/pdf*") {
  throw "Report PDF failed"
}

Write-Host "Smoke demo passed."
