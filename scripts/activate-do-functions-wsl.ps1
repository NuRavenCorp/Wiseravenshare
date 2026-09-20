param(
    [string]$Namespace = "wiseravenshare-fns",
    [string]$WslDistro = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Invoke-Wsl {
    param([string]$Command)

    $distroArgs = @()
    if ($WslDistro.Trim().Length -gt 0) {
        $distroArgs = @("-d", $WslDistro)
    }

    $allArgs = @()
    $allArgs += $distroArgs
    $allArgs += @("bash", "-lc", $Command)

    & wsl @allArgs
    if ($LASTEXITCODE -ne 0) {
        throw "WSL command failed with exit code ${LASTEXITCODE}: $Command"
    }
}

Invoke-Wsl "command -v doctl >/dev/null || (echo 'doctl not found in WSL' && exit 1)"

try {
    Invoke-Wsl "doctl account get >/dev/null"
}
catch {
    Write-Host "WSL doctl is not authenticated." -ForegroundColor Yellow
    Write-Host "Run this manually in a terminal and paste your token directly into the prompt:" -ForegroundColor Yellow
    Write-Host "wsl bash -lc 'doctl auth init'" -ForegroundColor Cyan
    throw
}

Invoke-Wsl "doctl serverless install"
Invoke-Wsl "doctl serverless connect $Namespace"
Invoke-Wsl "doctl serverless status"

Write-Host "DigitalOcean serverless is active in WSL." -ForegroundColor Green
