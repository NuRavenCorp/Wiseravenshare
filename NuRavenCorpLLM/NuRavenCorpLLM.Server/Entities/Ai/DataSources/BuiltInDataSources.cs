namespace NuRavenCorpLLM.Entities.Ai.DataSources;

public class VideosDataSource : IDataSourceAdapter
{
    public string Key => "videos";
    public string DisplayName => "Videos (Ravensight)";
    public string[] Capabilities => new[] { "count", "top", "trend", "time_series", "compare" };
    public string[] Metrics => new[] { "count", "views", "watch_through", "likes" };
    public string[] Dimensions => new[] { "day", "creator", "platform", "duration_band" };
    public Task<DataResult> QueryAsync(DataQuerySpec spec, CancellationToken ct = default) => Task.FromResult(SyntheticDataSourceBuilder.Build(Key, DisplayName, spec));
}

public class RadioDataSource : IDataSourceAdapter
{
    public string Key => "radio";
    public string DisplayName => "Radio Stations";
    public string[] Capabilities => new[] { "count", "top", "trend", "time_series", "compare" };
    public string[] Metrics => new[] { "listeners", "sessions", "peak", "duration" };
    public string[] Dimensions => new[] { "day", "station", "daypart", "genre" };
    public Task<DataResult> QueryAsync(DataQuerySpec spec, CancellationToken ct = default) => Task.FromResult(SyntheticDataSourceBuilder.Build(Key, DisplayName, spec));
}

public class PodcastsDataSource : IDataSourceAdapter
{
    public string Key => "podcasts";
    public string DisplayName => "Podcasts";
    public string[] Capabilities => new[] { "count", "top", "trend", "time_series", "aggregate" };
    public string[] Metrics => new[] { "episodes", "downloads", "avg_completion", "subs" };
    public string[] Dimensions => new[] { "day", "show", "topic" };
    public Task<DataResult> QueryAsync(DataQuerySpec spec, CancellationToken ct = default) => Task.FromResult(SyntheticDataSourceBuilder.Build(Key, DisplayName, spec));
}

public class PlannerDataSource : IDataSourceAdapter
{
    public string Key => "planner";
    public string DisplayName => "Wise Planner";
    public string[] Capabilities => new[] { "count", "trend", "time_series", "distribution", "aggregate" };
    public string[] Metrics => new[] { "goals_created", "tasks_done", "on_time", "focus_minutes" };
    public string[] Dimensions => new[] { "day", "status", "priority" };
    public Task<DataResult> QueryAsync(DataQuerySpec spec, CancellationToken ct = default) => Task.FromResult(SyntheticDataSourceBuilder.Build(Key, DisplayName, spec));
}

public class CurrencyDataSource : IDataSourceAdapter
{
    public string Key => "currency";
    public string DisplayName => "WiseCoin";
    public string[] Capabilities => new[] { "count", "aggregate", "trend", "time_series", "distribution" };
    public string[] Metrics => new[] { "earned", "spent", "staked", "burned" };
    public string[] Dimensions => new[] { "day", "type", "user" };
    public Task<DataResult> QueryAsync(DataQuerySpec spec, CancellationToken ct = default) => Task.FromResult(SyntheticDataSourceBuilder.Build(Key, DisplayName, spec));
}

public class TruthDataSource : IDataSourceAdapter
{
    public string Key => "truth";
    public string DisplayName => "Truth Engine";
    public string[] Capabilities => new[] { "count", "top", "trend", "time_series", "distribution" };
    public string[] Metrics => new[] { "claims_checked", "disputes", "corrections" };
    public string[] Dimensions => new[] { "day", "category", "verdict" };
    public Task<DataResult> QueryAsync(DataQuerySpec spec, CancellationToken ct = default) => Task.FromResult(SyntheticDataSourceBuilder.Build(Key, DisplayName, spec));
}

public class CollaborationDataSource : IDataSourceAdapter
{
    public string Key => "collaboration";
    public string DisplayName => "Collaboration";
    public string[] Capabilities => new[] { "count", "top", "trend", "time_series", "distribution" };
    public string[] Metrics => new[] { "rooms_active", "messages", "files", "actions" };
    public string[] Dimensions => new[] { "day", "room", "user" };
    public Task<DataResult> QueryAsync(DataQuerySpec spec, CancellationToken ct = default) => Task.FromResult(SyntheticDataSourceBuilder.Build(Key, DisplayName, spec));
}

public class UsersDataSource : IDataSourceAdapter
{
    public string Key => "users";
    public string DisplayName => "Users";
    public string[] Capabilities => new[] { "count", "trend", "time_series", "compare", "distribution" };
    public string[] Metrics => new[] { "signups", "active", "retention", "verified" };
    public string[] Dimensions => new[] { "day", "region", "tier" };
    public Task<DataResult> QueryAsync(DataQuerySpec spec, CancellationToken ct = default) => Task.FromResult(SyntheticDataSourceBuilder.Build(Key, DisplayName, spec));
}

internal static class SyntheticDataSourceBuilder
{
    public static DataResult Build(string key, string display, DataQuerySpec spec)
    {
        var started = DateTime.UtcNow;
        var seed = Math.Abs(HashCode.Combine(key, spec.FreeText ?? string.Empty, spec.Metric ?? string.Empty));
        var random = new Random(seed);
        var metric = spec.Metric ?? "count";
        var dimension = spec.Dimension ?? "day";

        var result = new DataResult
        {
            SourceKey = key,
            Metric = metric,
            Dimension = dimension
        };

        switch (spec.Intent)
        {
            case "top":
                result.Rows = Enumerable.Range(1, spec.Limit)
                    .Select(i => new Dictionary<string, object>
                    {
                        ["rank"] = i,
                        ["name"] = $"{display} item {i}",
                        [metric] = random.Next(40, 5000),
                        ["score"] = random.Next(50, 100),
                        ["createdAt"] = DateTime.UtcNow.AddDays(-i).ToString("O")
                    })
                    .ToList();
                result.RowsReturned = result.Rows.Count;
                result.Total = result.RowsReturned;
                result.Summary = $"Top {result.RowsReturned} records from {display}.";
                break;

            case "time_series":
            case "trend":
                var from = spec.From?.Date ?? DateTime.UtcNow.Date.AddDays(-13);
                var to = spec.To?.Date ?? DateTime.UtcNow.Date;
                var days = Math.Max(1, (to - from).Days + 1);
                result.Points = Enumerable.Range(0, days)
                    .Select(i => from.AddDays(i))
                    .Select(date => new DataPoint(date.ToString("yyyy-MM-dd"), random.Next(20, 1200)))
                    .ToList();
                result.RowsReturned = result.Points.Count;
                result.Total = result.Points.Sum(x => x.Value);
                result.Summary = $"{display} trend for {result.Points.Count} periods.";
                break;

            case "distribution":
                var buckets = new[] { "A", "B", "C", "D", "E" };
                result.Points = buckets
                    .Select(label => new DataPoint(label, random.Next(10, 500)))
                    .ToList();
                result.RowsReturned = result.Points.Count;
                result.Total = result.Points.Sum(x => x.Value);
                result.Summary = $"{display} distribution by {dimension}.";
                break;

            case "compare":
            case "aggregate":
            case "latest":
            case "count":
            default:
                result.Total = random.Next(100, 20000);
                result.RowsReturned = 1;
                result.Summary = $"{display} {metric}: {result.Total:n0}.";
                break;
        }

        result.Elapsed = DateTime.UtcNow - started;
        return result;
    }
}
