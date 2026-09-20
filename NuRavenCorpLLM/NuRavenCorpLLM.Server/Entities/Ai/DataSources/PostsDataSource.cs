// Application/Services/Ai/DataSources/PostsDataSource.cs
namespace NuRavenCorpLLM.Entities.Ai.DataSources;

public class PostsDataSource : IDataSourceAdapter
{
    public string Key => "posts";
    public string DisplayName => "Posts & Feed";
    public string[] Capabilities => new[] { "count", "top", "trend", "time_series", "distribution" };
    public string[] Metrics => new[] { "count", "likes", "reposts", "comments", "views", "engagement_rate" };
    public string[] Dimensions => new[] { "day", "author", "type", "hashtag", "truth_score_band" };

    public Task<DataResult> QueryAsync(DataQuerySpec spec, CancellationToken ct = default) =>
        Task.FromResult(SyntheticDataSourceBuilder.Build(Key, DisplayName, spec));
}