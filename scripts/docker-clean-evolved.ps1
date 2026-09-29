param(
    [string]$BasePrefix = "wiseravenshare",
    [string]$KeepPrefix,
    [switch]$IncludeBase,
    [switch]$RemoveVolumes
)

$ErrorActionPreference = "Stop"

function Get-LatestEvolvedPrefix {
    param([string]$Prefix)

    $names = @(docker ps -a --format "{{.Names}}")
    $matched = @{}

    foreach ($name in $names) {
        if ($name -match "^(?:$([regex]::Escape($Prefix)))(\\d+)-") {
            $candidate = "$Prefix$($Matches[1])"
            $matched[$candidate] = [int]$Matches[1]
        }
    }

    if ($matched.Count -eq 0) {
        return $Prefix
    }

    return ($matched.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 1).Key
}

if (-not $KeepPrefix) {
    $KeepPrefix = Get-LatestEvolvedPrefix -Prefix $BasePrefix
}

Write-Host "Keeping instance prefix: $KeepPrefix"

$allContainers = @(docker ps -a --format "{{.Names}}")
$targetPrefixes = @()

foreach ($name in $allContainers) {
    if ($name -match "^(?:$([regex]::Escape($BasePrefix)))(\\d*)-") {
        $prefix = "$BasePrefix$($Matches[1])"
        if ($prefix -ne $KeepPrefix) {
            if ($prefix -eq $BasePrefix -and -not $IncludeBase) {
                continue
            }
            $targetPrefixes += $prefix
        }
    }
}

$targetPrefixes = $targetPrefixes | Sort-Object -Unique
if (-not $targetPrefixes) {
    Write-Host "No older evolved instances found to clean."
    exit 0
}

foreach ($prefix in $targetPrefixes) {
    Write-Host "Cleaning prefix: $prefix"

    $projectDownArgs = @()
    if ($RemoveVolumes) {
        $projectDownArgs += "down"
        $projectDownArgs += "-v"
    }
    else {
        $projectDownArgs += "down"
    }

    $env:COMPOSE_PROJECT_NAME = $prefix
    & docker compose @projectDownArgs
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "docker compose down failed for $prefix. Attempting direct container removal."
    }

    $containers = docker ps -a --filter "name=^/${prefix}-" --format "{{.Names}}"
    if ($containers) {
        & docker rm -f $containers
    }
}

Remove-Item Env:COMPOSE_PROJECT_NAME -ErrorAction SilentlyContinue
Write-Host "Cleanup complete."
