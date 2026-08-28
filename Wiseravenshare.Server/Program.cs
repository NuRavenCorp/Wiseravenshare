using Wiseravenshare.Server.Services;
using Wiseravenshare.Server.Services.External.DeepSeekService;
using Wiseravenshare.Server.Services.Truth;
using Npgsql;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Infrastructure.Data;
using Wiseravenshare.Server.Services.CrossPlatform;
using Wiseravenshare.Server.Services.AiAssistant;
using Wiseravenshare.Server.Infrastructure.Data.Repositories;
using Wiseravenshare.Server.Infrastructure.External;
using Wiseravenshare.Server.Interfaces.Repositories;
using Microsoft.Extensions.FileProviders;
using Wiseravenshare.Server.Hubs;
using Wiseravenshare.Server.Interfaces.Services.CrossPlatform;
using Wiseravenshare.Server.Services.CrossPlatform;
using System.IO.Compression;
using System.Diagnostics;
using System.Globalization;
using Microsoft.AspNetCore.ResponseCompression;

var builder = WebApplication.CreateBuilder(args);

static string NormalizeConnectionString(string connectionString)
{
    var value = connectionString?.Trim() ?? string.Empty;
    if (string.IsNullOrWhiteSpace(value))
    {
        return string.Empty;
    }

    if (!value.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase)
        && !value.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase))
    {
        return value;
    }

    if (value.EndsWith("?sslmode", StringComparison.OrdinalIgnoreCase))
    {
        return value + "=require";
    }

    value = value.Replace("?sslmode&", "?sslmode=require&", StringComparison.OrdinalIgnoreCase);
    value = value.Replace("&sslmode&", "&sslmode=require&", StringComparison.OrdinalIgnoreCase);

    if (!Uri.TryCreate(value, UriKind.Absolute, out var uri))
    {
        return value;
    }

    var userName = string.Empty;
    var password = string.Empty;
    if (!string.IsNullOrWhiteSpace(uri.UserInfo))
    {
        var parts = uri.UserInfo.Split(':', 2);
        userName = Uri.UnescapeDataString(parts[0]);
        if (parts.Length > 1)
        {
            password = Uri.UnescapeDataString(parts[1]);
        }
    }

    var builder = new NpgsqlConnectionStringBuilder
    {
        Host = uri.Host,
        Port = uri.IsDefaultPort ? 5432 : uri.Port,
        Username = userName,
        Password = password,
        Database = uri.AbsolutePath.Trim('/'),
        SslMode = SslMode.Require,
        Pooling = true
    };

    var query = uri.Query?.TrimStart('?') ?? string.Empty;
    foreach (var segment in query.Split('&', StringSplitOptions.RemoveEmptyEntries))
    {
        var kv = segment.Split('=', 2);
        var key = Uri.UnescapeDataString(kv[0]);
        var val = kv.Length > 1 ? Uri.UnescapeDataString(kv[1]) : string.Empty;

        if (key.Equals("sslmode", StringComparison.OrdinalIgnoreCase)
            && Enum.TryParse<SslMode>(val, true, out var mode))
        {
            builder.SslMode = mode;
        }
    }

    return builder.ConnectionString;
}

static string ResolvePrimaryConnectionString(IConfiguration configuration)
{
    var databaseUrl = configuration["DATABASE_URL"];
    if (!string.IsNullOrWhiteSpace(databaseUrl))
    {
        return NormalizeConnectionString(databaseUrl);
    }

    return NormalizeConnectionString(configuration.GetConnectionString("DefaultConnection") ?? string.Empty);
}

static string ResolveExpectedDatabaseName(IConfiguration configuration)
{
    var configured = configuration["Database:ExpectedName"]?.Trim();
    return string.IsNullOrWhiteSpace(configured) ? "defaultdb" : configured;
}

static string ExtractDatabaseName(string connectionString)
{
    if (string.IsNullOrWhiteSpace(connectionString))
    {
        return string.Empty;
    }

    try
    {
        var builder = new NpgsqlConnectionStringBuilder(connectionString);
        return builder.Database?.Trim() ?? string.Empty;
    }
    catch
    {
        return string.Empty;
    }
}

static string NormalizeFolderPath(string? folder)
{
    var normalized = (folder ?? string.Empty).Trim();
    if (string.IsNullOrWhiteSpace(normalized))
    {
        return "wiseravenshare/";
    }

    normalized = normalized.Replace('\\', '/').Trim('/');
    return normalized + "/";
}

static string ToSqlLiteral(string value)
{
    return "'" + value.Replace("'", "''") + "'";
}

static IEnumerable<string> SplitSqlStatements(string script)
{
    if (string.IsNullOrWhiteSpace(script))
    {
        yield break;
    }

    var builder = new StringBuilder();
    var inString = false;
    string? dollarTag = null;
    var inLineComment = false;
    var inBlockComment = false;

    for (var index = 0; index < script.Length; index++)
    {
        var current = script[index];
        var next = index + 1 < script.Length ? script[index + 1] : '\0';

        if (inLineComment)
        {
            builder.Append(current);
            if (current == '\n')
            {
                inLineComment = false;
            }

            continue;
        }

        if (inBlockComment)
        {
            builder.Append(current);
            if (current == '*' && next == '/')
            {
                builder.Append(next);
                index++;
                inBlockComment = false;
            }

            continue;
        }

        if (!inString && dollarTag is null && current == '-' && next == '-')
        {
            builder.Append(current);
            builder.Append(next);
            index++;
            inLineComment = true;
            continue;
        }

        if (!inString && dollarTag is null && current == '/' && next == '*')
        {
            builder.Append(current);
            builder.Append(next);
            index++;
            inBlockComment = true;
            continue;
        }

        if (!inString && dollarTag is null && current == '$')
        {
            var tagEnd = script.IndexOf('$', index + 1);
            if (tagEnd > index)
            {
                var possibleTag = script.Substring(index, tagEnd - index + 1);
                if (possibleTag.Length >= 2 && possibleTag.All(ch => ch == '$' || ch == '_' || char.IsLetterOrDigit(ch)))
                {
                    dollarTag = possibleTag;
                    builder.Append(possibleTag);
                    index = tagEnd;
                    continue;
                }
            }
        }

        if (dollarTag is not null)
        {
            if (current == '$')
            {
                if (index + dollarTag.Length - 1 < script.Length
                    && string.Compare(script, index, dollarTag, 0, dollarTag.Length, StringComparison.Ordinal) == 0)
                {
                    builder.Append(dollarTag);
                    index += dollarTag.Length - 1;
                    dollarTag = null;
                    continue;
                }
            }

            builder.Append(current);
            continue;
        }

        if (current == '\'' && next == '\'')
        {
            builder.Append(current);
            builder.Append(next);
            index++;
            continue;
        }

        if (current == '\'')
        {
            inString = !inString;
            builder.Append(current);
            continue;
        }

        if (current == ';' && !inString)
        {
            var statement = builder.ToString().Trim();
            if (!string.IsNullOrWhiteSpace(statement))
            {
                yield return statement;
            }

            builder.Clear();
            continue;
        }

        builder.Append(current);
    }

    var trailing = builder.ToString().Trim();
    if (!string.IsNullOrWhiteSpace(trailing))
    {
        yield return trailing;
    }
}

static async Task EnsureMigrationsHistoryTableAsync(AppDbContext dbContext, CancellationToken cancellationToken = default)
{
    var connectionString = dbContext.Database.GetConnectionString();
    if (string.IsNullOrWhiteSpace(connectionString))
    {
        return;
    }

    const string historySql = @"
CREATE SCHEMA IF NOT EXISTS app_data;
CREATE TABLE IF NOT EXISTS app_data.""__EFMigrationsHistory"" (
    ""MigrationId"" character varying(150) NOT NULL,
    ""ProductVersion"" character varying(32) NOT NULL,
    CONSTRAINT ""PK___EFMigrationsHistory"" PRIMARY KEY (""MigrationId"")
);";

    await using var connection = new NpgsqlConnection(connectionString);
    await connection.OpenAsync(cancellationToken);
    await using var command = new NpgsqlCommand(historySql, connection);
    await command.ExecuteNonQueryAsync(cancellationToken);
}

static async Task ApplyModelCreateScriptIdempotentlyAsync(AppDbContext dbContext, ILogger logger, CancellationToken cancellationToken = default)
{
    var connectionString = dbContext.Database.GetConnectionString();
    if (string.IsNullOrWhiteSpace(connectionString))
    {
        return;
    }

    var script = dbContext.Database.GenerateCreateScript();
    if (string.IsNullOrWhiteSpace(script))
    {
        return;
    }

    await using var connection = new NpgsqlConnection(connectionString);
    await connection.OpenAsync(cancellationToken);

    foreach (var statement in SplitSqlStatements(script))
    {
        await using var command = new NpgsqlCommand(statement, connection);
        try
        {
            await command.ExecuteNonQueryAsync(cancellationToken);
        }
        catch (PostgresException ex) when (
            ex.SqlState == PostgresErrorCodes.DuplicateTable
            || ex.SqlState == PostgresErrorCodes.DuplicateObject
            || ex.SqlState == PostgresErrorCodes.DuplicateColumn)
        {
            // Existing objects are expected when bootstrapping over a partially provisioned database.
            logger.LogDebug("Skipped duplicate schema statement during bootstrap: {SqlState}", ex.SqlState);
        }
    }
}

static async Task MarkInitialMigrationAppliedAsync(AppDbContext dbContext, ILogger logger, CancellationToken cancellationToken = default)
{
    var connectionString = dbContext.Database.GetConnectionString();
    if (string.IsNullOrWhiteSpace(connectionString))
    {
        return;
    }

    var migrations = dbContext.Database.GetMigrations().ToList();
    if (migrations.Count == 0)
    {
        return;
    }

    var initialMigration = migrations[0];

    var productVersion = typeof(DbContext).Assembly.GetName().Version is { } version
        ? $"{version.Major}.{version.Minor}.{version.Build}"
        : "10.0.10";

    await EnsureMigrationsHistoryTableAsync(dbContext, cancellationToken);

    await using var connection = new NpgsqlConnection(connectionString);
    await connection.OpenAsync(cancellationToken);

    const string insertSql = @"
INSERT INTO app_data.""__EFMigrationsHistory"" (""MigrationId"", ""ProductVersion"")
VALUES (@migrationId, @productVersion)
ON CONFLICT (""MigrationId"") DO NOTHING;";

    await using var command = new NpgsqlCommand(insertSql, connection);
    command.Parameters.AddWithValue("migrationId", initialMigration);
    command.Parameters.AddWithValue("productVersion", productVersion);
    await command.ExecuteNonQueryAsync(cancellationToken);

    logger.LogInformation("EF migration history baseline was reconciled with initial migration {MigrationId}.", initialMigration);
}

static bool IsDuplicateMigrationConflict(Exception exception)
{
    if (exception is PostgresException pg)
    {
        return pg.SqlState == PostgresErrorCodes.DuplicateTable
            || pg.SqlState == PostgresErrorCodes.DuplicateObject
            || pg.SqlState == PostgresErrorCodes.DuplicateColumn;
    }

    return exception.InnerException is not null && IsDuplicateMigrationConflict(exception.InnerException);
}

static async Task<bool> HasCorePostSchemaAsync(AppDbContext dbContext, CancellationToken cancellationToken = default)
{
    const string sql = @"
SELECT COUNT(*)
FROM information_schema.tables
WHERE table_schema = 'app_data'
  AND table_name IN ('Users', 'Posts', 'PostLikes', 'PostReposts', 'PostBookmarks');";

    var result = await dbContext.Database.SqlQueryRaw<int>(sql).ToListAsync(cancellationToken);
    var existing = result.FirstOrDefault();
    return existing >= 5;
}

static async Task MarkMigrationsAppliedAsync(AppDbContext dbContext, ILogger logger, IReadOnlyCollection<string> migrationIds, CancellationToken cancellationToken = default)
{
    if (migrationIds.Count == 0)
    {
        return;
    }

    var connectionString = dbContext.Database.GetConnectionString();
    if (string.IsNullOrWhiteSpace(connectionString))
    {
        return;
    }

    var productVersion = typeof(DbContext).Assembly.GetName().Version is { } version
        ? $"{version.Major}.{version.Minor}.{version.Build}"
        : "10.0.10";

    await EnsureMigrationsHistoryTableAsync(dbContext, cancellationToken);

    await using var connection = new NpgsqlConnection(connectionString);
    await connection.OpenAsync(cancellationToken);

    const string insertSql = @"
INSERT INTO app_data.""__EFMigrationsHistory"" (""MigrationId"", ""ProductVersion"")
VALUES (@migrationId, @productVersion)
ON CONFLICT (""MigrationId"") DO NOTHING;";

    foreach (var migrationId in migrationIds)
    {
        await using var command = new NpgsqlCommand(insertSql, connection);
        command.Parameters.AddWithValue("migrationId", migrationId);
        command.Parameters.AddWithValue("productVersion", productVersion);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    logger.LogInformation("Reconciled EF migration history for existing schema objects: {MigrationIds}", string.Join(", ", migrationIds));
}

static async Task EnsureDatabaseSchemaAsync(AppDbContext dbContext, ILogger logger, CancellationToken cancellationToken = default)
{
    try
    {
        var pendingMigrations = (await dbContext.Database.GetPendingMigrationsAsync(cancellationToken)).ToList();
        if (pendingMigrations.Count > 0)
        {
            try
            {
                await dbContext.Database.MigrateAsync(cancellationToken);
            }
            catch (Exception migrateEx) when (IsDuplicateMigrationConflict(migrateEx))
            {
                var schemaReady = await HasCorePostSchemaAsync(dbContext, cancellationToken);
                if (!schemaReady)
                {
                    throw;
                }

                await MarkMigrationsAppliedAsync(dbContext, logger, pendingMigrations, cancellationToken);
                logger.LogInformation("Skipped duplicate-object migration failure because required schema already exists.");
            }

            return;
        }

        var databaseExists = await dbContext.Database.CanConnectAsync(cancellationToken);
        if (!databaseExists)
        {
            logger.LogInformation("Database is not reachable; creating schema from the current EF model.");
            await dbContext.Database.EnsureCreatedAsync(cancellationToken);
            return;
        }

        var hasAnyTables = await dbContext.Database.SqlQueryRaw<int>("SELECT 1 FROM information_schema.tables WHERE table_schema = 'app_data' LIMIT 1").AnyAsync(cancellationToken);
        var hasUsersTable = await dbContext.Database.SqlQueryRaw<int>("SELECT 1 FROM information_schema.tables WHERE table_schema = 'app_data' AND table_name = 'Users' LIMIT 1").AnyAsync(cancellationToken);

        if (!hasAnyTables || !hasUsersTable)
        {
            logger.LogInformation("app_data is missing required EF tables; creating schema from the current EF model.");
            await dbContext.Database.EnsureCreatedAsync(cancellationToken);
        }
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "Schema migration failed; applying model bootstrap script and reconciling migration history.");
        try
        {
            await ApplyModelCreateScriptIdempotentlyAsync(dbContext, logger, cancellationToken);
            await MarkInitialMigrationAppliedAsync(dbContext, logger, cancellationToken);
        }
        catch (Exception ensureEx)
        {
            logger.LogError(ensureEx, "Schema bootstrap failed during model-based fallback. Attempting EnsureCreated as a final fallback.");
            await dbContext.Database.EnsureCreatedAsync(cancellationToken);
        }

        try
        {
            var pendingMigrations = (await dbContext.Database.GetPendingMigrationsAsync(cancellationToken)).ToList();
            if (pendingMigrations.Count > 0)
            {
                await dbContext.Database.MigrateAsync(cancellationToken);
            }
        }
        catch (Exception migrateRetryEx) when (IsDuplicateMigrationConflict(migrateRetryEx))
        {
            var schemaReady = await HasCorePostSchemaAsync(dbContext, cancellationToken);
            if (!schemaReady)
            {
                throw;
            }

            var remainingMigrations = (await dbContext.Database.GetPendingMigrationsAsync(cancellationToken)).ToList();
            await MarkMigrationsAppliedAsync(dbContext, logger, remainingMigrations, cancellationToken);
            logger.LogInformation("Final migration pass detected duplicate objects on an operational schema; migration history was reconciled.");
        }
        catch (Exception migrateRetryEx)
        {
            logger.LogWarning(migrateRetryEx, "Final migration pass after schema bootstrap was skipped because schema is already operational.");
        }
    }
}

static async Task EnsureBucketObjectsRegistryAsync(
    string connectionString,
    string bucketName,
    string folderPath,
    CancellationToken cancellationToken = default)
{
    if (string.IsNullOrWhiteSpace(connectionString))
    {
        return;
    }

    await DatabasePrivilegeBootstrap.EnsureAppDataPrivilegesAsync(connectionString, cancellationToken);

    var safeBucketName = string.IsNullOrWhiteSpace(bucketName) ? "bucket-wrs-01010" : bucketName.Trim();
    var safeFolderPath = NormalizeFolderPath(folderPath);

    var bucketLiteral = ToSqlLiteral(safeBucketName);
    var folderLiteral = ToSqlLiteral(safeFolderPath);

    var sql = $@"
CREATE SCHEMA IF NOT EXISTS app_data;

CREATE TABLE IF NOT EXISTS app_data.""Users"" (
    ""Id"" UUID PRIMARY KEY,
    ""Email"" TEXT NOT NULL UNIQUE,
    ""Username"" TEXT NOT NULL,
    ""DisplayName"" TEXT NOT NULL,
    ""PasswordHash"" TEXT NOT NULL,
    ""Bio"" TEXT NULL,
    ""AvatarUrl"" TEXT NULL,
    ""CoverPhotoUrl"" TEXT NULL,
    ""Location"" TEXT NULL,
    ""Website"" TEXT NULL,
    ""IsVerified"" BOOLEAN NOT NULL DEFAULT FALSE,
    ""IsActive"" BOOLEAN NOT NULL DEFAULT TRUE,
    ""IsPrivate"" BOOLEAN NOT NULL DEFAULT FALSE,
    ""Role"" INTEGER NOT NULL DEFAULT 0,
    ""TruthScore"" NUMERIC NOT NULL DEFAULT 50.00,
    ""ReputationPoints"" INTEGER NOT NULL DEFAULT 0,
    ""LastLoginAt"" TIMESTAMPTZ NULL,
    ""LastActiveAt"" TIMESTAMPTZ NULL,
    ""RefreshToken"" TEXT NULL,
    ""RefreshTokenExpiryTime"" TIMESTAMPTZ NULL,
    ""PasswordResetToken"" TEXT NULL,
    ""PasswordResetTokenExpiryTime"" TIMESTAMPTZ NULL,
    ""DeletedAt"" TIMESTAMPTZ NULL,
    ""CreatedAt"" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ""UpdatedAt"" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ""IsDeleted"" BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS app_data.bucket_objects (
    id TEXT PRIMARY KEY,
    owner_user_id UUID NULL,
    provider TEXT NOT NULL DEFAULT 'digitalocean_spaces',
    bucket_name TEXT NOT NULL DEFAULT {bucketLiteral},
    region TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    folder_path TEXT NOT NULL DEFAULT {folderLiteral},
    object_key TEXT NOT NULL,
    original_file_name TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
    etag TEXT NULL,
    acl TEXT NOT NULL DEFAULT 'private',
    cdn_base_url TEXT NULL,
    public_url TEXT NULL,
    upload_status TEXT NOT NULL DEFAULT 'uploaded',
    metadata JSONB NOT NULL DEFAULT '{{}}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ NULL,
    CONSTRAINT fk_bucket_objects_owner
        FOREIGN KEY (owner_user_id) REFERENCES app_data.""Users"" (""Id"") ON DELETE SET NULL,
    CONSTRAINT uq_bucket_objects_bucket_key UNIQUE (bucket_name, object_key)
);

ALTER TABLE app_data.bucket_objects
    ALTER COLUMN bucket_name SET DEFAULT {bucketLiteral},
    ALTER COLUMN folder_path SET DEFAULT {folderLiteral};

CREATE INDEX IF NOT EXISTS idx_bucket_objects_owner_created
    ON app_data.bucket_objects (owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bucket_objects_folder_created
    ON app_data.bucket_objects (folder_path, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bucket_objects_status_created
    ON app_data.bucket_objects (upload_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bucket_objects_metadata_gin
    ON app_data.bucket_objects USING GIN (metadata);

DO $$
BEGIN
    IF to_regclass('app_data.""PostLikes""') IS NOT NULL THEN
        CREATE UNIQUE INDEX IF NOT EXISTS idx_post_likes_post_user_unique
            ON app_data.""PostLikes"" (""PostId"", ""UserId"");
    END IF;

    IF to_regclass('app_data.""PostReposts""') IS NOT NULL THEN
        CREATE UNIQUE INDEX IF NOT EXISTS idx_post_reposts_post_user_unique
            ON app_data.""PostReposts"" (""PostId"", ""UserId"");
    END IF;

    IF to_regclass('app_data.""PostBookmarks""') IS NOT NULL THEN
        CREATE UNIQUE INDEX IF NOT EXISTS idx_post_bookmarks_post_user_unique
            ON app_data.""PostBookmarks"" (""PostId"", ""UserId"");
    END IF;
END;
$$;

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
FOR EACH ROW EXECUTE FUNCTION app_data.set_updated_at_timestamp();";

    await using var connection = new NpgsqlConnection(connectionString);
    await connection.OpenAsync(cancellationToken);
    await using var command = new NpgsqlCommand(sql, connection);
    await command.ExecuteNonQueryAsync(cancellationToken);
}

static async Task EnsureCrossPlatformTablesAsync(string connectionString, CancellationToken cancellationToken = default)
{
    if (string.IsNullOrWhiteSpace(connectionString)) return;

    const string sql = @"
CREATE SCHEMA IF NOT EXISTS app_data;

CREATE TABLE IF NOT EXISTS app_data.bridge_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR(255) NOT NULL UNIQUE,
    platform VARCHAR(50) NOT NULL,
    external_user_id VARCHAR(255) NOT NULL,
    session_data JSONB,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_activity TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    metadata JSONB
);

CREATE TABLE IF NOT EXISTS app_data.collaboration_rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id VARCHAR(255) NOT NULL UNIQUE,
    room_name VARCHAR(255) NOT NULL,
    owner_id UUID NULL,
    platform VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB
);

CREATE TABLE IF NOT EXISTS app_data.room_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id VARCHAR(255) NOT NULL,
    user_id UUID NULL,
    external_user_id VARCHAR(255),
    platform VARCHAR(50),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    left_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    metadata JSONB
);

CREATE TABLE IF NOT EXISTS app_data.bridge_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR(255) NOT NULL,
    source VARCHAR(50) NOT NULL,
    target VARCHAR(50) NOT NULL,
    message_type VARCHAR(50) NOT NULL,
    content TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    is_processed BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS app_data.file_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transfer_id VARCHAR(255) NOT NULL UNIQUE,
    room_id VARCHAR(255) NOT NULL,
    user_id UUID NULL,
    file_name VARCHAR(255) NOT NULL,
    file_size BIGINT NOT NULL,
    file_type VARCHAR(100) NOT NULL,
    file_url TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    chunk_count INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_bridge_sessions_platform_user
    ON app_data.bridge_sessions (platform, external_user_id);
CREATE INDEX IF NOT EXISTS idx_room_participants_room
    ON app_data.room_participants (room_id, is_active);";

    await using var connection = new NpgsqlConnection(connectionString);
    await connection.OpenAsync(cancellationToken);
    await using var command = new NpgsqlCommand(sql, connection);
    await command.ExecuteNonQueryAsync(cancellationToken);
}

// ── Configuration ────────────────────────────────────────────────────────────
var clientOrigin = builder.Configuration["CLIENT_ORIGIN"];
var configuredClientOrigins = (clientOrigin ?? string.Empty)
    .Split(new[] { ',', ';', ' ' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
    .Distinct(StringComparer.OrdinalIgnoreCase)
    .ToArray();
var defaultConnectionString = ResolvePrimaryConnectionString(builder.Configuration);
var requireDatabase = builder.Configuration.GetValue("Persistence:RequireDatabase", true);
var expectedDatabaseName = ResolveExpectedDatabaseName(builder.Configuration);
var configuredBucketName = builder.Configuration["Storage:Blob:BucketName"] ?? "bucket-wrs-01010";
var configuredProjectFolder = StoragePathResolver.ResolveProjectFolder(builder.Configuration, builder.Environment.ContentRootPath, "wiseravenshare");
var cacheConnection = builder.Configuration["Cache:ConnectionString"];
var useRedisCache = builder.Configuration.GetValue("Cache:UseRedis", false);

if (requireDatabase && string.IsNullOrWhiteSpace(defaultConnectionString))
{
    throw new InvalidOperationException("Persistence:RequireDatabase is true but no database connection string was configured. Set DATABASE_URL or ConnectionStrings:DefaultConnection.");
}

// ── Logging ──────────────────────────────────────────────────────────────────
builder.Logging.ClearProviders();
builder.Logging.AddConsole();
if (!builder.Environment.IsDevelopment())
{
    builder.Logging.SetMinimumLevel(LogLevel.Warning);
}

// ── Services ─────────────────────────────────────────────────────────────────
builder.Services.Configure<Microsoft.AspNetCore.Builder.ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.XForwardedFor |
                               Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.XForwardedProto |
                               Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.XForwardedHost;
    // Clearing networks automatically trusts the nearest proxy (e.g. docker network or cloud provider proxy)
    options.KnownNetworks.Clear();
    options.KnownProxies.Clear();
});

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddMemoryCache();
builder.Services.AddDistributedMemoryCache();

if (useRedisCache && !string.IsNullOrWhiteSpace(cacheConnection))
{
    builder.Services.AddStackExchangeRedisCache(options =>
    {
        options.Configuration = cacheConnection;
        options.InstanceName = builder.Configuration["Cache:InstanceName"] ?? "wiseravenshare:";
    });
}

builder.Services.AddResponseCompression(options =>
{
    options.EnableForHttps = true;
    options.Providers.Add<BrotliCompressionProvider>();
    options.Providers.Add<GzipCompressionProvider>();
    options.MimeTypes = ResponseCompressionDefaults.MimeTypes.Concat(new[]
    {
        "application/json",
        "application/problem+json"
    });
});
builder.Services.Configure<BrotliCompressionProviderOptions>(options =>
{
    options.Level = CompressionLevel.Fastest;
});
builder.Services.Configure<GzipCompressionProviderOptions>(options =>
{
    options.Level = CompressionLevel.Fastest;
});

builder.Services.AddOutputCache(options =>
{
    options.AddPolicy("MarketQuotes", policy =>
        policy
            .Expire(TimeSpan.FromSeconds(30))
            .SetVaryByQuery("symbols")
            .Tag("market"));

    options.AddPolicy("EvolutionCatalog", policy =>
        policy
            .Expire(TimeSpan.FromSeconds(45))
            .Tag("evolution"));

    options.AddPolicy("PublicFeedShort", policy =>
        policy
            .Expire(TimeSpan.FromSeconds(20))
            .Tag("feed"));
});

builder.Services.AddSignalR();
// Cross-platform collaboration bridge (TikTok/Facebook/Instagram/Twitter webviews).
builder.Services.AddSingleton<IPlatformBridgeService, PlatformBridgeService>();
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(defaultConnectionString, npgsqlOptions =>
        npgsqlOptions.MigrationsHistoryTable("__EFMigrationsHistory", "app_data")));
builder.Services.AddScoped<IUserRepository, UserRepository>();
builder.Services.AddScoped<IPostRepository, PostRepository>();
builder.Services.AddScoped<ITruthRepository, TruthRepository>();
builder.Services.AddScoped<IAgentRepository, AgentRepository>();
builder.Services.AddScoped<IPostService, PostService>();
builder.Services.AddScoped<ITruthService, TruthService>();
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<IEmailService, SmtpEmailService>();
builder.Services.AddScoped<IEvolutionService, EvolutionService>();
builder.Services.AddScoped<ISubscriptionService, SubscriptionService>();
builder.Services.AddScoped<IOpenAIService, OpenAIService>();
builder.Services.AddScoped<IYouTubeService, YouTubeService>();
builder.Services.AddScoped<IVideoService, VideoService>();
builder.Services.AddScoped<IRavensightMediaPathService, RavensightMediaPathService>();
builder.Services.AddScoped<IBlobStorageService, DigitalOceanSpacesBlobStorageService>();
builder.Services.AddScoped<IRavensightVideoService, RavensightVideoService>();
builder.Services.AddScoped<IRavensightPhotoService, RavensightPhotoService>();
builder.Services.AddScoped<IRavensightMusicService, RavensightMusicService>();
builder.Services.AddScoped<SyntheticEngagementService>();
builder.Services.AddHttpClient<ISocialPlatformService, SocialPlatformService>();
builder.Services.AddHttpClient("SocialPublish");
builder.Services.AddScoped<ISocialPublishDispatcher, SocialPublishDispatcher>();
// Cross-platform publishing: one publisher per platform + orchestrator + repository.
builder.Services.AddHttpClient<ICrossPlatformPublisher, FacebookPublisher>();
builder.Services.AddHttpClient<ICrossPlatformPublisher, InstagramPublisher>();
builder.Services.AddHttpClient<ICrossPlatformPublisher, TikTokPublisher>();
builder.Services.AddHttpClient<ICrossPlatformPublisher, TwitterPublisher>();
builder.Services.AddHttpClient<ICrossPlatformPublisher, LinkedInPublisher>();
builder.Services.AddScoped<ICrossPlatformPublisher, YouTubePublisher>();
builder.Services.AddScoped<ISocialCrossPostRepository, SocialCrossPostRepository>();
builder.Services.AddScoped<ICrossPlatformPublishService, CrossPlatformPublishService>();
// AI assistant (local llama.cpp llama-server, OpenAI-compatible API).
// It stays inside the compose network; front-end UIs reach it only
// through the api's endpoints. Set AiProvider=ollama to use the old client.
var aiProvider = (builder.Configuration["AiProvider"] ?? "llamacpp").Trim().ToLowerInvariant();
if (aiProvider == "ollama")
{
    builder.Services.AddHttpClient<IOllamaChatService, OllamaChatService>();
}
else
{
    builder.Services.AddHttpClient<IOllamaChatService, LocalChatService>();
}
builder.Services.AddSingleton<UserStore>();
builder.Services.AddSingleton<GrowthService>();
builder.Services.AddSingleton<TeamAccessService>();
builder.Services.AddSingleton<PerformanceMetricsService>();
builder.Services.AddScoped<OutputCacheInvalidationService>();
builder.Services.AddSingleton<VideoFeedCollaborationService>();
builder.Services.AddSingleton<VideoLibraryStore>();
builder.Services.AddSingleton<RavensightMediaCatalogStore>();
builder.Services.AddSingleton<PersistenceDiagnosticsCache>();
builder.Services.AddHttpClient();
builder.Services.AddHttpClient<INewsAggregationService, NewsAggregationService>();
builder.Services.AddHttpClient<IDeepSeekService, DeepSeekService>();
builder.Services.AddScoped<IKnowledgeBaseService, KnowledgeBaseService>();
builder.Services.AddScoped<IConsensusService, ConsensusService>();
// Currency system (WSC): badge-first multipliers, wallet, staking, currency agent
builder.Services.AddScoped<Wiseravenshare.Server.Services.Currency.IWiseCoinService, Wiseravenshare.Server.Services.Currency.WiseCoinService>();
builder.Services.AddScoped<Wiseravenshare.Server.Services.Currency.IBadgeService, Wiseravenshare.Server.Services.Currency.BadgeService>();
builder.Services.AddScoped<Wiseravenshare.Server.Services.Currency.ICurrencyAgentService, Wiseravenshare.Server.Services.Currency.CurrencyAgentService>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<Wiseravenshare.Server.Services.Currency.ICurrencyAgentService>() as Wiseravenshare.Server.Services.Currency.CurrencyAgentService ?? throw new InvalidOperationException("CurrencyAgentService must be registered as the concrete hosted service"));
builder.Services.AddScoped<ITruthEngineService, TruthEngineService>();
builder.Services.AddSingleton<IReminderNotificationService, ReminderNotificationService>();
builder.Services.AddHostedService<RavensightMediaRetentionCleanupService>();

var jwtKey = builder.Configuration["Authentication:Jwt:Key"];
if (string.IsNullOrWhiteSpace(jwtKey))
{
    throw new InvalidOperationException("Authentication:Jwt:Key is required.");
}

if (jwtKey.Length < 32)
{
    throw new InvalidOperationException("Authentication:Jwt:Key must be at least 32 characters.");
}

var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey));
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                var accessToken = context.Request.Query["access_token"];
                var path = context.HttpContext.Request.Path;

                if (!string.IsNullOrWhiteSpace(accessToken)
                    && (path.StartsWithSegments("/api/hubs/messages") || path.StartsWithSegments("/api/hubs/notifications") || path.StartsWithSegments("/api/hubs/evolution") || path.StartsWithSegments("/hubs")))
                {
                    context.Token = accessToken;
                }

                return Task.CompletedTask;
            }
        };

        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = signingKey,
            ValidateIssuer = true,
            ValidIssuer = builder.Configuration["Authentication:Jwt:Issuer"],
            ValidateAudience = true,
            ValidAudience = builder.Configuration["Authentication:Jwt:Audience"],
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(1)
        };
    });

// Request timeout middleware (requires .NET 8+)
builder.Services.AddRequestTimeouts(options =>
{
    options.DefaultPolicy = new Microsoft.AspNetCore.Http.Timeouts.RequestTimeoutPolicy
    {
        Timeout = TimeSpan.FromSeconds(60)
    };
    // Streaming endpoints (e.g. AI chat SSE) must not be killed by the default timeout.
    options.Policies.Add("StreamingPolicy", new Microsoft.AspNetCore.Http.Timeouts.RequestTimeoutPolicy
    {
        Timeout = Timeout.InfiniteTimeSpan
    });
});

// CORS — explicit origin when set, locked-down in production
builder.Services.AddCors(options =>
{
    options.AddPolicy("ClientPolicy", policy =>
    {
        policy.AllowAnyHeader().AllowAnyMethod();

        if (configuredClientOrigins.Length > 0)
        {
            policy.WithOrigins(configuredClientOrigins)
                  .AllowCredentials();
        }
        else if (builder.Environment.IsDevelopment())
        {
            policy.SetIsOriginAllowed(_ => true)
                  .AllowCredentials();
        }
        else
        {
            // Fail-safe: block cross-origin in production if CLIENT_ORIGIN is missing
            policy.WithOrigins("https://wise-ravens.com", "https://www.wise-ravens.com")
                  .AllowCredentials();
        }
    });
});

// Only register OpenAPI in development
if (builder.Environment.IsDevelopment())
{
    builder.Services.AddOpenApi();
}

var app = builder.Build();

var activeDatabaseName = ExtractDatabaseName(defaultConnectionString);
if (!string.IsNullOrWhiteSpace(activeDatabaseName)
    && !string.Equals(activeDatabaseName, expectedDatabaseName, StringComparison.OrdinalIgnoreCase))
{
    app.Logger.LogWarning(
        "Active database '{ActiveDatabase}' does not match expected '{ExpectedDatabase}'. Posts may persist to the wrong database.",
        activeDatabaseName,
        expectedDatabaseName);
}

if (app.Environment.IsProduction() && !app.Configuration.GetValue("Authentication:AllowSelfRegistration", false))
{
    app.Logger.LogWarning("Authentication:AllowSelfRegistration is disabled in production. New user sign-ups will return 403.");
}

using (var scope = app.Services.CreateScope())
{
    var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    try
    {
        await EnsureDatabaseSchemaAsync(dbContext, app.Logger);
    }
    catch (Exception ex)
    {
        app.Logger.LogCritical(ex, "Automatic EF schema upgrade failed during startup. The app will continue with the existing schema if available.");
    }

    try
    {
        await EnsureBucketObjectsRegistryAsync(defaultConnectionString, configuredBucketName, configuredProjectFolder);
    }
    catch (Exception ex)
    {
        app.Logger.LogError(ex, "Bucket registry table verification failed during startup.");
    }

    try
    {
        await EnsureCrossPlatformTablesAsync(defaultConnectionString);
    }
    catch (Exception ex)
    {
        app.Logger.LogWarning(ex, "Cross-platform collaboration tables bootstrap failed during startup.");
    }

    // Seed default badge catalog (badge-first currency system)
    try
    {
        var badgeService = scope.ServiceProvider.GetRequiredService<Wiseravenshare.Server.Services.Currency.IBadgeService>();
        await badgeService.SeedDefaultBadgesAsync();
    }
    catch (Exception ex)
    {
        app.Logger.LogWarning(ex, "Badge catalog seeding failed during startup.");
    }

    var userStore = scope.ServiceProvider.GetRequiredService<UserStore>();
    var videoLibraryStore = scope.ServiceProvider.GetRequiredService<VideoLibraryStore>();
    var persistenceDiagnosticsCache = scope.ServiceProvider.GetRequiredService<PersistenceDiagnosticsCache>();

    var userDbPersistenceAvailable = userStore.IsDatabasePersistenceAvailable();
    var videoDbPersistenceAvailable = await videoLibraryStore.IsDatabasePersistenceAvailableAsync();
    var userStatus = userStore.GetPersistenceStatus();

    persistenceDiagnosticsCache.SetSnapshot(new PersistenceDiagnosticsSnapshot
    {
        LastCheckedAtUtc = DateTime.UtcNow,
        Users = new PersistenceDiagnosticsEntry
        {
            DatabaseConfigured = userStatus.DatabaseConfigured,
            DatabaseAvailable = userStatus.DatabaseAvailable,
            RequiresDatabase = userStatus.RequiresDatabase,
            ActiveTable = userStatus.ActiveTable,
            LastError = userStatus.LastError,
            TimedOut = false
        },
        Videos = new PersistenceDiagnosticsEntry
        {
            DatabaseConfigured = !string.IsNullOrWhiteSpace(defaultConnectionString),
            DatabaseAvailable = videoDbPersistenceAvailable,
            RequiresDatabase = requireDatabase,
            ActiveTable = "app_data.ravensight_videos_v2",
            LastError = string.Empty,
            TimedOut = false
        }
    });

    if (!userDbPersistenceAvailable || !videoDbPersistenceAvailable)
    {
        app.Logger.LogCritical(
            "Database persistence is unavailable (userStore={UserStoreAvailable}, videoStore={VideoStoreAvailable}). " +
            "Auth and/or content retention may fall back to non-durable storage until DB grants are fixed.",
            userDbPersistenceAvailable,
            videoDbPersistenceAvailable);
    }
}

// ── Middleware pipeline ───────────────────────────────────────────────────────
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.UseHttpsRedirection();
}

// Security headers for all responses
app.Use(async (context, next) =>
{
    var startTimestamp = Stopwatch.GetTimestamp();

    context.Response.OnStarting(() =>
    {
        var elapsedMs = Stopwatch.GetElapsedTime(startTimestamp).TotalMilliseconds;
        context.Response.Headers["Server-Timing"] = $"app;dur={elapsedMs.ToString("0.###", CultureInfo.InvariantCulture)}";
        context.Response.Headers["X-Response-Time-Ms"] = elapsedMs.ToString("0.###", CultureInfo.InvariantCulture);
        return Task.CompletedTask;
    });

    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["X-Frame-Options"] = "DENY";
    context.Response.Headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
    context.Response.Headers["X-XSS-Protection"] = "0"; // CSP is the modern replacement
    if (!app.Environment.IsDevelopment())
    {
        context.Response.Headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
    }

    await next();

    var totalElapsedMs = Stopwatch.GetElapsedTime(startTimestamp).TotalMilliseconds;
    if (context.Request.Path.StartsWithSegments("/api", StringComparison.OrdinalIgnoreCase))
    {
        var metricsService = context.RequestServices.GetRequiredService<PerformanceMetricsService>();
        metricsService.RecordRequest(
            context.Request.Method,
            context.Request.Path.Value ?? string.Empty,
            context.Response.StatusCode,
            totalElapsedMs);
    }

    if (totalElapsedMs >= 1200)
    {
        app.Logger.LogWarning(
            "Slow request detected: {Method} {Path} responded {StatusCode} in {ElapsedMs}ms.",
            context.Request.Method,
            context.Request.Path,
            context.Response.StatusCode,
            totalElapsedMs.ToString("0.###", CultureInfo.InvariantCulture));
    }
});

app.UseForwardedHeaders();
app.UseCors("ClientPolicy");
app.UseRequestTimeouts();
app.UseAuthentication();
app.UseAuthorization();
app.UseResponseCompression();
app.UseOutputCache();

var frontendDistPath = Path.GetFullPath(Path.Combine(app.Environment.ContentRootPath, "..", "wiseravenshare.client", "dist"));
var frontendDistExists = Directory.Exists(frontendDistPath);

if (frontendDistExists)
{
    app.UseDefaultFiles(new DefaultFilesOptions
    {
        FileProvider = new PhysicalFileProvider(frontendDistPath),
        DefaultFileNames = new[] { "index.html" }
    });

    app.UseStaticFiles(new StaticFileOptions
    {
        FileProvider = new PhysicalFileProvider(frontendDistPath),
        OnPrepareResponse = context =>
        {
            var responseHeaders = context.Context.Response.Headers;
            var extension = Path.GetExtension(context.File.Name);
            var isHtml = string.Equals(extension, ".html", StringComparison.OrdinalIgnoreCase);

            if (isHtml)
            {
                responseHeaders["Cache-Control"] = "no-cache, no-store, must-revalidate";
                return;
            }

            responseHeaders["Cache-Control"] = "public,max-age=604800,stale-while-revalidate=60";
        }
    });
}

app.MapControllers();
app.MapHub<EvolutionHub>("/api/hubs/evolution");
app.MapHub<NotificationHub>("/api/hubs/notifications");
app.MapHub<MessageHub>("/api/hubs/messages");
app.MapHub<CrossPlatformCollaborationHub>("/api/hubs/collaboration");

if (frontendDistExists)
{
    app.MapFallbackToFile("index.html", new StaticFileOptions
    {
        FileProvider = new PhysicalFileProvider(frontendDistPath)
    });
}

// ── Health endpoints ──────────────────────────────────────────────────────────
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));
app.MapGet("/health/db", async () =>
{
    if (string.IsNullOrWhiteSpace(defaultConnectionString))
    {
        return Results.Problem("DefaultConnection is not configured.", statusCode: StatusCodes.Status500InternalServerError);
    }

    try
    {
        await using var connection = new NpgsqlConnection(defaultConnectionString);
        await connection.OpenAsync();
        await using var pingCommand = new NpgsqlCommand("SELECT 1", connection);
        var result = await pingCommand.ExecuteScalarAsync();

        var expectedEfTableNames = new[]
        {
            "__EFMigrationsHistory",
            "Agents",
            "AgentEvolutions",
            "AgentInteractions",
            "Users",
            "Posts",
            "PostBookmarks",
            "Bookmarks",
            "Likes",
            "Reposts",
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
            "CommentLike"
        };

        var expectedLegacyRetentionTables = new[]
        {
            "app_data.app_users",
            "public.app_users",
            "app_data.ravensight_videos_v2",
            "public.ravensight_videos_v2",
            "app_data.ravensight_video_comments_v2",
            "public.ravensight_video_comments_v2",
            "app_data.bucket_objects",
            "public.bucket_objects"
        };

        const string tableInventorySql = @"
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_type = 'BASE TABLE'
  AND table_schema IN ('public', 'app_data');";

        var actualTables = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        await using (var tablesCommand = new NpgsqlCommand(tableInventorySql, connection))
        await using (var tablesReader = await tablesCommand.ExecuteReaderAsync())
        {
            while (await tablesReader.ReadAsync())
            {
                var schema = tablesReader.GetString(0);
                var table = tablesReader.GetString(1);
                actualTables.Add($"{schema}.{table}");
            }
        }

        const string historyExistsSql = @"
SELECT
    (to_regclass('app_data.""__EFMigrationsHistory""') IS NOT NULL)
    OR (to_regclass('public.""__EFMigrationsHistory""') IS NOT NULL);";
        var historyExists = false;
        await using (var historyExistsCommand = new NpgsqlCommand(historyExistsSql, connection))
        {
            var raw = await historyExistsCommand.ExecuteScalarAsync();
            historyExists = raw is bool value && value;
        }

        var appliedMigrations = new List<string>();
        if (historyExists)
        {
            var historyTable = actualTables.Contains("app_data.__EFMigrationsHistory")
                ? "app_data.\"__EFMigrationsHistory\""
                : "public.\"__EFMigrationsHistory\"";

            var migrationsSql = $@"
SELECT ""MigrationId""
FROM {historyTable}
ORDER BY ""MigrationId"";";

            await using var migrationsCommand = new NpgsqlCommand(migrationsSql, connection);
            await using var migrationsReader = await migrationsCommand.ExecuteReaderAsync();
            while (await migrationsReader.ReadAsync())
            {
                appliedMigrations.Add(migrationsReader.GetString(0));
            }
        }

        var missingEfTables = expectedEfTableNames
            .Select(name => new
            {
                Name = name,
                Exists = actualTables.Contains($"app_data.{name}") || actualTables.Contains($"public.{name}")
            })
            .Where(entry => !entry.Exists)
            .Select(entry => entry.Name)
            .ToArray();

        var hasUserTable = actualTables.Contains("app_data.app_users") || actualTables.Contains("public.app_users");
        var hasVideoTable = actualTables.Contains("app_data.ravensight_videos_v2") || actualTables.Contains("public.ravensight_videos_v2");
        var hasVideoCommentsTable = actualTables.Contains("app_data.ravensight_video_comments_v2") || actualTables.Contains("public.ravensight_video_comments_v2");
        var hasBucketObjectsTable = actualTables.Contains("app_data.bucket_objects") || actualTables.Contains("public.bucket_objects");

        var missingLegacyRetentionTables = expectedLegacyRetentionTables
            .Where(expected => !actualTables.Contains(expected))
            .ToArray();

        return Results.Ok(new
        {
            status = "ok",
            database = "postgres",
            result,
            migration = new
            {
                efHistoryExists = historyExists,
                appliedMigrationCount = appliedMigrations.Count,
                latestMigration = appliedMigrations.LastOrDefault() ?? string.Empty
            },
            connection = new
            {
                expectedDatabaseName,
                activeDatabaseName,
                databaseNameMatchesExpectation = string.IsNullOrWhiteSpace(activeDatabaseName)
                    ? false
                    : string.Equals(activeDatabaseName, expectedDatabaseName, StringComparison.OrdinalIgnoreCase)
            },
            schema = new
            {
                fullEfSchemaReady = missingEfTables.Length == 0,
                missingEfTables,
                hasUserRetentionTable = hasUserTable,
                hasVideoRetentionTable = hasVideoTable,
                hasVideoCommentsRetentionTable = hasVideoCommentsTable,
                hasBucketRegistryTable = hasBucketObjectsTable,
                expectedBucketName = configuredBucketName,
                expectedProjectFolder = NormalizeFolderPath(configuredProjectFolder),
                missingLegacyRetentionTables
            }
        });
    }
    catch (Exception ex)
    {
        app.Logger.LogError(ex, "Database connectivity check failed in /health/db.");
        return Results.Problem($"Database connectivity check failed: {ex.Message}", statusCode: StatusCodes.Status503ServiceUnavailable);
    }
});

app.Run();


