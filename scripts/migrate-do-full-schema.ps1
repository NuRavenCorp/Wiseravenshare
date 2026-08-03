param(
    [string]$TargetConnectionString = $env:DATABASE_URL,
    [string]$Project = "Wiseravenshare.Server/Wiseravenshare.Server.csproj"
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($TargetConnectionString)) {
    throw "Target connection string is required. Set DATABASE_URL in your shell before running this script."
}

Write-Host "Applying EF Core migrations to target database..."

dotnet ef database update `
    --project $Project `
    --startup-project $Project `
    --connection "$TargetConnectionString"

Write-Host "Migration apply complete."
Write-Host "Next verification step: call /health/db on the deployed API and confirm schema flags are true."
