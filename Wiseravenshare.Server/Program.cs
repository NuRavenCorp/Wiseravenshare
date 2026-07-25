using Wiseravenshare.Server.Services;
using Npgsql;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Text;

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
builder.Services.AddScoped<IYouTubeService, YouTubeService>();
builder.Services.AddHttpClient<ISocialPlatformService, SocialPlatformService>();
builder.Services.AddSingleton<UserStore>();
builder.Services.AddSingleton<VideoLibraryStore>();
builder.Services.AddHttpClient();
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
        if (!string.IsNullOrWhiteSpace(clientOrigin))
        {
            policy.WithOrigins(clientOrigin)
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

using (var scope = app.Services.CreateScope())
{
    var userStore = scope.ServiceProvider.GetRequiredService<UserStore>();
    var videoLibraryStore = scope.ServiceProvider.GetRequiredService<VideoLibraryStore>();

    var userDbPersistenceAvailable = userStore.IsDatabasePersistenceAvailable();
    var videoDbPersistenceAvailable = await videoLibraryStore.IsDatabasePersistenceAvailableAsync();

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

        const string schemaCheckSql = @"
SELECT
    (to_regclass('app_data.app_users') IS NOT NULL OR to_regclass('public.app_users') IS NOT NULL) AS app_users_exists,
    (to_regclass('app_data.ravensight_videos') IS NOT NULL OR to_regclass('public.ravensight_videos') IS NOT NULL) AS ravensight_videos_exists,
    (to_regclass('app_data.ravensight_video_comments') IS NOT NULL OR to_regclass('public.ravensight_video_comments') IS NOT NULL) AS ravensight_video_comments_exists;";

        await using var schemaCommand = new NpgsqlCommand(schemaCheckSql, connection);
        await using var reader = await schemaCommand.ExecuteReaderAsync();

        var appUsersExists = false;
        var ravensightVideosExists = false;
        var ravensightVideoCommentsExists = false;

        if (await reader.ReadAsync())
        {
            appUsersExists = reader.GetBoolean(0);
            ravensightVideosExists = reader.GetBoolean(1);
            ravensightVideoCommentsExists = reader.GetBoolean(2);
        }

        return Results.Ok(new
        {
            status = "ok",
            database = "postgres",
            result,
            schema = new
            {
                appUsersExists,
                ravensightVideosExists,
                ravensightVideoCommentsExists
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
