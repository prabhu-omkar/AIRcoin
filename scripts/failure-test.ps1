param([int]$ValidatorOutageSeconds = 120)

$ErrorActionPreference = "Stop"
$Demo = Join-Path $PSScriptRoot "demo.ps1"

function Health([string]$Service, [bool]$Expected, [int]$TimeoutSeconds = 30) {
    $limit = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        try {
            $h = Invoke-RestMethod "http://127.0.0.1:8090/api/health" -TimeoutSec 10
            $serviceHealth = $h.services.PSObject.Properties[$Service].Value
            if ([bool]$serviceHealth.ok -eq $Expected) { return $h }
        } catch {}
        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $limit)
    throw "$Service did not become $(if ($Expected) {'GREEN'} else {'RED'})"
}

& $Demo start
Health "validator" $true | Out-Null
$before = (Invoke-RestMethod "http://127.0.0.1:8090/api/health").services.validator.queued_attestations

Write-Host "TEST validator outage ($ValidatorOutageSeconds seconds)"
$state = Get-Content (Join-Path (Split-Path -Parent $PSScriptRoot) ".demo\pids.json") -Raw | ConvertFrom-Json
if (-not $state.validator) { throw "Validator is not owned by demo.ps1; stop the manual validator first" }
Stop-Process -Id ([int]$state.validator) -Force
Health "validator" $false | Out-Null
Start-Sleep -Seconds $ValidatorOutageSeconds
& $Demo restart-validator
Health "validator" $true | Out-Null
$after = (Invoke-RestMethod "http://127.0.0.1:8090/api/health").services.validator.queued_attestations
Write-Host "PASS validator recovered (queue before=$before, after=$after)"

Write-Host "TEST MQTT outage and persistent epoch replay"
$state = Get-Content (Join-Path (Split-Path -Parent $PSScriptRoot) ".demo\pids.json") -Raw | ConvertFrom-Json
if ($state.mqtt) { Stop-Process -Id ([int]$state.mqtt) -Force }
elseif (Get-Command docker -ErrorAction SilentlyContinue) {
    Push-Location (Split-Path -Parent $PSScriptRoot)
    try { & docker compose stop mqtt }
    finally { Pop-Location }
} else { throw "MQTT is not owned by the demo script" }
Health "mqtt" $false | Out-Null
& $Demo restart-mqtt
Health "mqtt" $true | Out-Null
Push-Location (Join-Path (Split-Path -Parent $PSScriptRoot) "miner-core")
try { & python -m mock.check_retained_epoch; if ($LASTEXITCODE) { throw "C2 replay check failed" } }
finally { Pop-Location }
Write-Host "PASS MQTT recovered; miner reconnect callback replayed persisted epochs"

Write-Host "TEST miner restart"
& $Demo restart-miner
Health "miner" $true | Out-Null
Write-Host "PASS miner recovered with its SQLite queue"

Write-Host "TEST blockchain restart, redeploy and validator reconnect"
& $Demo restart-chain
Health "blockchain" $true 60 | Out-Null
Health "validator" $true 60 | Out-Null
Write-Host "PASS blockchain recovered and contracts were redeployed/seeded"

Write-Host "ALL DELIBERATE FAILURE TESTS PASSED"
