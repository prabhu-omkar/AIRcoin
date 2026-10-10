param(
    [ValidateSet("start", "stop", "status", "restart-mqtt", "restart-validator", "restart-miner", "restart-chain")]
    [string]$Action = "start"
)

$ErrorActionPreference = "Stop"
$Repo = Split-Path -Parent $PSScriptRoot
$Runtime = Join-Path $Repo ".demo"
$Logs = Join-Path $Runtime "logs"
$StateFile = Join-Path $Runtime "pids.json"
$Contracts = Join-Path $Repo "chain-market\contracts"
$Validator = Join-Path $Repo "chain-market\validator"
$Miner = Join-Path $Repo "miner-core"
New-Item -ItemType Directory -Force $Logs | Out-Null

function Read-State {
    if (Test-Path -LiteralPath $StateFile) {
        return Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
    }
    return [pscustomobject]@{}
}

function Write-State($State) {
    $State | ConvertTo-Json | Set-Content -LiteralPath $StateFile -Encoding UTF8
}

function Port-Open([int]$Port) {
    $client = New-Object System.Net.Sockets.TcpClient
    try { $client.Connect("127.0.0.1", $Port); return $true }
    catch { return $false }
    finally { $client.Dispose() }
}

function Wait-Port([int]$Port, [bool]$Wanted = $true, [int]$Seconds = 30) {
    $limit = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $limit) {
        if ((Port-Open $Port) -eq $Wanted) { return }
        Start-Sleep -Milliseconds 300
    }
    throw "Port $Port did not become $(if ($Wanted) {'available'} else {'closed'}) within $Seconds seconds"
}

function Stop-Owned([string]$Name) {
    $state = Read-State
    $entry = $state.PSObject.Properties[$Name]
    if ($entry -and $entry.Value) {
        $process = Get-Process -Id ([int]$entry.Value) -ErrorAction SilentlyContinue
        if ($process) { Stop-Process -Id $process.Id -Force }
        $state.PSObject.Properties.Remove($Name)
        Write-State $state
    }
}

function Save-Pid([string]$Name, [int]$PidValue) {
    $state = Read-State
    if ($state.PSObject.Properties[$Name]) { $state.$Name = $PidValue }
    else { $state | Add-Member -NotePropertyName $Name -NotePropertyValue $PidValue }
    Write-State $state
}

function Start-Detached([string]$Executable, [string[]]$Arguments, [string]$WorkingDirectory) {
    # Process.Start with shell execution avoids a Windows PowerShell Start-Process bug when the
    # host environment contains both Path and PATH entries (common in agent/dev shells).
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = $Executable
    $info.Arguments = (($Arguments | ForEach-Object {
        if ($_ -match '[\s"]') { '"' + ($_ -replace '"', '\"') + '"' } else { $_ }
    }) -join ' ')
    $info.WorkingDirectory = $WorkingDirectory
    $info.UseShellExecute = $true
    $info.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
    return [System.Diagnostics.Process]::Start($info)
}

function Start-Mqtt {
    if (Port-Open 1883) { Write-Host "MQTT already available on :1883"; return }
    if (Get-Command docker -ErrorAction SilentlyContinue) {
        Push-Location $Repo
        try { & docker compose up -d mqtt; if ($LASTEXITCODE) { throw "docker compose failed" } }
        finally { Pop-Location }
    } else {
        Write-Host "Docker not found; starting the built-in MQTT demo broker"
        $python = (Get-Command python).Source
        $p = Start-Detached $python @("-m", "mock.mqtt_broker") $Miner
        Save-Pid "mqtt" $p.Id
    }
    Wait-Port 1883
}

function Start-Chain([bool]$Deploy = $true) {
    if (Port-Open 8545) { Write-Host "Blockchain already available on :8545"; return }
    $node = (Get-Command node).Source
    $hardhat = Join-Path $Contracts "node_modules\hardhat\internal\cli\cli.js"
    $p = Start-Detached $node @($hardhat, "node") $Contracts
    Save-Pid "blockchain" $p.Id
    Wait-Port 8545
    if ($Deploy) {
        Push-Location $Contracts
        try {
            & npm.cmd run deploy:local
            if ($LASTEXITCODE) { throw "contract deployment failed" }
            & npm.cmd run seed:local
            if ($LASTEXITCODE) { throw "contract seed failed" }
        } finally { Pop-Location }
    }
}

function Start-Validator {
    if (Port-Open 3001) { Write-Host "Validator already available on :3001"; return }
    Push-Location $Validator
    try { & npm.cmd run build; if ($LASTEXITCODE) { throw "validator build failed" } }
    finally { Pop-Location }
    $node = (Get-Command node).Source
    $p = Start-Detached $node @("dist/server.js") $Validator
    Save-Pid "validator" $p.Id
    Wait-Port 3001
}

function Start-Miner {
    if (Port-Open 8090) { Write-Host "Miner already available on :8090"; return }
    $python = (Get-Command python).Source
    $p = Start-Detached $python `
        @("-m", "minerd", "daemon", "--vision-source", "mock", "--gps-source", "none") $Miner
    Save-Pid "miner" $p.Id
    Wait-Port 8090
}

function Show-Status {
    $ports = [ordered]@{ mqtt = 1883; blockchain = 8545; validator = 3001; miner = 8090 }
    foreach ($item in $ports.GetEnumerator()) {
        $word = if (Port-Open $item.Value) { "GREEN" } else { "RED" }
        Write-Host ("{0,-12} {1,-5} :{2}" -f $item.Key, $word, $item.Value)
    }
    if (Port-Open 8090) {
        try {
            $health = Invoke-RestMethod -Uri "http://127.0.0.1:8090/api/health" -TimeoutSec 5
            $health.services.PSObject.Properties | ForEach-Object {
                Write-Host ("health/{0,-8} {1}" -f $_.Name, $(if ($_.Value.ok) { "GREEN" } else { "RED" }))
            }
        } catch { Write-Warning "Health API did not respond: $($_.Exception.Message)" }
    }
}

switch ($Action) {
    "start" {
        Start-Mqtt
        $chainWasDown = -not (Port-Open 8545)
        Start-Chain $chainWasDown
        Start-Validator
        Start-Miner
        Show-Status
        Write-Host "Dashboard: http://127.0.0.1:8090/  Health: http://127.0.0.1:8090/health"
    }
    "stop" {
        Stop-Owned "miner"; Stop-Owned "validator"; Stop-Owned "blockchain"; Stop-Owned "mqtt"
        if (Get-Command docker -ErrorAction SilentlyContinue) {
            Push-Location $Repo
            try { & docker compose stop mqtt }
            finally { Pop-Location }
        }
        Show-Status
    }
    "status" { Show-Status }
    "restart-mqtt" {
        Stop-Owned "mqtt"
        if (Get-Command docker -ErrorAction SilentlyContinue) {
            Push-Location $Repo
            try { & docker compose stop mqtt }
            finally { Pop-Location }
        }
        Wait-Port 1883 $false; Start-Mqtt; Show-Status
    }
    "restart-validator" { Stop-Owned "validator"; Wait-Port 3001 $false; Start-Validator; Show-Status }
    "restart-miner" { Stop-Owned "miner"; Wait-Port 8090 $false; Start-Miner; Show-Status }
    "restart-chain" {
        Stop-Owned "validator"; if (Port-Open 3001) { throw "Validator on :3001 is not owned by this demo script" }
        Stop-Owned "blockchain"; Wait-Port 8545 $false
        Start-Chain $true; Start-Validator; Show-Status
    }
}
