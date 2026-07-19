param(
    [string]$SourceConnectionString = "Host=localhost;Port=5432;Database=wiseravnshare-db;Username=wiseravenshare-user;Password=wiseravenshare_password;SSL Mode=Disable;Trust Server Certificate=true",
    [string]$TargetConnectionString = $env:DATABASE_URL,
    [string]$DumpFile = "./postgres-migration.dump"
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($TargetConnectionString)) {
    throw "Target connection string is required. Set DATABASE_URL or pass -TargetConnectionString."
}

if (-not (Get-Command pg_dump -ErrorAction SilentlyContinue)) {
    throw "pg_dump was not found in PATH. Install PostgreSQL client tools first."
}

if (-not (Get-Command pg_restore -ErrorAction SilentlyContinue)) {
    throw "pg_restore was not found in PATH. Install PostgreSQL client tools first."
}

Write-Host "Creating logical backup from source database..."
& pg_dump --format=custom --no-owner --no-privileges --dbname "$SourceConnectionString" --file "$DumpFile"

Write-Host "Restoring backup to managed target database..."
& pg_restore --clean --if-exists --no-owner --no-privileges --dbname "$TargetConnectionString" "$DumpFile"

Write-Host "Migration finished successfully."
