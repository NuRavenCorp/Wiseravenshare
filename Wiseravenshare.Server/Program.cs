using Wiseravenshare.Server.Services;
using Npgsql;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Infrastructure.Data;
using Wiseravenshare.Server.Infrastructure.Data.Repositories;
using Wiseravenshare.Server.Infrastructure.External;
using Wiseravenshare.Server.Interfaces.Repositories;
using Microsoft.Extensions.FileProviders;

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
        TrustServerCertificate = true,
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

static async Task EnsureDatabaseSchemaAsync(AppDbContext dbContext, ILogger logger, CancellationToken cancellationToken = default)
{
    try
    {
        var pendingMigrations = (await dbContext.Database.GetPendingMigrationsAsync(cancellationToken)).ToList();
        if (pendingMigrations.Count > 0)
        {
            await dbContext.Database.MigrateAsync(cancellationToken);
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
        if (!hasAnyTables)
        {
            logger.LogInformation("No app_data tables were found; creating schema from the current EF model.");
            await dbContext.Database.EnsureCreatedAsync(cancellationToken);
        }
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "Schema migration failed; falling back to EnsureCreated so the application can self-upgrade its DB schema on startup.");
        try
        {
            await dbContext.Database.EnsureCreatedAsync(cancellationToken);
        }
        catch (Exception ensureEx)
        {
            logger.LogError(ensureEx, "Schema bootstrap failed during EnsureCreated fallback.");
            throw;
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

    var safeBucketName = string.IsNullOrWhiteSpace(bucketName) ? "allbuckets1786108292029" : bucketName.Trim();
    var safeFolderPath = NormalizeFolderPath(folderPath);

    var bucketLiteral = ToSqlLiteral(safeBucketName);
    var folderLiteral = ToSqlLiteral(safeFolderPath);

    var sql = $@"
CREATE SCHEMA IF NOT EXISTS app_data;

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

// ── Configuration ────────────────────────────────────────────────────────────
var clientOrigin = builder.Configuration["CLIENT_ORIGIN"];
var configuredClientOrigins = (clientOrigin ?? string.Empty)
    .Split(new[] { ',', ';', ' ' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
    .Distinct(StringComparer.OrdinalIgnoreCase)
    .ToArray();
var defaultConnectionString = ResolvePrimaryConnectionString(builder.Configuration);
var expectedDatabaseName = ResolveExpectedDatabaseName(builder.Configuration);
var configuredBucketName = builder.Configuration["Storage:Blob:BucketName"] ?? "allbuckets1786108292029";
var configuredProjectFolder = StoragePathResolver.ResolveProjectFolder(builder.Configuration, builder.Environment.ContentRootPath, "wiseravenshare");

// ── Logging ──────────────────────────────────────────────────────────────────
builder.Logging.ClearProviders();
builder.Logging.AddConsole();
if (!builder.Environment.IsDevelopment())
{
    builder.Logging.SetMinimumLevel(LogLevel.Warning);
}

// ── Services ─────────────────────────────────────────────────────────────────
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddMemoryCache();
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
builder.Services.AddScoped<IEmailService, NoopEmailService>();
builder.Services.AddScoped<IEvolutionService, EvolutionService>();
builder.Services.AddScoped<ISubscriptionService, SubscriptionService>();
builder.Services.AddScoped<IOpenAIService, OpenAIService>();
builder.Services.AddScoped<IYouTubeService, YouTubeService>();
builder.Services.AddScoped<IRavensightMediaPathService, RavensightMediaPathService>();
builder.Services.AddScoped<IBlobStorageService, DigitalOceanSpacesBlobStorageService>();
builder.Services.AddScoped<IRavensightVideoService, RavensightVideoService>();
builder.Services.AddScoped<IRavensightPhotoService, RavensightPhotoService>();
builder.Services.AddScoped<IRavensightMusicService, RavensightMusicService>();
builder.Services.AddScoped<SyntheticEngagementService>();
builder.Services.AddHttpClient<ISocialPlatformService, SocialPlatformService>();
builder.Services.AddSingleton<UserStore>();
builder.Services.AddSingleton<GrowthService>();
builder.Services.AddSingleton<VideoLibraryStore>();
builder.Services.AddSingleton<RavensightMediaCatalogStore>();
builder.Services.AddSingleton<PersistenceDiagnosticsCache>();
builder.Services.AddHttpClient();
builder.Services.AddHttpClient<INewsAggregationService, NewsAggregationService>();
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
});

// CORS — explicit origin when set, locked-down in production
builder.Services.AddCors(options =>
{
    options.AddPolicy("ClientPolicy", policy =>
    {
        if (configuredClientOrigins.Length > 0)
        {
            policy.WithOrigins(configuredClientOrigins)
                  .AllowAnyHeader()
                  .WithMethods("GET", "POST", "PUT", "DELETE", "OPTIONS");
        }
        else if (builder.Environment.IsDevelopment())
        {
            policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod();
        }
        else
        {
            // Fail-safe: block cross-origin in production if CLIENT_ORIGIN is missing
            policy.WithOrigins("https://wise-ravens.com", "https://www.wise-ravens.com")
                  .AllowAnyHeader()
                  .WithMethods("GET", "POST", "PUT", "DELETE", "OPTIONS");
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
            DatabaseConfigured = !string.IsNullOrWhiteSpace(builder.Configuration.GetConnectionString("DefaultConnection")),
            DatabaseAvailable = videoDbPersistenceAvailable,
            RequiresDatabase = false,
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
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["X-Frame-Options"] = "DENY";
    context.Response.Headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
    context.Response.Headers["X-XSS-Protection"] = "0"; // CSP is the modern replacement
    if (!app.Environment.IsDevelopment())
    {
        context.Response.Headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
    }
    await next();
});

app.UseCors("ClientPolicy");
app.UseRequestTimeouts();
app.UseAuthentication();
app.UseAuthorization();

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
        FileProvider = new PhysicalFileProvider(frontendDistPath)
    });
}

app.MapControllers();

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
