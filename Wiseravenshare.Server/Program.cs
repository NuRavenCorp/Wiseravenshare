using Wiseravenshare.Server.Services;
using Npgsql;

var builder = WebApplication.CreateBuilder(args);

// ── Configuration ────────────────────────────────────────────────────────────
var clientOrigin = builder.Configuration["CLIENT_ORIGIN"];
var defaultConnectionString = builder.Configuration.GetConnectionString("DefaultConnection");

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
            policy.WithOrigins("https://wiseravenshare.com", "https://www.wiseravenshare.com")
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
        await using var command = new NpgsqlCommand("SELECT 1", connection);
        var result = await command.ExecuteScalarAsync();
        return Results.Ok(new { status = "ok", database = "postgres", result });
    }
    catch (Exception ex)
    {
        return Results.Problem($"Database connectivity check failed: {ex.Message}", statusCode: StatusCodes.Status503ServiceUnavailable);
    }
});

app.Run();
