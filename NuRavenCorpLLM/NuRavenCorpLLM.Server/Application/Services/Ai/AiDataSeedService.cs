using NuRavenCorpLLM.Application.Services.Ai.Repositories;
using NuRavenCorpLLM.Entities.Ai;
using NuRavenCorpLLM.Entities.Ai.DataSources;
using Microsoft.Extensions.DependencyInjection;

namespace NuRavenCorpLLM.Application.Services.Ai;

public class AiDataSeedService : IHostedService
{
    private readonly IServiceScopeFactory _scopeFactory;

    public AiDataSeedService(IServiceScopeFactory scopeFactory) => _scopeFactory = scopeFactory;

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var templates = scope.ServiceProvider.GetRequiredService<IDataQueryTemplateRepository>();
        var registry = scope.ServiceProvider.GetRequiredService<IDataSourceRegistryRepository>();
        var adapters = scope.ServiceProvider.GetRequiredService<IEnumerable<IDataSourceAdapter>>();

        await templates.AddRangeAsync(new[]
        {
            new DataQueryTemplate { Title = "Posts overview", Category = "content", Prompt = "How many posts were published in the last 30 days?", Sources = new[]{ "posts" }, SortOrder = 1 },
            new DataQueryTemplate { Title = "Top performing videos", Category = "content", Prompt = "Show me my top 10 videos by views this month", Sources = new[]{ "videos" }, SortOrder = 2 },
            new DataQueryTemplate { Title = "Radio listenership trend", Category = "audio", Prompt = "Chart the daily listener count for my radio station over the last 14 days", Sources = new[]{ "radio" }, SortOrder = 3 },
            new DataQueryTemplate { Title = "Podcast completion rate", Category = "audio", Prompt = "What is the average completion rate across my podcast episodes?", Sources = new[]{ "podcasts" }, SortOrder = 4 },
            new DataQueryTemplate { Title = "Planner productivity", Category = "personal", Prompt = "How many tasks did I complete each day this week?", Sources = new[]{ "planner" }, SortOrder = 5 },
            new DataQueryTemplate { Title = "WiseCoin earnings", Category = "finance", Prompt = "Show my WiseCoin earnings and spending over the last 30 days", Sources = new[]{ "currency" }, SortOrder = 6 },
            new DataQueryTemplate { Title = "Truth engine summary", Category = "integrity", Prompt = "Summarize truth checks, disputes, and corrections this month", Sources = new[]{ "truth" }, SortOrder = 7 },
            new DataQueryTemplate { Title = "Collaboration activity", Category = "team", Prompt = "Which collaboration rooms were most active this week?", Sources = new[]{ "collaboration" }, SortOrder = 8 },
            new DataQueryTemplate { Title = "User growth", Category = "audience", Prompt = "Show new user signups by day for the past 14 days", Sources = new[]{ "users" }, SortOrder = 9 },
            new DataQueryTemplate { Title = "Cross-platform pulse", Category = "overview", Prompt = "Give me a pulse check across posts, videos, and radio this week", Sources = new[]{ "posts", "videos", "radio" }, SortOrder = 10 }
        }, cancellationToken);

        await registry.AddRangeAsync(adapters.Select(a => new DataSourceRegistry
        {
            Key = a.Key,
            Name = a.DisplayName,
            Description = $"{a.DisplayName} data source",
            Category = GuessCategory(a.Key),
            Capabilities = a.Capabilities,
            Metrics = a.Metrics,
            Dimensions = a.Dimensions,
            IsEnabled = true
        }), cancellationToken);
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    private static string GuessCategory(string key) => key switch
    {
        "currency" => "finance",
        "users" => "user",
        "truth" => "analytics",
        "planner" => "system",
        _ => "content"
    };
}
