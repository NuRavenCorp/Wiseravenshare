using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.ResponseCompression;
using Microsoft.Identity.Web;
using NuRavenCorpLLM.Application.Services.Ai;
using NuRavenCorpLLM.Application.Services.Ai.Repositories;
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
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddMicrosoftIdentityWebApi(builder.Configuration.GetSection("AzureAd"));

// Add services to the container.

builder.Services.AddControllers();
builder.Services.AddSignalR();
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi


builder.Services.AddScoped<ILlmIntentRouter, LlmIntentRouter>();
builder.Services.AddScoped<IAiDataOrchestrator, AiDataOrchestrator>();
builder.Services.Configure<FolderKnowledgeOptions>(builder.Configuration.GetSection("FolderKnowledge"));
builder.Services.Configure<OpenAiOptions>(builder.Configuration.GetSection("OpenAI"));
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
builder.Services.AddScoped<ILlmGateway>(sp => sp.GetRequiredService<OpenAiClient>());
builder.Services.AddScoped<IPgVectorStore, PgVectorStore>();
builder.Services.AddScoped<IEmbeddingService, EmbeddingService>();
builder.Services.AddScoped<IAssistantKnowledgeRepository, AssistantKnowledgeRepository>();

builder.Services.AddScoped<IDataSourceAdapter, PostsDataSource>();
builder.Services.AddScoped<IDataSourceAdapter, VideosDataSource>();
builder.Services.AddScoped<IDataSourceAdapter, RadioDataSource>();
builder.Services.AddScoped<IDataSourceAdapter, PodcastsDataSource>();
builder.Services.AddScoped<IDataSourceAdapter, PlannerDataSource>();
builder.Services.AddScoped<IDataSourceAdapter, CurrencyDataSource>();
builder.Services.AddScoped<IDataSourceAdapter, TruthDataSource>();
builder.Services.AddScoped<IDataSourceAdapter, CollaborationDataSource>();
builder.Services.AddScoped<IDataSourceAdapter, UsersDataSource>();

builder.Services.AddHostedService<AiDataSeedService>();
builder.Services.AddHostedService<FolderKnowledgeIngestionService>();

var app = builder.Build();

app.UseDefaultFiles();
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

app.MapFallbackToFile("/index.html");

app.Run();
