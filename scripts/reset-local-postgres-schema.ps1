param(
	[string]$Database = "wiseravenshare-db",
	[string]$Username = "wiseravenshare_user",
	[string]$Password = "1@Chinchin234",
	[string]$Project = "Wiseravenshare.Server/Wiseravenshare.Server.csproj"
)

$ErrorActionPreference = "Stop"

Write-Host "Checking Docker daemon availability..."
docker info *> $null
if ($LASTEXITCODE -ne 0) {
	throw "Docker daemon is unavailable (docker info failed). Start Docker Desktop and wait until it reports Engine running, then rerun this script."
}

function Invoke-CheckedCommand {
	param(
		[scriptblock]$Command,
		[string]$Step
	)

	& $Command
	if ($LASTEXITCODE -ne 0) {
		throw "$Step failed with exit code $LASTEXITCODE."
	}
}

Write-Host "Ensuring Docker DB container is running..."
Invoke-CheckedCommand -Step "docker compose up" -Command { docker compose up -d db }

Write-Host "Dropping and recreating app_data schema..."
$resetSql = "DROP SCHEMA IF EXISTS app_data CASCADE; CREATE SCHEMA app_data AUTHORIZATION $Username;"
Invoke-CheckedCommand -Step "schema reset SQL" -Command {
	docker compose exec -T db psql -U $Username -d $Database -v ON_ERROR_STOP=1 -c $resetSql
}

Write-Host "Re-applying EF Core migrations for identical schema..."
$connection = "Host=localhost;Port=5432;Database=$Database;Username=$Username;Password=$Password;SSL Mode=Disable;Trust Server Certificate=true"
Invoke-CheckedCommand -Step "EF Core migration apply" -Command {
	dotnet ef database update `
		--project $Project `
		--startup-project $Project `
		--connection "$connection"
}

Write-Host "Schema reset complete."
