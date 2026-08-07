param(
    [string]$ReleaseName,
    [string]$VersionName,
    [int]$VersionCode = 0,
    [string]$JavaHome,
    [string]$KeystorePath,
    [string]$KeystorePassword,
    [string]$KeyAlias,
    [string]$KeyPassword,
    [switch]$SkipAssets,
    [switch]$SkipSync
)

$ErrorActionPreference = "Stop"

function Invoke-Step {
    param(
        [Parameter(Mandatory = $true)][string]$Command,
        [Parameter(Mandatory = $true)][string]$Description
    )

    Write-Host "[android-release] $Description"
    & cmd /c $Command
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed ($LASTEXITCODE): $Command"
    }
}

function Resolve-JavaHome {
    param([string]$Requested)

    if ($Requested -and (Test-Path $Requested)) {
        return $Requested
    }

    $candidates = @(
        "C:\Program Files\Android\openjdk\jdk-21.0.8",
        "C:\Program Files\Android\Android Studio\jbr"
    )

    foreach ($candidate in $candidates) {
        if (Test-Path "$candidate\bin\java.exe") {
            return $candidate
        }
    }

    return $null
}

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$resolvedJavaHome = Resolve-JavaHome -Requested $JavaHome
if ($resolvedJavaHome) {
    $env:JAVA_HOME = $resolvedJavaHome
    $env:Path = "$resolvedJavaHome\bin;$env:Path"
    Write-Host "[android-release] JAVA_HOME=$resolvedJavaHome"
} else {
    Write-Host "[android-release] JAVA_HOME not overridden (using current shell/default)."
}

if ($VersionCode -le 0) {
    $VersionCode = [int](Get-Date -Format "yyMMddHH")
}

if ([string]::IsNullOrWhiteSpace($VersionName)) {
    $VersionName = "1.0.$VersionCode"
}

if ([string]::IsNullOrWhiteSpace($ReleaseName)) {
    $ReleaseName = "android-$VersionName"
}

$env:ANDROID_VERSION_CODE = "$VersionCode"
$env:ANDROID_VERSION_NAME = $VersionName
Write-Host "[android-release] ReleaseName=$ReleaseName VersionCode=$VersionCode VersionName=$VersionName"

if ($KeystorePath) {
    $env:ANDROID_KEYSTORE_PATH = $KeystorePath
}
if ($KeystorePassword) {
    $env:ANDROID_KEYSTORE_PASSWORD = $KeystorePassword
}
if ($KeyAlias) {
    $env:ANDROID_KEY_ALIAS = $KeyAlias
}
if ($KeyPassword) {
    $env:ANDROID_KEY_PASSWORD = $KeyPassword
}

if (-not $SkipAssets) {
    Invoke-Step -Command "npm run android:assets" -Description "Generating Android icons/splash assets"
}

if (-not $SkipSync) {
    Invoke-Step -Command "npm run android:sync" -Description "Building web assets and syncing Android"
}

Invoke-Step -Command "cd android && gradlew.bat bundleRelease" -Description "Building signed release AAB"

$sourceAab = Join-Path $projectRoot "android\app\build\outputs\bundle\release\app-release.aab"
if (-not (Test-Path $sourceAab)) {
    throw "Expected AAB not found: $sourceAab"
}

$releaseDir = Join-Path $projectRoot "release-artifacts"
New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null

$sanitizedVersionName = $VersionName -replace "[^A-Za-z0-9_.-]", "_"
$sanitizedReleaseName = $ReleaseName -replace "[^A-Za-z0-9_.-]", "_"
$targetAab = Join-Path $releaseDir "wiseravenshare-$sanitizedReleaseName-$sanitizedVersionName.aab"
Copy-Item -Path $sourceAab -Destination $targetAab -Force

$hash = Get-FileHash -Path $targetAab -Algorithm SHA256
$checksumFile = Join-Path $releaseDir "wiseravenshare-$sanitizedReleaseName-$sanitizedVersionName.sha256.txt"
Set-Content -Path $checksumFile -Value @(
    "release_name=$ReleaseName",
    "version_name=$VersionName",
    "version_code=$VersionCode",
    "sha256=$($hash.Hash)",
    "file=$([System.IO.Path]::GetFileName($targetAab))"
)
Write-Host "[android-release] Output: $targetAab"
Write-Host "[android-release] SHA256: $($hash.Hash)"
Write-Host "[android-release] Checksum file: $checksumFile"
