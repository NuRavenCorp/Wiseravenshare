param(
    [string]$Namespace = "wiseravenshare-fns",
    [string]$WslDistro = "",
    [switch]$SkipInvoke
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

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir

$drive = $repoRoot.Substring(0, 1).ToLower()
$rest = ($repoRoot.Substring(2) -replace "\\", "/").TrimStart("/")
$linuxRepoRoot = "/mnt/$drive/$rest"

Write-Host "Using repo root in WSL: $linuxRepoRoot" -ForegroundColor Cyan

Invoke-Wsl "command -v doctl >/dev/null || (echo 'doctl not found in WSL' && exit 1)"
Invoke-Wsl "doctl auth list"
Invoke-Wsl "doctl account get >/dev/null"

# Install serverless plugin in WSL (safe if already installed).
Invoke-Wsl "doctl serverless install"
Invoke-Wsl "doctl serverless connect $Namespace"
Invoke-Wsl "doctl serverless status"

Invoke-Wsl "cd '$linuxRepoRoot/functions/do/qrcode' && doctl serverless deploy ."
Invoke-Wsl "cd '$linuxRepoRoot/functions/do/sendgrid-email' && doctl serverless deploy . --remote-build"
Invoke-Wsl "cd '$linuxRepoRoot/functions/do/twilio-sms' && doctl serverless deploy . --remote-build"

if (-not $SkipInvoke) {
    Invoke-Wsl "doctl serverless functions invoke qr/qr -p text:'wise-ravens podcast join'"
    Invoke-Wsl "doctl serverless functions invoke sample/emails -p from:'sender@example.com' to:'receiver@example.com' subject:'Wiseravenshare Invite' content:'Join our podcast session'"
    Invoke-Wsl "doctl serverless functions invoke sample/sms -p from:'+15555550100' number:'+15555550101' message:'Join our Wiseravenshare podcast'"
}

Write-Host "DigitalOcean function deploy complete via WSL." -ForegroundColor Green
