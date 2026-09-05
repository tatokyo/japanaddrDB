$ErrorActionPreference = "Stop"

# Fill these values before running
$ACCOUNT_ID = "YOUR_ACCOUNT_ID"
$ZONE_ID = "YOUR_ZONE_ID"
$API_TOKEN = "YOUR_API_TOKEN"
$SCRIPT_NAME = "japanaddrdb"
$PATTERN = "api.yourdomain.com/*" # e.g. https://api.yourdomain.com/*
$ORIGIN = "http://46.250.255.208:3000"

if ($API_TOKEN -eq "YOUR_API_TOKEN" -or $ACCOUNT_ID -eq "YOUR_ACCOUNT_ID" -or $ZONE_ID -eq "YOUR_ZONE_ID" -or $PATTERN -eq "api.yourdomain.com/*") {
  throw "Please edit deploy.ps1 first and fill in ACCOUNT_ID, ZONE_ID, API_TOKEN, PATTERN."
}

$scriptPath = Join-Path $PSScriptRoot "worker.js"
$workerCode = Get-Content -Raw -Path $scriptPath
$workerCode = $workerCode -replace "http://46\.250\.255\.208:3000", $ORIGIN

$headersJson = @{
  Authorization = "Bearer $API_TOKEN"
  "Content-Type" = "application/javascript"
} 

$uploadUrl = "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/workers/scripts/$SCRIPT_NAME"
# Workers API accepts JavaScript for script upload.
Invoke-RestMethod -Method Put -Uri $uploadUrl -Headers $headersJson -Body $workerCode

$routeUrl = "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/workers/routes"
$routeBody = @{
  pattern = $PATTERN
  script = $SCRIPT_NAME
} | ConvertTo-Json
$routeHeaders = @{
  Authorization = "Bearer $API_TOKEN"
  "Content-Type" = "application/json"
}

Invoke-RestMethod -Method Post -Uri $routeUrl -Headers $routeHeaders -Body $routeBody

Write-Output "Deploy finished: $PATTERN => $SCRIPT_NAME"
