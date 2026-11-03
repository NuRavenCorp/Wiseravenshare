using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.ResponseCompression;
using Microsoft.IdentityModel.Tokens;
using NuRavenCorpLLM.Application.Algtorithms;
using NuRavenCorpLLM.Application.Services.Ai;
using NuRavenCorpLLM.Application.Services.Ai.Repositories;
using NuRavenCorpLLM.Application.Services;
using NuRavenCorpLLM.Application.Services.Assistant;
using NuRavenCorpLLM.Core.Interfaces.Repositories.Assistant;
using NuRavenCorpLLM.Entities.Ai.DataSources;
using NuRavenCorpLLM.Hubs;
using NuRavenCorpLLM.Infrastructure.External;
using NuRavenCorpLLM.Infrastructure.Data;
using NuRavenCorpLLM.Infrastructure.Vector;
using NuRavenCorpLLM.Services;
using NuRavenCorpLLM.Server.Data.Repositories.Assistant;
using System.Net;
using System.Text;
var builder = WebApplication.CreateBuilder(args);

var jwtKey = builder.Configuration["Authentication:Jwt:Key"] ?? "NuRavenCorpLLM_ChangeMe_SigningKey_2026";
var jwtIssuer = builder.Configuration["Authentication:Jwt:Issuer"] ?? "wiseravenshare.server";
var jwtAudience = builder.Configuration["Authentication:Jwt:Audience"] ?? "wiseravenshare.client";

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
            ValidateIssuer = true,
            ValidIssuer = jwtIssuer,
            ValidateAudience = true,
            ValidAudience = jwtAudience,
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(2),
        };
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                if (context.HttpContext.Request.Path.StartsWithSegments("/hubs"))
                {
                    var accessToken = context.Request.Query["access_token"];
                    if (!string.IsNullOrWhiteSpace(accessToken))
                    {
                        context.Token = accessToken;
                    }
                }

                return Task.CompletedTask;
            }
        };
    });

// Add services to the container.

builder.Services.AddControllers();
builder.Services.AddSignalR();
builder.Services.AddMemoryCache();
builder.Services.AddCors(options =>
{
    options.AddPolicy("FrontendDev", policy =>
        policy
            .WithOrigins(
                "http://localhost:5173",
                "http://127.0.0.1:5173",
                "https://wise-ravens.com",
                "https://www.wise-ravens.com")
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials());
});
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi


builder.Services.AddScoped<ILlmIntentRouter, LlmIntentRouter>();
builder.Services.AddScoped<IAiDataOrchestrator, AiDataOrchestrator>();
builder.Services.AddScoped<IJournalismBiasDetectionService, JournalismBiasDetectionService>();
builder.Services.AddScoped<IAssistantOrchestrator, AssistantOrchestrator>();
builder.Services.AddScoped<IRagRetriever, RagRetriever>();
builder.Services.AddScoped<IAssistantSafetyService, AssistantSafetyService>();
builder.Services.AddScoped<IAssistantPersonaService, AssistantPersonaService>();
builder.Services.AddScoped<PromptBuilder>();
builder.Services.Configure<FolderKnowledgeOptions>(builder.Configuration.GetSection("FolderKnowledge"));
builder.Services.Configure<OpenAiOptions>(builder.Configuration.GetSection("OpenAI"));
builder.Services.Configure<ModelServingOptions>(builder.Configuration.GetSection("ModelServing"));
builder.Services.Configure<AssistantOptions>(builder.Configuration.GetSection("Assistant"));
builder.Services.Configure<WebGroundingOptions>(builder.Configuration.GetSection("WebGrounding"));
builder.Services.Configure<WhisperOptions>(builder.Configuration.GetSection("Whisper"));
builder.Services.Configure<TtsOptions>(builder.Configuration.GetSection("Tts"));
builder.Services.PostConfigure<OpenAiOptions>(options =>
{
    options.ApiKey = FirstNonEmpty(
        options.ApiKey,
        builder.Configuration["OPENAI_SECRET_KEY"],
        builder.Configuration["OpenAI:SecretKey"],
        builder.Configuration["OpenAI:ApiKey"]) ?? string.Empty;
    options.BaseUrl = FirstNonEmpty(
        options.BaseUrl,
        builder.Configuration["OPENAI_BASE_URL"],
        builder.Configuration["OpenAI:BaseUrl"]) ?? "https://api.openai.com/v1";
    options.ProjectId = FirstNonEmpty(
        options.ProjectId,
        builder.Configuration["OPENAI_PROJECT_ID"],
        builder.Configuration["OpenAI:ProjectId"]);
    options.OrganizationId = FirstNonEmpty(
        options.OrganizationId,
        builder.Configuration["OPENAI_ORGANIZATION_ID"],
        builder.Configuration["OPENAI_ORG_ID"],
        builder.Configuration["OpenAI:OrganizationId"]);
});
builder.Services.PostConfigure<WhisperOptions>(options =>
{
    options.ApiKey = FirstNonEmpty(
        options.ApiKey,
        builder.Configuration["OPENAI_SECRET_KEY"],
        builder.Configuration["OpenAI:SecretKey"]) ?? options.ApiKey;
    options.BaseUrl = FirstNonEmpty(
        options.BaseUrl,
        builder.Configuration["OPENAI_BASE_URL"]) ?? options.BaseUrl;
});
builder.Services.PostConfigure<TtsOptions>(options =>
{
    options.OpenAiKey = FirstNonEmpty(
        options.OpenAiKey,
        builder.Configuration["OPENAI_SECRET_KEY"],
        builder.Configuration["OpenAI:SecretKey"]);
});
builder.Services.PostConfigure<ModelServingOptions>(options =>
{
    options.BaseUrl = FirstNonEmpty(
        options.BaseUrl,
        builder.Configuration["MODEL_SERVE_URL"],
        builder.Configuration["ModelServing:BaseUrl"]) ?? string.Empty;
    options.GeneratePath = FirstNonEmpty(
        options.GeneratePath,
        builder.Configuration["MODEL_SERVE_GENERATE_PATH"],
        builder.Configuration["ModelServing:GeneratePath"]) ?? "/generate";
    options.Enabled = options.Enabled ||
        string.Equals(builder.Configuration["MODEL_SERVE_ENABLED"], "true", StringComparison.OrdinalIgnoreCase);
});
builder.Services.AddDbContext<ApplicationDbContext>(options =>
{
    var connectionString = builder.Configuration.GetConnectionString("DatabaseConnection")
        ?? builder.Configuration.GetConnectionString("DefaultConnection")
        ?? builder.Configuration["ConnectionStrings:DatabaseConnection"]
        ?? builder.Configuration["ConnectionStrings:DefaultConnection"]
        ?? "Host=localhost;Database=NuRavenCorpLLM;Username=postgres;Password=postgres";

    options.UseNpgsql(connectionString);
});

builder.Services.AddSingleton<IDataQueryRepository, InMemoryDataQueryRepository>();
builder.Services.AddSingleton<IDataSourceRegistryRepository, InMemoryDataSourceRegistryRepository>();
builder.Services.AddSingleton<IDataQueryTemplateRepository, InMemoryDataQueryTemplateRepository>();

builder.Services.AddHttpClient<OpenAiClient>();
builder.Services.AddHttpClient<HybridLlmGateway>();
builder.Services.AddScoped<ILlmGateway>(sp => sp.GetRequiredService<HybridLlmGateway>());
builder.Services.AddScoped<IPgVectorStore, PgVectorStore>();
builder.Services.AddScoped<IEmbeddingService, EmbeddingService>();
builder.Services.AddScoped<IAssistantKnowledgeRepository, AssistantKnowledgeRepository>();
builder.Services.AddScoped<IAssistantConversationRepository, AssistantConversationRepository>();
builder.Services.AddScoped<IAssistantMessageRepository, AssistantMessageRepository>();
builder.Services.AddScoped<IAssistantFeedbackRepository, AssistantFeedbackRepository>();
builder.Services.AddScoped<IAssistantLearningSampleRepository, AssistantLearningSampleRepository>();
builder.Services.AddHttpClient<ISpeechToTextService, SpeechToTextService>();
builder.Services.AddHttpClient<ITextToSpeechService, TextToSpeechService>();
builder.Services.AddHttpClient<IWebGroundingService, WebGroundingService>();

builder.Services.AddScoped<IDataSourceAdapter, PostsDataSource>();
builder.Services.AddScoped<IDataSourceAdapter, VideosDataSource>();
builder.Services.AddScoped<IDataSourceAdapter, RadioDataSource>();
builder.Services.AddScoped<IDataSourceAdapter, PodcastsDataSource>();
builder.Services.AddScoped<IDataSourceAdapter, PlannerDataSource>();
builder.Services.AddScoped<IDataSourceAdapter, CurrencyDataSource>();
builder.Services.AddScoped<IDataSourceAdapter, TruthDataSource>();
builder.Services.AddScoped<IDataSourceAdapter, CollaborationDataSource>();
builder.Services.AddScoped<IDataSourceAdapter, UsersDataSource>();
builder.Services.AddScoped<IChatterLearningService, ChatterLearningService>();
builder.Services.AddScoped<IFeedbackLearningService, FeedbackLearningService>();

builder.Services.AddHostedService<AiDataSeedService>();
builder.Services.AddHostedService<FolderKnowledgeIngestionService>();
builder.Services.AddHostedService<ChatterLearningBackgroundService>();

var app = builder.Build();

app.UseDefaultFiles();
app.UseStaticFiles();
app.MapStaticAssets();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    // Build a simple HTTP request pipeline (omitting OpenAI).
    // - Creates an HttpClient with sensible defaults
    // - Performs a test request to the configured GenerativeAI endpoint (fallback to example URL)
    var endpoint = app.Configuration["GenerativeAI:Endpoint"] ?? "https://example.com/api/health";

    object value = Task.Run(async () =>
    {
        using var handler = new SocketsHttpHandler
        {
            PooledConnectionLifetime = TimeSpan.FromMinutes(5),
            AutomaticDecompression = DecompressionMethods.GZip | DecompressionMethods.Deflate
        };

        using var http = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(30) };
        http.DefaultRequestHeaders.UserAgent.ParseAdd("NuRavenCorpLLM/Dev");
        http.DefaultRequestHeaders.Accept.Add(new System.Net.Http.Headers.MediaTypeWithQualityHeaderValue("application/json"));

        async Task<HttpResponseMessage> SendWithRetriesAsync(HttpRequestMessage req, int maxRetries = 3)
        {
            var delay = TimeSpan.FromSeconds(1);
            for (int i = 0; i < maxRetries; i++)
            {
                try
                {
                    var resp = await http.SendAsync(req);
                    if (resp.IsSuccessStatusCode || (int)resp.StatusCode < 500) return resp;
                }
                catch (HttpRequestException) when (i < maxRetries - 1)
                {
                    // transient network error - retry
                }

                await Task.Delay(delay);
                delay = delay * 2;
            }

            return new HttpResponseMessage(System.Net.HttpStatusCode.ServiceUnavailable)
            {
                ReasonPhrase = "Retries exhausted"
            };
        }

        using var request = new HttpRequestMessage(HttpMethod.Get, endpoint);
        var response = await SendWithRetriesAsync(request);
        var content = await response.Content.ReadAsStringAsync();

        app.Logger.LogInformation("Dev HTTP pipeline test to {Endpoint} returned {StatusCode}", endpoint, response.StatusCode);

        return new
        {
            Endpoint = endpoint,
            StatusCode = response.StatusCode,
            BodySnippet = content?.Length > 200 ? content.Substring(0, 200) : content
        };
    }).GetAwaiter().GetResult();
}

app.UseHttpsRedirection();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapHub<AssistantHub>("/hubs/assistant");
app.MapHub<AiDataHub>("/hubs/ai-data");
// Backward-compatible hub aliases used by existing deployed frontends.
app.MapHub<AssistantHub>("/hubs/conversation");
app.MapHub<AiDataHub>("/hubs/analytics");
app.MapHub<AiDataHub>("/hubs/clients");
app.MapHub<AiDataHub>("/hubs/ingestion");
app.MapHub<AiDataHub>("/hubs/learning");

app.MapFallback(async context =>
{
    var path = context.Request.Path;
    if (path.StartsWithSegments("/api") || path.StartsWithSegments("/hubs"))
    {
        context.Response.StatusCode = StatusCodes.Status404NotFound;
        return;
    }

    await context.Response.SendFileAsync(Path.Combine(app.Environment.WebRootPath, "index.html"));
});

app.Run();

static string? FirstNonEmpty(params string?[] values)
{
    foreach (var value in values)
    {
        if (!string.IsNullOrWhiteSpace(value))
        {
            return value.Trim();
        }
    }

    return null;
}
