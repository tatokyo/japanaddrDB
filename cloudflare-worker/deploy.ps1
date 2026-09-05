param(
  [string]$AccountId = "27d88de2194bdf53430bfc420bb7ac8c",
  [string]$ZoneId = "f8a52cfc807073215188e6c62c850922",
  [string]$ApiToken = $env:CLOUDFLARE_API_TOKEN,
  [string]$ScriptName = "japanaddrdb",
  [string]$Domain = "japan-addr-db.temazero.ai",
  [string]$Origin = "http://japanaddrdb-origin.temazero.ai:3000",
  [string]$OriginIp = "46.250.255.208"
)

$ErrorActionPreference = "Stop"
if ([string]::IsNullOrWhiteSpace($ApiToken)) {
  throw "Set CLOUDFLARE_API_TOKEN in the process environment. Do not put tokens in this file."
}
$originUri = [uri]$Origin
$parsedIp = $null
if ($originUri.Scheme -notin @('http', 'https') -or [System.Net.IPAddress]::TryParse($originUri.Host, [ref]$parsedIp) -or $originUri.Host -eq $Domain) {
  throw "Origin must be an HTTP(S) hostname distinct from the Worker domain, not a bare IP."
}

function Invoke-CfApi {
  param([string]$Method, [string]$Path, $Body, [string]$ContentType = "application/json")
  $params = @{
    Method = $Method
    Uri = "https://api.cloudflare.com/client/v4$Path"
    Headers = @{ Authorization = "Bearer $ApiToken" }
    ErrorAction = "Stop"
  }
  if ($null -ne $Body) {
    $params.ContentType = $ContentType
    $params.Body = [System.Text.Encoding]::UTF8.GetBytes([string]$Body)
  }
  $response = Invoke-RestMethod @params
  if (-not $response.success) { throw ($response.errors | ConvertTo-Json -Compress) }
  return $response.result
}

# Preflight: preserve records or domains already owned by other services.
$originRecords = @(Invoke-CfApi GET "/zones/$ZoneId/dns_records?name=$($originUri.Host)")
if ($originRecords.Count -gt 0 -and ($originRecords.Count -ne 1 -or $originRecords[0].type -ne 'A' -or $originRecords[0].content -ne $OriginIp -or $originRecords[0].proxied)) {
  throw "Origin DNS already has different settings; inspect it before changing it."
}
$domains = @(Invoke-CfApi GET "/accounts/$AccountId/workers/domains?hostname=$Domain")
if (@($domains | Where-Object { $_.service -ne $ScriptName }).Count -gt 0) {
  throw "Custom domain is attached to another Worker."
}
$domainRecords = @(Invoke-CfApi GET "/zones/$ZoneId/dns_records?name=$Domain")
if ($domains.Count -eq 0 -and $domainRecords.Count -gt 0) {
  throw "The requested custom domain already has DNS records; inspect before attaching."
}
$routes = @(Invoke-CfApi GET "/zones/$ZoneId/workers/routes")
if (@($routes | Where-Object { $_.pattern -eq "$Domain/*" -and $_.script -ne $ScriptName }).Count -gt 0) {
  throw "The requested domain has a route to another Worker."
}

if ($originRecords.Count -eq 0) {
  $dnsBody = @{ type = 'A'; name = $originUri.Host; content = $OriginIp; ttl = 300; proxied = $false } | ConvertTo-Json
  $null = Invoke-CfApi POST "/zones/$ZoneId/dns_records" $dnsBody
}

$workerCode = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot "worker.js")
$originLiteral = ConvertTo-Json -InputObject $Origin -Compress
$workerCode = $workerCode.Replace('"http://japanaddrdb-origin.temazero.ai:3000"', $originLiteral)
$metadata = @{ body_part = 'script'; compatibility_date = '2026-09-05'; keep_bindings = @('plain_text', 'secret_text') } | ConvertTo-Json -Compress
$boundary = 'cf-' + [guid]::NewGuid().ToString('N')
$body = @(
  "--$boundary", 'Content-Disposition: form-data; name="metadata"', 'Content-Type: application/json', '', $metadata,
  "--$boundary", 'Content-Disposition: form-data; name="script"; filename="worker.js"', 'Content-Type: application/javascript', '', $workerCode,
  "--$boundary--", ''
) -join "`r`n"
$null = Invoke-CfApi PUT "/accounts/$AccountId/workers/scripts/$ScriptName" $body "multipart/form-data; boundary=$boundary"
$domainBody = @{ hostname = $Domain; service = $ScriptName; zone_id = $ZoneId; environment = 'production' } | ConvertTo-Json
$null = Invoke-CfApi PUT "/accounts/$AccountId/workers/domains" $domainBody
$null = Invoke-CfApi POST "/accounts/$AccountId/workers/scripts/$ScriptName/subdomain" '{"enabled":true,"previews_enabled":false}'

# A Custom Domain replaces the previous route for this Worker only.
foreach ($route in $routes | Where-Object { $_.pattern -eq "$Domain/*" -and $_.script -eq $ScriptName }) {
  $null = Invoke-CfApi DELETE "/zones/$ZoneId/workers/routes/$($route.id)"
}

Write-Output "Worker deployed: https://$Domain/health/live"
Write-Output "Verify /health and /validate separately; deployment does not start the server or import address data."
