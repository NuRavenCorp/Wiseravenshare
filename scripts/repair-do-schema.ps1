param(
    [string]$TargetConnectionString = $env:DATABASE_URL,
    [string]$ExpectedDatabaseName = "wiseravenshare-db",
    [string]$Project = "Wiseravenshare.Server/Wiseravenshare.Server.csproj",
    [string]$BucketName = "bucket-wrs-01010",
    [string]$ProjectFolder = "wiseravenshare/"
)

$ErrorActionPreference = "Stop"

function Normalize-FolderPath {
    param([string]$Value)

    $normalized = ($Value ?? "").Trim()
    if ([string]::IsNullOrWhiteSpace($normalized)) {
        return "wiseravenshare/"
    }

    $normalized = $normalized.Replace("\\", "/").Trim("/")
    return "$normalized/"
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

function Get-ExistingTables {
    param([string]$ConnectionString)

    $sql = @"
SELECT table_schema || '.' || table_name
FROM information_schema.tables
WHERE table_type = 'BASE TABLE'
  AND table_schema IN ('app_data', 'public')
ORDER BY table_schema, table_name;
"@

    $raw = & psql --dbname "$ConnectionString" -v ON_ERROR_STOP=1 -At -c $sql
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to query table inventory."
    }

    $set = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    foreach ($line in $raw) {
        if (-not [string]::IsNullOrWhiteSpace($line)) {
            [void]$set.Add($line.Trim())
        }
    }

    return $set
}

function Get-MissingTables {
    param(
        [System.Collections.Generic.HashSet[string]]$Actual,
        [string[]]$ExpectedShortNames
    )

    $missing = [System.Collections.Generic.List[string]]::new()

    foreach ($name in $ExpectedShortNames) {
        $existsInAppData = $Actual.Contains("app_data.$name")
        $existsInPublic = $Actual.Contains("public.$name")
        if (-not $existsInAppData -and -not $existsInPublic) {
            $missing.Add($name)
        }
    }

    return $missing
}

if ([string]::IsNullOrWhiteSpace($TargetConnectionString)) {
    throw "Target connection string is required. Set DATABASE_URL or pass -TargetConnectionString."
}

if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
    throw "psql was not found in PATH. Install PostgreSQL client tools first."
}

$ProjectFolder = Normalize-FolderPath -Value $ProjectFolder

$expectedTables = @(
    "__EFMigrationsHistory",
    "Agents",
    "AgentEvolutions",
    "AgentInteractions",
    "Users",
    "Posts",
    "PostBookmarks",
    "PostLikes",
    "PostReposts",
    "UserFollows",
    "UserSettings",
    "UserSubscriptions",
    "TruthClaims",
    "TruthDisputes",
    "TruthVerificationVotes",
    "Videos",
    "VideoLike",
    "VideoComment",
    "Conversation",
    "ConversationParticipant",
    "Message",
    "Comment",
    "CommentLike",
    "app_users",
    "ravensight_videos",
    "ravensight_video_comments",
    "bucket_objects"
)

Write-Host "Inspecting database identity..."
$currentDb = (& psql --dbname "$TargetConnectionString" -v ON_ERROR_STOP=1 -At -c "SELECT current_database();") | Select-Object -First 1
if ($LASTEXITCODE -ne 0) {
    throw "Failed to query current_database()."
}

Write-Host "Connected database: $currentDb"
if (-not [string]::IsNullOrWhiteSpace($ExpectedDatabaseName) -and -not $currentDb.Equals($ExpectedDatabaseName, [System.StringComparison]::OrdinalIgnoreCase)) {
    Write-Warning "Expected database '$ExpectedDatabaseName' but current connection targets '$currentDb'."
}

Write-Host "Collecting pre-repair table inventory..."
$beforeTables = Get-ExistingTables -ConnectionString $TargetConnectionString
$missingBefore = Get-MissingTables -Actual $beforeTables -ExpectedShortNames $expectedTables

Write-Host "Running EF migration update against target..."
Invoke-CheckedCommand -Step "EF Core migration apply" -Command {
    dotnet ef database update `
        --project $Project `
        --startup-project $Project `
        --connection "$TargetConnectionString"
}

$bucketEscaped = $BucketName.Replace("'", "''")
$folderEscaped = $ProjectFolder.Replace("'", "''")

$runtimeSql = @"
CREATE SCHEMA IF NOT EXISTS app_data;

DO $$
DECLARE
    current_role TEXT := current_user;
BEGIN
    EXECUTE format('GRANT USAGE, CREATE ON SCHEMA app_data TO %I', current_role);
    EXECUTE format('GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA app_data TO %I', current_role);
    EXECUTE format('GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA app_data TO %I', current_role);
    EXECUTE format('GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA app_data TO %I', current_role);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA app_data GRANT ALL ON TABLES TO %I', current_role);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA app_data GRANT ALL ON SEQUENCES TO %I', current_role);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA app_data GRANT ALL ON FUNCTIONS TO %I', current_role);
END $$;

CREATE TABLE IF NOT EXISTS app_data.app_users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    handle TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    bio TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    website TEXT NOT NULL DEFAULT '',
    avatar TEXT NOT NULL DEFAULT '',
    social_feeds JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at_utc TIMESTAMPTZ NOT NULL,
    updated_at_utc TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_app_users_handle
    ON app_data.app_users(handle);

CREATE TABLE IF NOT EXISTS app_data.ravensight_videos (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    video_url TEXT NOT NULL,
    thumbnail_url TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'published',
    privacy_status TEXT NOT NULL DEFAULT 'unlisted',
    youtube_url TEXT NULL,
    tiktok_url TEXT NULL,
    facebook_url TEXT NULL,
    views INTEGER NOT NULL DEFAULT 0,
    likes INTEGER NOT NULL DEFAULT 0,
    comments INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ravensight_videos_user_id_created_at
    ON app_data.ravensight_videos (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ravensight_videos_created_at
    ON app_data.ravensight_videos (created_at DESC);

CREATE TABLE IF NOT EXISTS app_data.ravensight_video_comments (
    id TEXT PRIMARY KEY,
    video_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    comment TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT fk_ravensight_video_comments_video
        FOREIGN KEY (video_id) REFERENCES app_data.ravensight_videos (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ravensight_video_comments_video_id_created_at
    ON app_data.ravensight_video_comments (video_id, created_at DESC);

CREATE TABLE IF NOT EXISTS app_data.bucket_objects (
    id TEXT PRIMARY KEY,
    owner_user_id UUID NULL,
    provider TEXT NOT NULL DEFAULT 'digitalocean_spaces',
    bucket_name TEXT NOT NULL DEFAULT '$bucketEscaped',
    region TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    folder_path TEXT NOT NULL DEFAULT '$folderEscaped',
    object_key TEXT NOT NULL,
    original_file_name TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
    etag TEXT NULL,
    acl TEXT NOT NULL DEFAULT 'private',
    cdn_base_url TEXT NULL,
    public_url TEXT NULL,
    upload_status TEXT NOT NULL DEFAULT 'uploaded',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ NULL,
    CONSTRAINT fk_bucket_objects_owner
        FOREIGN KEY (owner_user_id) REFERENCES app_data."Users" ("Id") ON DELETE SET NULL,
    CONSTRAINT uq_bucket_objects_bucket_key UNIQUE (bucket_name, object_key)
);

ALTER TABLE app_data.bucket_objects
    ALTER COLUMN bucket_name SET DEFAULT '$bucketEscaped',
    ALTER COLUMN folder_path SET DEFAULT '$folderEscaped';

CREATE INDEX IF NOT EXISTS idx_bucket_objects_owner_created
    ON app_data.bucket_objects (owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bucket_objects_folder_created
    ON app_data.bucket_objects (folder_path, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bucket_objects_status_created
    ON app_data.bucket_objects (upload_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bucket_objects_metadata_gin
    ON app_data.bucket_objects USING GIN (metadata);

CREATE OR REPLACE FUNCTION app_data.set_updated_at_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bucket_objects_updated_at ON app_data.bucket_objects;
CREATE TRIGGER trg_bucket_objects_updated_at
BEFORE UPDATE ON app_data.bucket_objects
FOR EACH ROW EXECUTE FUNCTION app_data.set_updated_at_timestamp();
"@

Write-Host "Applying runtime retention/bucket schema guarantees..."
$runtimeSqlPath = Join-Path $PSScriptRoot "_tmp_runtime_repair.sql"
try {
    Set-Content -Path $runtimeSqlPath -Value $runtimeSql -NoNewline -Encoding UTF8
    Invoke-CheckedCommand -Step "runtime table ensure" -Command {
        psql --dbname "$TargetConnectionString" -v ON_ERROR_STOP=1 -f "$runtimeSqlPath"
    }
}
finally {
    if (Test-Path $runtimeSqlPath) {
        Remove-Item -Path $runtimeSqlPath -Force
    }
}

Write-Host "Collecting post-repair table inventory..."
$afterTables = Get-ExistingTables -ConnectionString $TargetConnectionString
$missingAfter = Get-MissingTables -Actual $afterTables -ExpectedShortNames $expectedTables

$resolvedBefore = @($missingBefore)
$resolvedAfter = @($missingAfter)
$resolvedNow = @($resolvedBefore | Where-Object { $resolvedAfter -notcontains $_ })

Write-Host ""
Write-Host "=== Schema Repair Summary ==="
Write-Host "Database: $currentDb"
Write-Host "Expected: $ExpectedDatabaseName"
Write-Host "Bucket: $BucketName"
Write-Host "Project folder: $ProjectFolder"
Write-Host "Missing before: $($resolvedBefore.Count)"
Write-Host "Missing after: $($resolvedAfter.Count)"
Write-Host "Resolved now: $($resolvedNow.Count)"

if ($resolvedNow.Count -gt 0) {
    Write-Host "Resolved tables:" -ForegroundColor Green
    $resolvedNow | Sort-Object | ForEach-Object { Write-Host "  - $_" }
}

if ($resolvedAfter.Count -gt 0) {
    Write-Warning "Tables still missing after repair:"
    $resolvedAfter | Sort-Object | ForEach-Object { Write-Host "  - $_" }
    exit 2
}

Write-Host "All required tables are present." -ForegroundColor Green
