using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Npgsql;
using Wiseravenshare.Server.Infrastructure.Data;

namespace Wiseravenshare.Server.Services;

// ─── DTOs ─────────────────────────────────────────────────────────────────
public record ContentTrendingItemDto(
    Guid ContentId,
    string ContentType,           // Post, Video, Music, Story
    string Title,
    Guid CreatorId,
    string CreatorName,
    int EngagementCount,          // likes + views + shares
    int ViewCount,
    int LikeCount,
    int ShareCount,
    decimal ViralCoefficient,     // engagement velocity metric
    decimal TrendingScore,        // 0-1 combined score
    string[] Tags,
    DateTime CreatedAtUtc
);

public record ContentCrawlerSummaryDto(
    IReadOnlyList<ContentTrendingItemDto> TrendingContent,
    IReadOnlyList<string> EmergingTopics,
    IReadOnlyList<(string Creator, int Followers, decimal EngagementRate)> ViralCreators,
    int TotalIndexedContent,
    int TotalEngagementEvents,
    DateTime GeneratedAtUtc
);

// ─── Interface ────────────────────────────────────────────────────────────
public interface IContentCrawlerService
{
    Task IngestUserContentAsync(
        Guid contentId, string contentType, string title, Guid creatorId, string creatorName,
        string[]? tags, string? countryCode, CancellationToken ct = default);

    Task UpdateEngagementAsync(
        Guid contentId, int views, int likes, int shares, CancellationToken ct = default);

    Task<ContentCrawlerSummaryDto> GetTrendingAsync(
        string? contentType = null, string? countryCode = null, int topN = 12,
        CancellationToken ct = default);

    Task<IReadOnlyList<string>> GetEmergingTopicsAsync(
        string? countryCode = null, CancellationToken ct = default);

    Task RecalculateTrendScoresAsync(CancellationToken ct = default);
}

// ─── Implementation ───────────────────────────────────────────────────────
public sealed class ContentCrawlerService : IContentCrawlerService
{
    private readonly AppDbContext _db;
    private readonly IMemoryCache _cache;
    private const int CacheDurationMinutes = 5;
    private const string TrendingCacheKey = "content_trending_{0}_{1}";
    private const string TopicsCacheKey = "content_topics_{0}";

    public ContentCrawlerService(AppDbContext db, IMemoryCache cache)
    {
        _db = db;
        _cache = cache;
    }

    public async Task IngestUserContentAsync(
        Guid contentId, string contentType, string title, Guid creatorId, string creatorName,
        string[]? tags, string? countryCode, CancellationToken ct = default)
    {
        await EnsureCrawlerTablesAsync(ct);

        const string sql = @"
INSERT INTO app_data.content_crawler_catalog (
    content_id, content_type, title, creator_id, creator_name, tags,
    view_count, like_count, share_count, engagement_count, viral_coefficient,
    trending_score, country_code, created_at, updated_at
)
VALUES (@cid, @ctype, @title, @crid, @crname, @tags::jsonb,
        0, 0, 0, 0, 0, 0, @country, NOW(), NOW())
ON CONFLICT (content_id) DO UPDATE SET
    updated_at = NOW()
;";

        try
        {
            await using var connection = await OpenNewConnectionAsync(ct);
            await using var command = new NpgsqlCommand(sql, connection);
            command.Parameters.AddWithValue("cid", contentId);
            command.Parameters.AddWithValue("ctype", contentType);
            command.Parameters.AddWithValue("title", title ?? string.Empty);
            command.Parameters.AddWithValue("crid", creatorId);
            command.Parameters.AddWithValue("crname", creatorName ?? string.Empty);
            command.Parameters.AddWithValue("tags", JsonSerializer.Serialize(tags ?? Array.Empty<string>()));
            command.Parameters.AddWithValue("country", (object?)(countryCode?.ToUpperInvariant()) ?? "GLOBAL");

            await command.ExecuteNonQueryAsync(ct);

            // Invalidate cache
            InvalidateCache(contentType, countryCode);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Failed to ingest content: {ex.Message}");
        }
    }

    public async Task UpdateEngagementAsync(
        Guid contentId, int views, int likes, int shares, CancellationToken ct = default)
    {
        const string sql = @"
UPDATE app_data.content_crawler_catalog
SET view_count = @views,
    like_count = @likes,
    share_count = @shares,
    engagement_count = @views + @likes + @shares,
    updated_at = NOW()
WHERE content_id = @cid;
";

        try
        {
            await using var connection = await OpenNewConnectionAsync(ct);
            await using var command = new NpgsqlCommand(sql, connection);
            command.Parameters.AddWithValue("cid", contentId);
            command.Parameters.AddWithValue("views", views);
            command.Parameters.AddWithValue("likes", likes);
            command.Parameters.AddWithValue("shares", shares);

            await command.ExecuteNonQueryAsync(ct);

            // Invalidate all caches since engagement changed
            _cache.Remove(string.Format(TrendingCacheKey, "Post", "GLOBAL"));
            _cache.Remove(string.Format(TrendingCacheKey, "Video", "GLOBAL"));
            _cache.Remove(string.Format(TrendingCacheKey, "Music", "GLOBAL"));
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Failed to update engagement: {ex.Message}");
        }
    }

    public async Task<ContentCrawlerSummaryDto> GetTrendingAsync(
        string? contentType = null, string? countryCode = null, int topN = 12,
        CancellationToken ct = default)
    {
        var cacheKey = string.Format(TrendingCacheKey, contentType ?? "All", countryCode ?? "GLOBAL");
        if (_cache.TryGetValue(cacheKey, out object? cachedObj) && cachedObj is ContentCrawlerSummaryDto cached)
            return cached;

        await EnsureCrawlerTablesAsync(ct);

        const string sql = @"
SELECT
    content_id, content_type, title, creator_id, creator_name,
    view_count, like_count, share_count, engagement_count,
    viral_coefficient, trending_score, tags, created_at
FROM app_data.content_crawler_catalog
WHERE (@ctype::text IS NULL OR content_type = @ctype)
  AND (@country IS NULL OR country_code = @country)
  AND created_at > NOW() - INTERVAL '7 days'
ORDER BY trending_score DESC, engagement_count DESC, created_at DESC
LIMIT @topn;
";

        var trendingContent = new List<ContentTrendingItemDto>();

        try
        {
            await using var connection = await OpenNewConnectionAsync(ct);
            await using var command = new NpgsqlCommand(sql, connection);
            command.Parameters.AddWithValue("ctype", (object?)(contentType?.Trim()) ?? DBNull.Value);
            command.Parameters.AddWithValue("country", (object?)(countryCode?.ToUpperInvariant()) ?? DBNull.Value);
            command.Parameters.AddWithValue("topn", topN);

            await using var reader = await command.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                var tagsJson = reader.IsDBNull(11) ? "[]" : reader.GetString(11);
                var tags = JsonSerializer.Deserialize<string[]>(tagsJson) ?? Array.Empty<string>();

                trendingContent.Add(new ContentTrendingItemDto(
                    ContentId: reader.GetGuid(0),
                    ContentType: reader.GetString(1),
                    Title: reader.GetString(2),
                    CreatorId: reader.GetGuid(3),
                    CreatorName: reader.GetString(4),
                    ViewCount: reader.GetInt32(5),
                    LikeCount: reader.GetInt32(6),
                    ShareCount: reader.GetInt32(7),
                    EngagementCount: reader.GetInt32(8),
                    ViralCoefficient: Convert.ToDecimal(reader.GetDouble(9)),
                    TrendingScore: Convert.ToDecimal(reader.GetDouble(10)),
                    Tags: tags,
                    CreatedAtUtc: reader.GetDateTime(12).ToUniversalTime()
                ));
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Failed to fetch trending content: {ex.Message}");
            return new ContentCrawlerSummaryDto(
                new List<ContentTrendingItemDto>(),
                new List<string>(),
                new List<(string, int, decimal)>(),
                0, 0, DateTime.UtcNow);
        }

        // Extract emerging topics from top content
        var emergingTopics = ExtractEmergingTopics(trendingContent);

        // Get viral creators
        var viralCreators = GetViralCreators(trendingContent);

        // Get total stats
        var (totalContent, totalEngagement) = await GetCatalogStatsAsync(ct);

        var result = new ContentCrawlerSummaryDto(
            TrendingContent: trendingContent,
            EmergingTopics: emergingTopics.Take(10).ToList(),
            ViralCreators: viralCreators.Take(8).ToList(),
            TotalIndexedContent: totalContent,
            TotalEngagementEvents: totalEngagement,
            GeneratedAtUtc: DateTime.UtcNow
        );

        _cache.Set(cacheKey, result, TimeSpan.FromMinutes(CacheDurationMinutes));
        return result;
    }

    public async Task<IReadOnlyList<string>> GetEmergingTopicsAsync(
        string? countryCode = null, CancellationToken ct = default)
    {
        var cacheKey = string.Format(TopicsCacheKey, countryCode ?? "GLOBAL");
        if (_cache.TryGetValue(cacheKey, out object? cachedObj) && cachedObj is IReadOnlyList<string> cached)
            return cached;

        var summary = await GetTrendingAsync(null, countryCode, 50, ct);
        var topics = ExtractEmergingTopics(summary.TrendingContent).Take(15).ToList();

        _cache.Set(cacheKey, (IReadOnlyList<string>)topics, TimeSpan.FromMinutes(CacheDurationMinutes));
        return topics;
    }

    public async Task RecalculateTrendScoresAsync(CancellationToken ct = default)
    {
        // Update viral coefficient and trending score based on:
        // - Engagement velocity (engagement/hours since creation)
        // - Share ratio (shares / engagement)
        // - Recency boost (newer content scores higher)

        const string sql = @"
UPDATE app_data.content_crawler_catalog
SET viral_coefficient = CASE
        WHEN EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600 > 0
        THEN engagement_count::float / (EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600)
        ELSE 0
    END,
    trending_score = (
        0.4 * (engagement_count::float / NULLIF(
            (SELECT MAX(engagement_count) FROM app_data.content_crawler_catalog), 0))
        + 0.3 * (share_count::float / NULLIF(engagement_count, 0))
        + 0.3 * CASE
            WHEN EXTRACT(DAY FROM (NOW() - created_at)) < 1 THEN 1.0
            WHEN EXTRACT(DAY FROM (NOW() - created_at)) < 3 THEN 0.8
            WHEN EXTRACT(DAY FROM (NOW() - created_at)) < 7 THEN 0.6
            ELSE 0.3
        END
    ),
    updated_at = NOW()
WHERE created_at > NOW() - INTERVAL '30 days';
";

        try
        {
            await using var connection = await OpenNewConnectionAsync(ct);
            await using var command = new NpgsqlCommand(sql, connection);
            await command.ExecuteNonQueryAsync(ct);

            // Invalidate all caches
            InvalidateAllCaches();
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Failed to recalculate trend scores: {ex.Message}");
        }
    }

    private List<string> ExtractEmergingTopics(IEnumerable<ContentTrendingItemDto> content)
    {
        var tagCounts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

        foreach (var item in content)
        {
            foreach (var tag in item.Tags ?? Array.Empty<string>())
            {
                if (string.IsNullOrWhiteSpace(tag)) continue;

                if (tagCounts.TryGetValue(tag, out var count))
                    tagCounts[tag] = count + 1;
                else
                    tagCounts[tag] = 1;
            }
        }

        return tagCounts
            .OrderByDescending(kv => kv.Value)
            .Select(kv => kv.Key)
            .ToList();
    }

    private List<(string Creator, int Followers, decimal EngagementRate)> GetViralCreators(
        IEnumerable<ContentTrendingItemDto> content)
    {
        var creators = new Dictionary<Guid, (string Name, int Count, int TotalEngagement)>();

        foreach (var item in content)
        {
            if (creators.TryGetValue(item.CreatorId, out var creator))
            {
                creators[item.CreatorId] = (
                    creator.Name,
                    creator.Count + 1,
                    creator.TotalEngagement + item.EngagementCount
                );
            }
            else
            {
                creators[item.CreatorId] = (item.CreatorName, 1, item.EngagementCount);
            }
        }

        return creators
            .Select(kv => (
                Creator: kv.Value.Name,
                Followers: kv.Value.Count,
                EngagementRate: kv.Value.Count > 0
                    ? Convert.ToDecimal(kv.Value.TotalEngagement) / kv.Value.Count
                    : 0m
            ))
            .OrderByDescending(x => x.EngagementRate)
            .ToList();
    }

    private async Task<(int TotalContent, int TotalEngagement)> GetCatalogStatsAsync(CancellationToken ct)
    {
        const string sql = @"
SELECT COUNT(*) as total_content, COALESCE(SUM(engagement_count), 0) as total_engagement
FROM app_data.content_crawler_catalog
WHERE created_at > NOW() - INTERVAL '30 days';
";

        try
        {
            await using var connection = await OpenNewConnectionAsync(ct);
            await using var command = new NpgsqlCommand(sql, connection);

            await using var reader = await command.ExecuteReaderAsync(ct);
            if (await reader.ReadAsync(ct))
            {
                return (
                    reader.GetInt32(0),
                    Convert.ToInt32(reader.GetInt64(1))
                );
            }
        }
        catch { }

        return (0, 0);
    }

    private async Task EnsureCrawlerTablesAsync(CancellationToken ct)
    {
        const string sql = @"
CREATE SCHEMA IF NOT EXISTS app_data;

CREATE TABLE IF NOT EXISTS app_data.content_crawler_catalog (
    content_id UUID PRIMARY KEY,
    content_type TEXT NOT NULL,              -- Post, Video, Music, Story
    title TEXT NOT NULL,
    creator_id UUID NOT NULL,
    creator_name TEXT NOT NULL,
    
    view_count INTEGER NOT NULL DEFAULT 0,
    like_count INTEGER NOT NULL DEFAULT 0,
    share_count INTEGER NOT NULL DEFAULT 0,
    engagement_count INTEGER NOT NULL DEFAULT 0,
    
    viral_coefficient FLOAT NOT NULL DEFAULT 0,   -- engagement/hour
    trending_score FLOAT NOT NULL DEFAULT 0,      -- composite score 0-1
    
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    country_code TEXT NOT NULL DEFAULT 'GLOBAL',
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trending score DESC + engagement DESC (primary query)
CREATE INDEX IF NOT EXISTS idx_content_crawler_trending
    ON app_data.content_crawler_catalog (trending_score DESC, engagement_count DESC);

-- For content type filtering
CREATE INDEX IF NOT EXISTS idx_content_crawler_type
    ON app_data.content_crawler_catalog (content_type);

-- For creator stats
CREATE INDEX IF NOT EXISTS idx_content_crawler_creator
    ON app_data.content_crawler_catalog (creator_id, engagement_count DESC);

-- For recent content
CREATE INDEX IF NOT EXISTS idx_content_crawler_created
    ON app_data.content_crawler_catalog (created_at DESC)
    WHERE created_at > NOW() - INTERVAL '30 days';

-- For tag-based discovery
CREATE INDEX IF NOT EXISTS idx_content_crawler_tags_gin
    ON app_data.content_crawler_catalog USING GIN (tags);
";

        try
        {
            await using var connection = await OpenNewConnectionAsync(ct);
            await using var command = new NpgsqlCommand(sql, connection);
            await command.ExecuteNonQueryAsync(ct);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Failed to ensure crawler tables: {ex.Message}");
        }
    }

    private async Task<NpgsqlConnection> OpenNewConnectionAsync(CancellationToken ct)
    {
        var connectionString = _db.Database.GetConnectionString();
        if (string.IsNullOrWhiteSpace(connectionString))
            throw new InvalidOperationException("Database connection string unavailable.");

        var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync(ct);
        return connection;
    }

    private void InvalidateCache(string? contentType, string? countryCode)
    {
        _cache.Remove(string.Format(TrendingCacheKey, contentType ?? "All", countryCode ?? "GLOBAL"));
        _cache.Remove(string.Format(TopicsCacheKey, countryCode ?? "GLOBAL"));
    }

    private void InvalidateAllCaches()
    {
        foreach (var ctype in new[] { "Post", "Video", "Music", "Story", "All" })
        {
            _cache.Remove(string.Format(TrendingCacheKey, ctype, "GLOBAL"));
        }
        _cache.Remove(string.Format(TopicsCacheKey, "GLOBAL"));
    }
}
