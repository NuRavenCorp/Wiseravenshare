param(
    [string]$AppId = "f63e23f6-3709-403f-bac4-9cdfafee211b",
    [string]$Registry = "wiseravenshare",
    [string]$Repository = "wiseravenshare-web",
    [string]$ApiDockerfile = "Wiseravenshare.Server/Dockerfile",
    [string]$WebDockerfile = "wiseravenshare.client/Dockerfile",
    [string]$HealthUrl = "https://wise-ravens.com/health",
    [switch]$SkipHealthCheck
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Assert-Command {
    param([string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command not found: $Name"
    }
}

function Invoke-Checked {
    param([string]$Command)
    Write-Host "==> $Command"
    Invoke-Expression $Command
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code ${LASTEXITCODE}: $Command"
    }
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$specPath = $null
Push-Location $repoRoot

try {
    Assert-Command -Name "doctl"
    Assert-Command -Name "docker"

    Invoke-Checked -Command "doctl auth list"

    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $webTag = "direct-$timestamp"
    $apiTag = "api-direct-$timestamp"

    $webImage = "registry.digitalocean.com/$Registry/${Repository}:$webTag"
    $apiImage = "registry.digitalocean.com/$Registry/${Repository}:$apiTag"

    Write-Host "Deploy tags:" -ForegroundColor Cyan
    Write-Host "  web: $webTag"
    Write-Host "  api: $apiTag"

    try {
        Invoke-Checked -Command "doctl registry get"
    }
    catch {
        Write-Host "Registry '$Registry' not found. Creating in nyc3 starter tier..." -ForegroundColor Yellow
        Invoke-Checked -Command "doctl registry create $Registry --region nyc3 --subscription-tier starter"
    }

    Invoke-Checked -Command "doctl registry login"

    Invoke-Checked -Command "docker build -f $WebDockerfile -t $webImage ."
    Invoke-Checked -Command "docker build -f $ApiDockerfile -t $apiImage ."

    Invoke-Checked -Command "docker push $webImage"
    Invoke-Checked -Command "docker push $apiImage"

    $specPath = Join-Path $env:TEMP ("do-app-spec-" + [Guid]::NewGuid().ToString("N") + ".yaml")
    Invoke-Checked -Command "doctl apps spec get $AppId > `"$specPath`""

    $specRaw = Get-Content -Path $specPath -Raw

    if ($specRaw -notmatch "tag:\s*api-direct-") {
        throw "App spec does not appear to be in image-based direct mode for API."
    }

    if ($specRaw -notmatch "tag:\s*direct-") {
        throw "App spec does not appear to be in image-based direct mode for web."
    }

    $specRaw = [regex]::Replace($specRaw, "(?m)^(\s*tag:\s*)api-direct-[^\r\n]+$", "`$1$apiTag", 1)
    $specRaw = [regex]::Replace($specRaw, "(?m)^(\s*tag:\s*)direct-[^\r\n]+$", "`$1$webTag", 1)

    Set-Content -Path $specPath -Value $specRaw -NoNewline

    Invoke-Checked -Command "doctl apps update $AppId --spec `"$specPath`" --wait"

    if (-not $SkipHealthCheck) {
        Write-Host "Checking health: $HealthUrl" -ForegroundColor Cyan
        $response = Invoke-WebRequest -UseBasicParsing -Uri $HealthUrl -TimeoutSec 30
        Write-Host "Health response ($($response.StatusCode)): $($response.Content)"
    }

    Write-Host "Direct deployment complete." -ForegroundColor Green
    Write-Host "App ID: $AppId"
    Write-Host "Web image: $webImage"
    Write-Host "API image: $apiImage"
}
finally {
    if ($specPath -and (Test-Path $specPath)) {
        Remove-Item -Path $specPath -Force
    }
    Pop-Location
}
