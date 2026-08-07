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
        TrustServerCertificate = true
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

// ── Configuration ────────────────────────────────────────────────────────────
var clientOrigin = builder.Configuration["CLIENT_ORIGIN"];
var configuredClientOrigins = (clientOrigin ?? string.Empty)
    .Split(new[] { ',', ';', ' ' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
    .Distinct(StringComparer.OrdinalIgnoreCase)
    .ToArray();
var defaultConnectionString = NormalizeConnectionString(builder.Configuration.GetConnectionString("DefaultConnection") ?? string.Empty);

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
builder.Services.AddScoped<IPostService, PostService>();
builder.Services.AddScoped<ITruthService, TruthService>();
builder.Services.AddScoped<ISubscriptionService, SubscriptionService>();
builder.Services.AddScoped<IOpenAIService, OpenAIService>();
builder.Services.AddScoped<IYouTubeService, YouTubeService>();
builder.Services.AddScoped<SyntheticEngagementService>();
builder.Services.AddHttpClient<ISocialPlatformService, SocialPlatformService>();
builder.Services.AddSingleton<UserStore>();
builder.Services.AddSingleton<GrowthService>();
builder.Services.AddSingleton<VideoLibraryStore>();
builder.Services.AddSingleton<PersistenceDiagnosticsCache>();
builder.Services.AddHttpClient();
builder.Services.AddHttpClient<INewsAggregationService, NewsAggregationService>();
builder.Services.AddSingleton<IReminderNotificationService, ReminderNotificationService>();

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

if (app.Environment.IsProduction() && !app.Configuration.GetValue("Authentication:AllowSelfRegistration", false))
{
    app.Logger.LogWarning("Authentication:AllowSelfRegistration is disabled in production. New user sign-ups will return 403.");
}

using (var scope = app.Services.CreateScope())
{
    var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    try
    {
        await dbContext.Database.MigrateAsync();
    }
    catch (Exception ex)
    {
        app.Logger.LogCritical(ex, "Automatic EF migration failed during startup. Service will continue with existing schema.");
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
            ActiveTable = "app_data.ravensight_videos",
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
app.MapControllers();

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
            "app_data.ravensight_videos",
            "public.ravensight_videos",
            "app_data.ravensight_video_comments",
            "public.ravensight_video_comments"
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
        var hasVideoTable = actualTables.Contains("app_data.ravensight_videos") || actualTables.Contains("public.ravensight_videos");
        var hasVideoCommentsTable = actualTables.Contains("app_data.ravensight_video_comments") || actualTables.Contains("public.ravensight_video_comments");

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
            schema = new
            {
                fullEfSchemaReady = missingEfTables.Length == 0,
                missingEfTables,
                hasUserRetentionTable = hasUserTable,
                hasVideoRetentionTable = hasVideoTable,
                hasVideoCommentsRetentionTable = hasVideoCommentsTable,
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
