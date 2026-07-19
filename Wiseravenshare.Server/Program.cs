// Wiseravenshare.Server/Program.cs
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.Data;
using System.Reflection;
using System.Text;
using System.Text.Json.Serialization;
using Wiseravenshare.Server.Filters;
using Wiseravenshare.Server.Hubs;
using Wiseravenshare.Server.Middleware;
using Wiseravenshare.Server.Infrastructure.Data;
using Wiseravenshare.Server.Infrastructure.Data.Repositories;
using Wiseravenshare.Server.Infrastructure.External;
using Wiseravenshare.Server.Interfaces.Repositories;
using Wiseravenshare.Server.Services;

var builder = WebApplication.CreateBuilder(args);

// Add services
builder.Services.AddControllers(options =>
{
    options.Filters.Add<GlobalExceptionFilter>();
    options.Filters.Add<ValidationFilter>();
})
.AddJsonOptions(options =>
{
    options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
    options.JsonSerializerOptions.ReferenceHandler = ReferenceHandler.IgnoreCycles;
    options.JsonSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
});

builder.Services.AddEndpointsApiExplorer();

// Database
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection"))
        .UseQueryTrackingBehavior(QueryTrackingBehavior.NoTracking));

// Repositories
builder.Services.AddScoped(typeof(IRepository<>), typeof(Repository<>));
builder.Services.AddScoped<IUserRepository, UserRepository>();
builder.Services.AddScoped<IPostRepository, PostRepository>();
builder.Services.AddScoped<ITruthRepository, TruthRepository>();
builder.Services.AddScoped<IAgentRepository, AgentRepository>();

// Services
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<IPostService, PostService>();
builder.Services.AddScoped<IVideoService, VideoService>();
builder.Services.AddScoped<ISubscriptionService, SubscriptionService>();
builder.Services.AddScoped<ITruthService, TruthService>();
builder.Services.AddScoped<IEvolutionService, EvolutionService>();
builder.Services.AddScoped<IEmailService, NoopEmailService>();
builder.Services.AddScoped<IDataSeeder, DataSeeder>();

// External Services
builder.Services.AddScoped<IOpenAIService, OpenAIService>();

// Authentication
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(builder.Configuration["Jwt:Key"] ?? "default-secret-key-32-chars-minimum")),
            ValidateIssuer = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"] ?? "wiseravenshare.com",
            ValidateAudience = true,
            ValidAudience = builder.Configuration["Jwt:Audience"] ?? "wiseravenshare.com",
            ValidateLifetime = true,
            ClockSkew = TimeSpan.Zero
        };

        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                var accessToken = context.Request.Query["access_token"];
                var path = context.HttpContext.Request.Path;
                if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/hubs"))
                {
                    context.Token = accessToken;
                }
                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization();

// SignalR
builder.Services.AddSignalR(options =>
{
    options.EnableDetailedErrors = true;
    options.MaximumReceiveMessageSize = 1024 * 1024;
});

// CORS
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowReactApp", policy =>
    {
        policy.WithOrigins(
                "http://localhost:3000",
            "http://localhost:5173",
                "https://wiseravenshare.com")
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

// Health checks
builder.Services.AddHealthChecks();

// Rate limiting
builder.Services.AddRateLimiter(options =>
{
    options.AddFixedWindowLimiter("fixed", opt =>
    {
        opt.PermitLimit = 100;
        opt.Window = TimeSpan.FromMinutes(1);
        opt.QueueProcessingOrder = System.Threading.RateLimiting.QueueProcessingOrder.OldestFirst;
        opt.QueueLimit = 10;
    });
});

// Memory cache
builder.Services.AddMemoryCache();

// Response compression
builder.Services.AddResponseCompression(options =>
{
    options.EnableForHttps = true;
});

// Background services
builder.Services.AddHostedService<EvolutionBackgroundService>();
builder.Services.AddHostedService<TruthVerificationBackgroundService>();

// Application insights
builder.Services.AddApplicationInsightsTelemetry();

var app = builder.Build();

// Configure pipeline
if (app.Environment.IsDevelopment())
{
    app.UseDeveloperExceptionPage();
}
else
{
    app.UseExceptionHandler("/Home/Error");
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseResponseCompression();
app.UseRateLimiter();

app.UseCors("AllowReactApp");
app.UseAuthentication();
app.UseAuthorization();

app.UseMiddleware<RequestLoggingMiddleware>();

app.MapHub<EvolutionHub>("/hubs/evolution");
app.MapHub<NotificationHub>("/hubs/notification");

app.MapHealthChecks("/health");

app.MapControllers();

// Ensure database is created and apply migrations
using (var scope = app.Services.CreateScope())
{
    var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("Startup");
    var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

    try
    {
        await dbContext.Database.MigrateAsync();
        await EnsureBillingSchemaAsync(dbContext);

        // Seed data if needed
        if (!await dbContext.Users.AnyAsync())
        {
            var seeder = scope.ServiceProvider.GetRequiredService<IDataSeeder>();
            await seeder.SeedAsync();
        }
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "Migration/seed failed. Attempting schema creation fallback.");

        try
        {
            await using var connection = dbContext.Database.GetDbConnection();
            if (connection.State != ConnectionState.Open)
            {
                await connection.OpenAsync();
            }

            await using (var existsCommand = connection.CreateCommand())
            {
                existsCommand.CommandText = "SELECT to_regclass('public.\"Users\"')::text";
                var usersTableName = await existsCommand.ExecuteScalarAsync();

                if (usersTableName == null || usersTableName == DBNull.Value)
                {
                    var createScript = dbContext.Database.GenerateCreateScript();
                    await using var createCommand = connection.CreateCommand();
                    createCommand.CommandText = createScript;
                    await createCommand.ExecuteNonQueryAsync();
                }
            }

            await EnsureBillingSchemaAsync(dbContext);

            if (!await dbContext.Users.AnyAsync())
            {
                var seeder = scope.ServiceProvider.GetRequiredService<IDataSeeder>();
                await seeder.SeedAsync();
            }

            logger.LogInformation("Schema creation fallback completed.");
        }
        catch (Exception ensureEx)
        {
            logger.LogWarning(ensureEx, "Skipping startup migration/seed due to database initialization issues.");
        }
    }
}

static async Task EnsureBillingSchemaAsync(AppDbContext dbContext)
{
    const string sql = @"
CREATE TABLE IF NOT EXISTS ""UserSubscriptions"" (
    ""Id"" uuid NOT NULL,
    ""UserId"" uuid NOT NULL,
    ""StripeCustomerId"" character varying(100) NOT NULL,
    ""StripeSubscriptionId"" character varying(100) NULL,
    ""StripePriceId"" character varying(100) NULL,
    ""Status"" character varying(50) NOT NULL,
    ""CurrentPeriodEnd"" timestamp with time zone NULL,
    ""CancelAtPeriodEnd"" boolean NOT NULL,
    ""LastWebhookEventId"" character varying(100) NULL,
    ""CreatedAt"" timestamp with time zone NOT NULL,
    ""UpdatedAt"" timestamp with time zone NOT NULL,
    ""IsDeleted"" boolean NOT NULL,
    ""DeletedAt"" timestamp with time zone NULL,
    CONSTRAINT ""PK_UserSubscriptions"" PRIMARY KEY (""Id""),
    CONSTRAINT ""FK_UserSubscriptions_Users_UserId"" FOREIGN KEY (""UserId"") REFERENCES ""Users"" (""Id"") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS ""IX_UserSubscriptions_UserId"" ON ""UserSubscriptions"" (""UserId"");
CREATE UNIQUE INDEX IF NOT EXISTS ""IX_UserSubscriptions_StripeCustomerId"" ON ""UserSubscriptions"" (""StripeCustomerId"");
CREATE UNIQUE INDEX IF NOT EXISTS ""IX_UserSubscriptions_StripeSubscriptionId"" ON ""UserSubscriptions"" (""StripeSubscriptionId"") WHERE ""StripeSubscriptionId"" IS NOT NULL;";

    await dbContext.Database.ExecuteSqlRawAsync(sql);
}

app.Run();