param(
  [string]$Backend = 'postgres',
  [string]$NodePath = '',
  [int]$Port = 3000,
  [switch]$KillExisting
)

$ErrorActionPreference = 'Stop'

function Write-Section($text) {
  Write-Host "`n=== $text ===" -ForegroundColor Cyan
}

function Resolve-NodeBin {
  if ($NodePath) {
    if (Test-Path $NodePath) {
      if ($NodePath.ToLower().EndsWith('node.exe')) {
        return (Split-Path $NodePath -Parent)
      }
      if (Test-Path (Join-Path $NodePath 'node.exe')) {
        return $NodePath
      }
    }
  }

  $candidates = @(
    "$env:ProgramFiles\nodejs",
    "$env:ProgramFiles(x86)\nodejs"
  )

  foreach ($dir in $candidates) {
    if ($dir -and (Test-Path (Join-Path $dir 'node.exe'))) {
      return $dir
    }
  }

  $winGetRoot = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages"
  if (Test-Path $winGetRoot) {
    $nodeExe = Get-ChildItem -Path $winGetRoot -Filter node.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($nodeExe) {
      return $nodeExe.DirectoryName
    }
  }

  return $null
}

function Get-PortProcessId($port) {
  $netstat = netstat -ano | Select-String -Pattern ":$port\s" | Select-Object -First 1
  if (-not $netstat) { return $null }
  $parts = $netstat.ToString().Split(' ', [System.StringSplitOptions]::RemoveEmptyEntries)
  return $parts[-1]
}

Write-Section "Preparing environment"
$nodeDir = Resolve-NodeBin
if ($nodeDir) {
  $env:Path = "$nodeDir;$env:Path"
  Write-Host "Using Node from: $nodeDir"
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Warning "Node not found in PATH."
  Write-Warning "Try: .\start-all.ps1 -Backend postgres -NodePath 'C:\\Program Files\\nodejs'"
  Write-Warning "Or pass full path to node.exe with -NodePath."
  throw "Node.js not found. Install Node.js LTS or provide -NodePath."
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "npm not found. Install Node.js LTS first."
}

$pidOnPort = Get-PortProcessId $Port
if ($pidOnPort) {
  if ($KillExisting) {
    Write-Warning "Port $Port in use (PID $pidOnPort). Stopping process."
    Stop-Process -Id $pidOnPort -Force
  } else {
    throw "Port $Port already in use (PID $pidOnPort). Rerun with -KillExisting or choose -Port."
  }
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Warning "Docker not found. Skipping Postgres/Influx and falling back to sqlite."
  $Backend = 'sqlite'
}

Write-Section "Installing npm dependencies"
npm.cmd install

Write-Section "Starting Docker services"
$composeCmd = if (Get-Command docker-compose -ErrorAction SilentlyContinue) { 'docker-compose' } else { 'docker compose' }

$dockerReady = $false
for ($i = 0; $i -lt 10; $i++) {
  try {
    docker info | Out-Null
    $dockerReady = $true
    break
  } catch {
    Start-Sleep -Seconds 3
  }
}

if (-not $dockerReady) {
  Write-Warning "Docker Desktop not ready. Skipping Postgres/Influx startup."
} else {
  if ($composeCmd -eq 'docker-compose') {
    docker-compose up -d
  } else {
    docker compose up -d
  }
}

Write-Section "Initializing databases"
$postgresReady = $false
$influxReady = $false

if ($dockerReady) {
  try {
    npm.cmd run init:postgres
    $postgresReady = $true
  } catch {
    Write-Warning "Postgres init failed: $($_.Exception.Message)"
  }

  $envFile = Join-Path (Get-Location) ".env"
  if (Test-Path $envFile) {
    $envContent = Get-Content $envFile -ErrorAction SilentlyContinue
    $tokenLine = $envContent | Where-Object { $_ -match '^INFLUX_TOKEN=' }
    $hasToken = $false
    if ($tokenLine) {
      $value = ($tokenLine -split '=',2)[1]
      if ($value -and $value -ne 'your-token-here') { $hasToken = $true }
    }
    if ($hasToken) {
      try {
        npm.cmd run init:influx
        $influxReady = $true
      } catch {
        Write-Warning "Influx init failed: $($_.Exception.Message)"
      }
    } else {
      Write-Warning "Influx token missing in .env. Skipping Influx init."
    }
  } else {
    Write-Warning ".env not found. Skipping Influx init."
  }
}

Write-Section "Starting server"
$Backend = $Backend.ToLower()
if ($Backend -notin @('json','sqlite','postgres','influx')) {
  throw "Backend '$Backend' not supported. Use: json | sqlite | postgres | influx"
}

if ($Backend -eq 'postgres' -and -not $postgresReady) {
  Write-Warning "Postgres not ready. Falling back to sqlite."
  $Backend = 'sqlite'
}
if ($Backend -eq 'influx' -and -not $influxReady) {
  Write-Warning "Influx not ready. Falling back to sqlite."
  $Backend = 'sqlite'
}

$env:PORT = $Port
npm.cmd run "start:$Backend"
