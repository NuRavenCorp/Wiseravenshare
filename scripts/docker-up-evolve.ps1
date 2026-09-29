param(
    [switch]$WithAi,
    [switch]$WithStorage,
    [switch]$WithStripe,
    [switch]$WithCache = $true,
    [switch]$WithLocalDb = $true,
    [switch]$Build = $true,
    [switch]$SkipHealthCheck
)

$ErrorActionPreference = "Stop"

function Test-PortAvailable {
    param([int]$Port)

    $dockerPortInUse = docker ps --format "{{.Ports}}" |
        Select-String -Pattern ":$Port->" -Quiet
    if ($dockerPortInUse) {
        return $false
    }

    $tcpInUse = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    if ($tcpInUse) {
        return $false
    }

    $udpInUse = Get-NetUDPEndpoint -LocalPort $Port -ErrorAction SilentlyContinue
    if ($udpInUse) {
        return $false
    }

    return $true
}

function Get-AvailablePort {
    param(
        [int]$StartPort,
        [int]$MaxTries = 100
    )

    $candidate = $StartPort
    for ($i = 0; $i -lt $MaxTries; $i++) {
        if (Test-PortAvailable -Port $candidate) {
            return $candidate
        }
        $candidate++
    }

    throw "No available port found after $MaxTries tries starting at $StartPort"
}

function Get-NextContainerPrefix {
    param([string]$BasePrefix)

    $allNames = docker ps -a --format "{{.Names}}"
    if (-not $allNames) {
        return $BasePrefix
    }

    $suffix = 0
    while ($true) {
        $candidate = if ($suffix -eq 0) { $BasePrefix } else { "$BasePrefix$suffix" }
        $pattern = "^$([regex]::Escape($candidate))-"
        $inUse = $allNames | Where-Object { $_ -match $pattern }
        if (-not $inUse) {
            return $candidate
        }
        $suffix++
    }
}

function Start-ComposeWithStorageFallback {
    param(
        [string[]]$ComposeArgs,
        [bool]$StorageEnabled,
        [bool]$BuildEnabled
    )

    $composeOutput = (& docker compose @ComposeArgs 2>&1 | Tee-Object -Variable outputLines)
    $exitCode = $LASTEXITCODE

    if ($exitCode -eq 0) {
        return
    }

    $combinedOutput = ($composeOutput | Out-String)
    $storagePullIssue = $StorageEnabled -and ($combinedOutput -match "minio/mc" -or $combinedOutput -match "pull access denied")
    if (-not $storagePullIssue) {
        throw "docker compose up failed with exit code $exitCode"
    }

    Write-Warning "Detected MinIO init image pull issue. Retrying without minio-init service."

    $retryArgs = @()
    if ($BuildEnabled) {
        $retryArgs += "build"
        $retryArgs += "audio-processor"
        $retryArgs += "karaoke-engine"
        $retryArgs += "api"
        & docker compose @retryArgs
        if ($LASTEXITCODE -ne 0) {
            throw "docker compose build failed during storage fallback"
        }
    }

    $upArgs = @("up", "-d", "postgres", "redis", "minio", "audio-processor", "karaoke-engine", "api")
    & docker compose @upArgs
    if ($LASTEXITCODE -ne 0) {
        throw "docker compose up fallback failed after minio-init pull issue"
    }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot

try {
    $basePrefix = "wiseravenshare"
    $containerPrefix = Get-NextContainerPrefix -BasePrefix $basePrefix

    $apiPort = Get-AvailablePort -StartPort 10000
    $redisPort = if ($WithCache) { Get-AvailablePort -StartPort 6379 } else { $null }
    $minioApiPort = if ($WithStorage) { Get-AvailablePort -StartPort 9000 } else { $null }
    $minioConsolePort = if ($WithStorage) { Get-AvailablePort -StartPort 9001 } else { $null }

    $env:WS_CONTAINER_PREFIX = $containerPrefix
    $env:COMPOSE_PROJECT_NAME = $containerPrefix
    $env:API_PORT = "$apiPort"

    if (-not $env:JWT_highentropykey -and -not $env:Authentication__Jwt__Key) {
        $env:JWT_highentropykey = "wiseravenshare-local-dev-key-change-in-production"
    }

    if ($WithCache -and $redisPort) {
        $env:REDIS_PORT = "$redisPort"
    }

    if ($WithStorage -and $minioApiPort -and $minioConsolePort) {
        $env:MINIO_API_PORT = "$minioApiPort"
        $env:MINIO_CONSOLE_PORT = "$minioConsolePort"
    }

    $composeArgs = @()
    if ($WithLocalDb) {
        $composeArgs += "--profile"
        $composeArgs += "local-db"
    }
    if ($WithAi) {
        $composeArgs += "--profile"
        $composeArgs += "with-ai"
    }
    if ($WithCache) {
        $composeArgs += "--profile"
        $composeArgs += "with-cache"
    }
    if ($WithStorage) {
        $composeArgs += "--profile"
        $composeArgs += "with-storage"
    }
    if ($WithStripe) {
        $composeArgs += "--profile"
        $composeArgs += "with-stripe"
    }

    $composeArgs += "up"
    $composeArgs += "-d"
    if ($Build) {
        $composeArgs += "--build"
    }

    Write-Host "Launching instance: $containerPrefix"
    Write-Host "API port: $apiPort"
    if ($WithCache) { Write-Host "Redis host port: $redisPort" }
    if ($WithStorage) {
        Write-Host "MinIO API host port: $minioApiPort"
        Write-Host "MinIO Console host port: $minioConsolePort"
    }

    Start-ComposeWithStorageFallback -ComposeArgs $composeArgs -StorageEnabled $WithStorage.IsPresent -BuildEnabled $Build.IsPresent

    if (-not $SkipHealthCheck) {
        Write-Host "Running post-start health checks..."

        $audioName = "$containerPrefix-audio-processor"
        $karaokeName = "$containerPrefix-karaoke-engine"
        $apiName = "$containerPrefix-api"

        & docker ps --filter "name=^/${containerPrefix}-" --format "table {{.Names}}`t{{.Status}}`t{{.Ports}}"

        & docker exec $audioName python -c "import fastapi,uvicorn,numpy,scipy,noisereduce,pyloudnorm,soundfile; print('audio-processor deps OK')"
        & docker exec $karaokeName python -c "import fastapi,uvicorn,numpy,soundfile,demucs_onnx; print('karaoke-engine deps OK')"

        try {
            $healthUrl = "http://localhost:$apiPort/health"
            $healthy = $false
            for ($attempt = 1; $attempt -le 10; $attempt++) {
                try {
                    $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 10
                    if ($response.StatusCode -eq 200) {
                        Write-Host "API health endpoint returned HTTP $($response.StatusCode) at $healthUrl"
                        $healthy = $true
                        break
                    }
                }
                catch {
                    # Retry without delay; each request has its own timeout.
                }
            }

            if (-not $healthy) {
                Write-Warning "API health endpoint did not return HTTP 200 within readiness window: $healthUrl"
            }
        }
        catch {
            Write-Warning "API health endpoint check failed: $($_.Exception.Message)"
        }

        Write-Host "Instance ready: $containerPrefix"
    }
}
finally {
    Remove-Item Env:WS_CONTAINER_PREFIX -ErrorAction SilentlyContinue
    Remove-Item Env:COMPOSE_PROJECT_NAME -ErrorAction SilentlyContinue
    Remove-Item Env:API_PORT -ErrorAction SilentlyContinue
    Remove-Item Env:REDIS_PORT -ErrorAction SilentlyContinue
    Remove-Item Env:MINIO_API_PORT -ErrorAction SilentlyContinue
    Remove-Item Env:MINIO_CONSOLE_PORT -ErrorAction SilentlyContinue
    Remove-Item Env:JWT_highentropykey -ErrorAction SilentlyContinue
    Pop-Location
}
