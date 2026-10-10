# One command for the whole AIRcoin loop on one machine:
#   miner-core + chain-market backend (scripts\demo.cmd, with the miner reading our C1)
#   chain-market C4 indexer (:3002)
#   vision pipeline (C1 + camera streams on :8080)
#   judges' twin (:5173) and owner dashboard (:5174) on live data
#
#   powershell -File vision-twin\scripts\full-stack.ps1                 # synthetic NoIR camera
#   powershell -File vision-twin\scripts\full-stack.ps1 -Camera picam   # Pi camera (or usb:0 -Liveness rgb)
#   powershell -File vision-twin\scripts\full-stack.ps1 -Stop
param([string]$Camera = "synthetic", [string]$Liveness = "", [switch]$Stop)
$ErrorActionPreference = "Stop"
$root = (Resolve-Path "$PSScriptRoot\..\..").Path
$vt = Join-Path $root "vision-twin"
$state = Join-Path $vt ".run"
New-Item -ItemType Directory -Force $state | Out-Null
$pidFile = Join-Path $state "pids.txt"

function Stop-Ours {
  if (Test-Path $pidFile) {
    Get-Content $pidFile | ForEach-Object { & taskkill /F /T /PID $_ 2>$null | Out-Null }
    Remove-Item $pidFile
  }
}
function Start-Logged([string]$Name, [string]$Cmd, [string]$Dir) {
  $log = Join-Path $state "$Name.log"
  $p = Start-Process cmd.exe -ArgumentList "/c $Cmd > `"$log`" 2>&1" -WorkingDirectory $Dir -WindowStyle Hidden -PassThru
  Add-Content $pidFile $p.Id
  Write-Host ("  {0,-10} pid {1,-6} log {2}" -f $Name, $p.Id, $log)
}

if ($Stop) {
  Stop-Ours
  & (Join-Path $root "scripts\demo.cmd") stop
  exit 0
}
Stop-Ours

$mqttUp = (Test-NetConnection localhost -Port 1883 -WarningAction SilentlyContinue).TcpTestSucceeded
$dockerUp = $false
if (Get-Command docker -ErrorAction SilentlyContinue) { cmd /c "docker info >nul 2>&1"; $dockerUp = ($LASTEXITCODE -eq 0) }
if (-not $mqttUp -and -not $dockerUp) {
  # demo.cmd would try Docker because the command exists; use miner-core's broker instead (the hub relays C2)
  Write-Host "0/4 Docker isn't running: starting miner-core's demo MQTT broker"
  Start-Logged "mqtt" "python -m mock.mqtt_broker" (Join-Path $root "miner-core")
  Start-Sleep 2
}

Write-Host "1/4 backend: MQTT, chain, validator, miner (VISION_SOURCE=mqtt)"
$env:VISION_SOURCE = "mqtt"
& (Join-Path $root "scripts\demo.cmd") start
if ($LASTEXITCODE) { throw "scripts\demo.cmd start failed" }

# demo.cmd skips deployment when it finds a chain already running; make sure the contracts exist
$reg = (Get-Content (Join-Path $root "chain-market\contracts\deployments.json") | ConvertFrom-Json).MinerRegistry
$body = '{"jsonrpc":"2.0","id":1,"method":"eth_getCode","params":["' + $reg + '","latest"]}'
$code = (Invoke-RestMethod http://127.0.0.1:8545 -Method Post -ContentType "application/json" -Body $body).result
if ($code -eq "0x") {
  Write-Host "    contracts missing on the running chain: redeploying"
  & (Join-Path $root "scripts\demo.cmd") restart-chain
}

Write-Host "2/4 C4 indexer"
Start-Logged "indexer" "npm.cmd start" (Join-Path $root "chain-market\indexer")

Write-Host "3/4 vision pipeline"
$pipe = Join-Path $vt "pipeline"
Push-Location $pipe
$src = $Camera
$extra = ""
if ($Camera -eq "synthetic") {
  $frames = Join-Path $vt "data\demo-frames"
  if (-not (Test-Path $frames)) { & python -m aircoin_vision.synth $frames --noir --frames 24 2>&1 | Out-Null }
  $src = $frames
  $extra = "--loop"
}
$enrolled = Join-Path $vt "data\enrolment\miner-001\enrolment.json"
if (-not (Test-Path $enrolled)) {
  & python -m aircoin_vision.enrol $src --backend leafhist --frames 5
}
Pop-Location
$live = if ($Liveness) { "--liveness $Liveness" } else { "" }
Start-Logged "vision" "python -m aircoin_vision.run $src $extra $live --serve 8080" $pipe

Write-Host "4/4 twin + dashboard (live)"
Start-Logged "web" "npm.cmd run dev:live" (Join-Path $vt "twin")

Write-Host ""
Write-Host "Judges' twin      http://localhost:5173/"
Write-Host "Owner dashboard   http://localhost:5174/"
Write-Host "Miner controller  http://localhost:8090/   (scenarios, health)"
Write-Host "Camera streams    http://localhost:8080/   (/raw, /ndvi, /c1.json)"
Write-Host "Stop everything:  powershell -File vision-twin\scripts\full-stack.ps1 -Stop"
