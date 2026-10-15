using System.Text.Json;
using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Npgsql;
using Wiseravenshare.Server.Entities.Personalization;
using Wiseravenshare.Server.Infrastructure.Data;

namespace Wiseravenshare.Server.Services.Personalization;

// ─── DTOs ─────────────────────────────────────────────────────────────────────
public record TrackInteractionRequest(
    string Type,          // matches InteractionEventType
    string TargetType,
    Guid?  TargetId,
    string? TargetTitle,
    string? TargetCategory,
    string[]? TargetTags,
    int?   EngagementScore,
    int?   DurationSeconds,
    string? DeviceType,
    string? CountryCode,
    string? RegionCode
);

public record PersonalizedRecommendation(
    string ContentType,
    Guid?  ContentId,
    string Title,
    decimal Score,
    string Reason
);

public record RegionalTrendItem(string Topic, decimal Score, string Source, string Category);

public record CrawledContentIngestItem(
    string ContentType,
    Guid ContentId,
    string Content,
    string[]? Tags,
    string? CountryCode
);

// ─── Interface ────────────────────────────────────────────────────────────────
public interface IPersonalizationService
{
    Task TrackInteractionAsync(Guid userId, TrackInteractionRequest req, CancellationToken ct = default);
    Task<IReadOnlyList<PersonalizedRecommendation>> GetRecommendationsAsync(Guid userId, int count = 20, CancellationToken ct = default);
    Task<IReadOnlyList<RegionalTrendItem>>          GetRegionalTrendsAsync(string countryCode = "GLOBAL", string category = "General", CancellationToken ct = default);
    Task<IReadOnlyList<PersonalizedRecommendation>> GetPersonalizedTrendingAsync(Guid userId, string? countryCode = null, string? userCategory = null, int count = 12, CancellationToken ct = default);
    Task AutoTagContentAsync(string targetType, Guid targetId, string content, CancellationToken ct = default);
    Task<Dictionary<string, float>>                 GetUserEmbeddingAsync(Guid userId, CancellationToken ct = default);
    Task ProcessCrawledContentAsync(string contentType, Guid contentId, string content, string[] tags, string countryCode, CancellationToken ct = default);
    Task ProcessCrawledContentBatchAsync(IReadOnlyList<CrawledContentIngestItem> items, string? countryCode = null, CancellationToken ct = default);
}

// ─── Implementation ───────────────────────────────────────────────────────────
public sealed class PersonalizationService : IPersonalizationService
{
    private readonly AppDbContext        _db;
    private readonly IMemoryCache        _cache;
    private readonly IGeminiTagService   _gemini;
    private readonly ILogger<PersonalizationService> _log;

    private const string ProfileCacheKey = "persona_profile_{0}";
    private const string RecoCacheKey    = "persona_reco_{0}";
    private const string TrendCacheKey   = "persona_trend_{0}_{1}";
    private const string PersonalizedTrendingCacheKey = "persona_personalized_trend_{0}_{1}_{2}";

    private static readonly JsonSerializerOptions JsonOpts =
        new() { PropertyNameCaseInsensitive = true };

    public PersonalizationService(
        AppDbContext db,
        IMemoryCache cache,
        IGeminiTagService gemini,
        ILogger<PersonalizationService> log)
    {
        _db     = db;
        _cache  = cache;
        _gemini = gemini;
        _log    = log;
    }

    // ── Interaction Tracking ──────────────────────────────────────────────────
    public async Task TrackInteractionAsync(Guid userId, TrackInteractionRequest req, CancellationToken ct = default)
    {
        if (!Enum.TryParse<InteractionEventType>(req.Type, ignoreCase: true, out var eventType))
            eventType = InteractionEventType.View;

        var evt = new UserInteractionEvent
        {
            UserId          = userId,
            Type            = eventType,
            TargetType      = req.TargetType,
            TargetId        = req.TargetId,
            TargetTitle     = req.TargetTitle,
            TargetCategory  = req.TargetCategory,
            TargetTags      = req.TargetTags is { Length: > 0 } ? string.Join(",", req.TargetTags) : null,
            EngagementScore = req.EngagementScore,
            DurationSeconds = req.DurationSeconds,
            DeviceType      = req.DeviceType,
            CountryCode     = req.CountryCode,
            RegionCode      = req.RegionCode
        };
        _db.UserInteractionEvents.Add(evt);

        // Live-update the embedding vector.
        await UpdateEmbeddingAsync(userId, req.TargetTags ?? Array.Empty<string>(), eventType, ct);

        await _db.SaveChangesAsync(ct);
        _cache.Remove(string.Format(RecoCacheKey, userId));
    }

    // ── Recommendations ───────────────────────────────────────────────────────
    public async Task<IReadOnlyList<PersonalizedRecommendation>> GetRecommendationsAsync(
        Guid userId, int count = 20, CancellationToken ct = default)
    {
        var key = string.Format(RecoCacheKey, userId);
        if (_cache.TryGetValue(key, out IReadOnlyList<PersonalizedRecommendation>? cached))
            return cached!.Take(count).ToList();

        var reco = new List<PersonalizedRecommendation>();

        // 1. Content-based: find tags from user embedding.
        var embedding = await GetUserEmbeddingAsync(userId, ct);
        if (embedding.Count > 0)
        {
            var topTags = embedding
                .OrderByDescending(kv => kv.Value)
                .Take(5)
                .Select(kv => kv.Key)
                .ToList();

            var taggedContent = await _db.PersonalizationTagMappings
                .Where(m => _db.PersonalizationTags.Any(t => t.Id == m.TagId && topTags.Contains(t.Name)))
                .OrderByDescending(m => m.Confidence)
                .Take(count * 2)
                .ToListAsync(ct);

            foreach (var m in taggedContent)
            {
                reco.Add(new PersonalizedRecommendation(
                    m.TargetType, m.TargetId, m.TargetType, 0.8m,
                    $"Matches your interest in {topTags.FirstOrDefault() ?? "your library"}"));
            }
        }

        // 2. Collaborative: recent interactions from similar users.
        var recentInteracted = await _db.UserInteractionEvents
            .Where(e => e.UserId == userId)
            .OrderByDescending(e => e.CreatedAt)
            .Take(20)
            .Select(e => e.TargetId)
            .ToListAsync(ct);

        var collaborative = await _db.UserInteractionEvents
            .Where(e => e.UserId != userId
                     && recentInteracted.Contains(e.TargetId)
                     && (e.Type == InteractionEventType.Like || e.Type == InteractionEventType.Complete))
            .GroupBy(e => new { e.TargetType, e.TargetId, e.TargetTitle })
            .Select(g => new { g.Key.TargetType, g.Key.TargetId, g.Key.TargetTitle, Count = g.Count() })
            .OrderByDescending(g => g.Count)
            .Take(count)
            .ToListAsync(ct);

        foreach (var c in collaborative)
        {
            reco.Add(new PersonalizedRecommendation(
                c.TargetType, c.TargetId, c.TargetTitle ?? c.TargetType,
                0.7m, "People with similar taste also enjoyed this"));
        }

        var result = reco
            .GroupBy(r => r.ContentId)
            .Select(g => g.First())
            .OrderByDescending(r => r.Score)
            .Take(count)
            .ToList();

        _cache.Set(key, (IReadOnlyList<PersonalizedRecommendation>)result, TimeSpan.FromMinutes(10));
        return result;
    }

    // ── Regional Trending ─────────────────────────────────────────────────────
    public async Task<IReadOnlyList<RegionalTrendItem>> GetRegionalTrendsAsync(
        string countryCode = "GLOBAL", string category = "General", CancellationToken ct = default)
    {
        var key = string.Format(TrendCacheKey, countryCode.ToUpper(), category);
        if (_cache.TryGetValue(key, out IReadOnlyList<RegionalTrendItem>? cached))
            return cached!;

        // Look for a fresh snapshot in the DB.
        var snapshot = await _db.RegionalTrendSnapshots
            .Where(s => s.CountryCode == countryCode.ToUpper()
                     && s.Category    == category
                     && s.ExpiresAt   > DateTime.UtcNow)
            .OrderByDescending(s => s.SnapshotAt)
            .FirstOrDefaultAsync(ct);

        IReadOnlyList<RegionalTrendItem> items;

        if (snapshot is not null)
        {
            items = JsonSerializer.Deserialize<List<RegionalTrendItem>>(snapshot.TopicsJson, JsonOpts)
                    ?? new List<RegionalTrendItem>();
        }
        else
        {
            // Build from interaction data: top trending tags in the region.
            var since = DateTime.UtcNow.AddHours(-24);
            var query = _db.UserInteractionEvents
                .Where(e => e.CreatedAt >= since && e.TargetTags != null);

            if (countryCode != "GLOBAL")
                query = query.Where(e => e.CountryCode == countryCode.ToUpper());

            var rawRows = await query
                .Select(e => e.TargetTags!)
                .ToListAsync(ct);

            var tagCounts = rawRows
                .SelectMany(tags => tags.Split(',', StringSplitOptions.RemoveEmptyEntries))
                .GroupBy(t => t.Trim().ToLowerInvariant())
                .Select(g => new RegionalTrendItem(g.Key, g.Count(), "WiseRaven", category))
                .OrderByDescending(t => t.Score)
                .Take(20)
                .ToList();

            items = tagCounts.Count > 0 ? tagCounts : FallbackTrends(countryCode, category);

            // Persist snapshot.
            _db.RegionalTrendSnapshots.Add(new RegionalTrendSnapshot
            {
                CountryCode = countryCode.ToUpper(),
                Category    = category,
                TopicsJson  = JsonSerializer.Serialize(items),
                SnapshotAt  = DateTime.UtcNow,
                ExpiresAt   = DateTime.UtcNow.AddHours(2)
            });
            try { await _db.SaveChangesAsync(ct); } catch { /* non-critical */ }
        }

        _cache.Set(key, items, TimeSpan.FromMinutes(30));
        return items;
    }

    // ── Personalized Crawler Trending ─────────────────────────────────────────
    public async Task<IReadOnlyList<PersonalizedRecommendation>> GetPersonalizedTrendingAsync(
        Guid userId, string? countryCode = null, string? userCategory = null,
        int count = 12, CancellationToken ct = default)
    {
        // Cache key combines user + country + category
        var cacheKey = string.Format(PersonalizedTrendingCacheKey,
            userId.ToString("N")[..8],
            countryCode ?? "GLOBAL",
            userCategory ?? "ALL");

        if (_cache.TryGetValue(cacheKey, out IReadOnlyList<PersonalizedRecommendation>? cached))
            return cached!.Take(count).ToList();

        var personalized = new List<PersonalizedRecommendation>();

        // 1. Get user's interaction history to build affinity profile
        var userHistory = await _db.UserInteractionEvents
            .Where(e => e.UserId == userId && e.Type != InteractionEventType.View)
            .OrderByDescending(e => e.CreatedAt)
            .Take(50)
            .ToListAsync(ct);

        // Build user category preferences from recent interactions
        var categoryScores = new Dictionary<string, decimal>(StringComparer.OrdinalIgnoreCase);
        foreach (var interaction in userHistory)
        {
            if (!string.IsNullOrWhiteSpace(interaction.TargetCategory))
            {
                var weight = interaction.Type switch
                {
                    InteractionEventType.Like => 3.0m,
                    InteractionEventType.Complete or InteractionEventType.Share or InteractionEventType.Bookmark => 2.0m,
                    InteractionEventType.Follow => 2.5m,
                    InteractionEventType.Comment or InteractionEventType.Rate => 1.5m,
                    _ => 1.0m
                };

                if (categoryScores.TryGetValue(interaction.TargetCategory, out var current))
                    categoryScores[interaction.TargetCategory] = current + weight;
                else
                    categoryScores[interaction.TargetCategory] = weight;
            }
        }

        // Get user's top tags from embedding
        var embedding = await GetUserEmbeddingAsync(userId, ct);
        var topUserTags = embedding
            .OrderByDescending(kv => kv.Value)
            .Take(8)
            .Select(kv => kv.Key)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        // 2. Get crawler trending from database via raw SQL
        // This simulates calling the SiteCrawlerService summary endpoint
        var crawlerTrending = await GetCrawlerTrendingForPersonalizationAsync(
            countryCode, userCategory, ct);

        if (crawlerTrending is null || crawlerTrending.Count == 0)
        {
            _cache.Set(cacheKey, (IReadOnlyList<PersonalizedRecommendation>)personalized,
                TimeSpan.FromMinutes(10));
            return personalized;
        }

        // 3. Score each crawler trending page based on user profile
        foreach (var trendingPage in crawlerTrending)
        {
            var score = 0.8m; // Base score from crawler connection weight

            // Boost if page category matches user preference
            if (!string.IsNullOrWhiteSpace(trendingPage.Category)
                && categoryScores.TryGetValue(trendingPage.Category, out var categoryScore))
            {
                score += (categoryScore / 10m) * 0.2m; // Up to +0.2 for category match
            }

            // Boost if page tags overlap with user embedding
            var tagOverlap = trendingPage.Tags?
                .Where(t => topUserTags.Contains(t))
                .Count() ?? 0;

            if (tagOverlap > 0)
            {
                score += Math.Min(0.2m, tagOverlap * 0.05m); // Up to +0.2 for tag overlap
            }

            // Check if user has already interacted with this page (deprioritize)
            var hasInteracted = userHistory.Any(e =>
                e.TargetType?.Equals(trendingPage.PageId, StringComparison.OrdinalIgnoreCase) == true);

            if (hasInteracted)
                score *= 0.5m; // Half score if already interacted

            // Clamp score between 0 and 1
            score = Math.Min(1m, Math.Max(0m, score));

            personalized.Add(new PersonalizedRecommendation(
                ContentType: "Page",
                ContentId: Guid.Empty,  // Note: This is a structural page, not a user-generated content ID
                Title: trendingPage.Label,
                Score: score,
                Reason: BuildRecommendationReason(
                    trendingPage.Category,
                    categoryScore: categoryScores.ContainsKey(trendingPage.Category ?? string.Empty),
                    tagOverlap > 0)
            ));
        }

        // Sort by personalized score and take top N
        var result = personalized
            .OrderByDescending(p => p.Score)
            .Take(count)
            .ToList();

        _cache.Set(cacheKey, (IReadOnlyList<PersonalizedRecommendation>)result,
            TimeSpan.FromMinutes(10));
        return result;
    }

    private async Task<List<(string PageId, string Label, string Category, List<string> Tags, decimal Score)>>
        GetCrawlerTrendingForPersonalizationAsync(
            string? countryCode, string? userCategory, CancellationToken ct)
    {
        // Query the site_crawler_catalog for trending pages
        const string sql = @"
WITH ranked_nodes AS (
    SELECT DISTINCT ON (content_type)
        content_id,
        content_json::text,
        content,
        tags::text,
        country_code
    FROM app_data.site_crawler_catalog
    WHERE (@country_code IS NULL OR country_code = @country_code)
    ORDER BY content_type, updated_at DESC
)
SELECT
    content_json::text as content_json,
    tags::text as tags_json
FROM ranked_nodes
LIMIT 20;";

        try
        {
            var connectionString = _db.Database.GetConnectionString();
            if (string.IsNullOrWhiteSpace(connectionString))
                return new List<(string, string, string, List<string>, decimal)>();

            var results = new List<(string, string, string, List<string>, decimal)>();
            await using var connection = new NpgsqlConnection(connectionString);
            await connection.OpenAsync(ct);

            await using var command = new NpgsqlCommand(sql, connection);
            command.Parameters.AddWithValue("country_code",
                (object?)(countryCode?.ToUpperInvariant()) ?? DBNull.Value);

            await using var reader = await command.ExecuteReaderAsync(ct);
            var position = 0;

            while (await reader.ReadAsync(ct))
            {
                position++;
                var contentJsonStr = reader.IsDBNull(0) ? "{}" : reader.GetString(0);
                var tagsJsonStr = reader.IsDBNull(1) ? "[]" : reader.GetString(1);

                try
                {
                    var contentMap = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(
                        contentJsonStr, new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
                        ?? new Dictionary<string, JsonElement>();

                    var pageId = contentMap.TryGetValue("page", out var pageEl)
                        ? pageEl.GetString() ?? string.Empty : string.Empty;
                    var label = contentMap.TryGetValue("label", out var labelEl)
                        ? labelEl.GetString() ?? pageId : pageId;
                    var category = contentMap.TryGetValue("category", out var catEl)
                        ? catEl.GetString() ?? "general" : "general";

                    // Filter by user category if specified
                    if (!string.IsNullOrWhiteSpace(userCategory)
                        && !category.Equals(userCategory, StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }

                    var tags = JsonSerializer.Deserialize<List<string>>(tagsJsonStr) ?? new List<string>();

                    // Score based on position (first = higher score)
                    var score = Math.Max(0.5m, 1m - (position / 20m) * 0.5m);

                    if (!string.IsNullOrWhiteSpace(pageId))
                        results.Add((pageId, label, category, tags, score));
                }
                catch
                {
                    // Skip malformed entries
                }
            }

            return results;
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Failed to fetch crawler trending for personalization");
            return new List<(string, string, string, List<string>, decimal)>();
        }
    }

    private static string BuildRecommendationReason(
        string? category, bool categoryScore, bool tagOverlap)
    {
        var reasons = new List<string>();

        if (categoryScore)
            reasons.Add($"Popular in {category}, which you follow");

        if (tagOverlap)
            reasons.Add("Matches your interests");

        if (reasons.Count == 0)
            reasons.Add("Trending on the platform");

        return string.Join("; ", reasons);
    }

    // ── Auto-Tagging via Gemini ───────────────────────────────────────────────
    public async Task AutoTagContentAsync(
        string targetType, Guid targetId, string content, CancellationToken ct = default)
    {
        var tags = await _gemini.ExtractTagsAsync(content, 12, ct);
        foreach (var tagName in tags)
        {
            var tag = await _db.PersonalizationTags
                .FirstOrDefaultAsync(t => t.Name == tagName, ct);

            if (tag is null)
            {
                tag = new PersonalizationTag { Name = tagName };
                _db.PersonalizationTags.Add(tag);
                await _db.SaveChangesAsync(ct);
            }
            else
            {
                tag.UsageCount++;
            }

            var existingMapping = await _db.PersonalizationTagMappings
                .FirstOrDefaultAsync(m => m.TagId == tag.Id
                                       && m.TargetType == targetType
                                       && m.TargetId == targetId, ct);

            if (existingMapping is null)
            {
                _db.PersonalizationTagMappings.Add(new PersonalizationTagMapping
                {
                    TagId          = tag.Id,
                    TargetType     = targetType,
                    TargetId       = targetId,
                    Confidence     = 70,
                    IsAutoGenerated = true
                });
            }
        }

        try { await _db.SaveChangesAsync(ct); } catch (Exception ex)
        {
            _log.LogWarning(ex, "Failed to persist auto-tags for {Type}/{Id}", targetType, targetId);
        }
    }

    // ── Embedding ─────────────────────────────────────────────────────────────
    public async Task<Dictionary<string, float>> GetUserEmbeddingAsync(Guid userId, CancellationToken ct = default)
    {
        var key = string.Format(ProfileCacheKey, userId);
        if (_cache.TryGetValue(key, out Dictionary<string, float>? cached))
            return cached!;

        var profile = await _db.UserPersonalizationProfiles
            .FirstOrDefaultAsync(p => p.UserId == userId, ct);

        var vector = new Dictionary<string, float>();
        if (profile?.EmbeddingVector is not null)
        {
            try
            {
                vector = JsonSerializer.Deserialize<Dictionary<string, float>>(profile.EmbeddingVector, JsonOpts)
                         ?? vector;
            }
            catch { /* ignore corrupt vector */ }
        }

        _cache.Set(key, vector, TimeSpan.FromMinutes(5));
        return vector;
    }

    // ── Crawler ingestion ─────────────────────────────────────────────────────
    public async Task ProcessCrawledContentAsync(
        string contentType, Guid contentId, string content,
        string[] tags, string countryCode, CancellationToken ct = default)
    {
        await UpsertCrawlerCatalogAsync(contentType, contentId, content, tags, countryCode, ct);

        // Auto-tag with Gemini if no tags provided.
        if (tags.Length == 0)
        {
            var aiTags = await _gemini.ExtractTagsAsync(content, 10, ct);
            tags = aiTags.ToArray();
        }

        await AutoTagContentAsync(contentType, contentId, content, ct);

        // Bump regional trend snapshot with new tags.
        var normCountry = (countryCode ?? "GLOBAL").ToUpper().Trim();
        foreach (var tag in tags)
        {
            // Fake a synthetic interaction event so regional trending picks it up.
            _db.UserInteractionEvents.Add(new UserInteractionEvent
            {
                UserId      = Guid.Empty,          // system/crawler
                Type        = InteractionEventType.View,
                TargetType  = contentType,
                TargetId    = contentId,
                TargetTags  = tag,
                CountryCode = normCountry
            });
        }

        try { await _db.SaveChangesAsync(ct); } catch { /* non-critical */ }

        // Invalidate trend cache for that region.
        _cache.Remove(string.Format(TrendCacheKey, normCountry, "General"));
    }

    public async Task ProcessCrawledContentBatchAsync(
        IReadOnlyList<CrawledContentIngestItem> items,
        string? countryCode = null,
        CancellationToken ct = default)
    {
        if (items is null || items.Count == 0)
        {
            return;
        }

        var fallbackCountry = string.IsNullOrWhiteSpace(countryCode)
            ? "GLOBAL"
            : countryCode.Trim().ToUpperInvariant();

        foreach (var item in items)
        {
            ct.ThrowIfCancellationRequested();

            if (item is null
                || item.ContentId == Guid.Empty
                || string.IsNullOrWhiteSpace(item.ContentType)
                || string.IsNullOrWhiteSpace(item.Content))
            {
                continue;
            }

            var resolvedCountry = string.IsNullOrWhiteSpace(item.CountryCode)
                ? fallbackCountry
                : item.CountryCode.Trim().ToUpperInvariant();

            await ProcessCrawledContentAsync(
                item.ContentType,
                item.ContentId,
                item.Content,
                item.Tags ?? Array.Empty<string>(),
                resolvedCountry,
                ct);
        }
    }

    // ── Private Helpers ───────────────────────────────────────────────────────
    private async Task UpdateEmbeddingAsync(
        Guid userId, string[] tags, InteractionEventType type, CancellationToken ct)
    {
        if (tags.Length == 0) return;

        var profile = await _db.UserPersonalizationProfiles
            .FirstOrDefaultAsync(p => p.UserId == userId, ct);

        if (profile is null)
        {
            profile = new UserPersonalizationProfile { UserId = userId };
            _db.UserPersonalizationProfiles.Add(profile);
        }

        var vector = new Dictionary<string, float>();
        if (profile.EmbeddingVector is not null)
        {
            try { vector = JsonSerializer.Deserialize<Dictionary<string, float>>(profile.EmbeddingVector, JsonOpts) ?? vector; }
            catch { /* start fresh on corrupt data */ }
        }

        float weight = type switch
        {
            InteractionEventType.Like      => 1.0f,
            InteractionEventType.Complete  => 1.2f,
            InteractionEventType.Share     => 1.5f,
            InteractionEventType.Bookmark  => 1.2f,
            InteractionEventType.Dislike   => -0.8f,
            InteractionEventType.Dismiss   => -0.4f,
            InteractionEventType.Skip      => -0.3f,
            InteractionEventType.View      => 0.3f,
            _                              => 0.2f
        };

        foreach (var tag in tags)
        {
            var k = tag.Trim().ToLowerInvariant();
            if (k.Length < 2) continue;
            vector.TryGetValue(k, out var current);
            vector[k] = Math.Clamp(current + weight, -5f, 10f);
        }

        // Normalise to keep values bounded.
        if (vector.Count > 0)
        {
            var max = vector.Values.Max(v => Math.Abs(v));
            if (max > 0)
            {
                var keys = vector.Keys.ToList();
                foreach (var k in keys) vector[k] /= max;
            }
        }

        profile.EmbeddingVector = JsonSerializer.Serialize(vector);
        profile.LastActiveAt    = DateTime.UtcNow;
        _cache.Remove(string.Format(ProfileCacheKey, userId));
    }

    private static IReadOnlyList<RegionalTrendItem> FallbackTrends(string countryCode, string category)
    {
        return new[]
        {
            new RegionalTrendItem("trending",      100, "WiseRaven", category),
            new RegionalTrendItem("news",          80,  "WiseRaven", category),
            new RegionalTrendItem("music",         70,  "WiseRaven", category),
            new RegionalTrendItem("technology",    60,  "WiseRaven", category),
            new RegionalTrendItem("entertainment", 50,  "WiseRaven", category)
        };
    }

    private async Task UpsertCrawlerCatalogAsync(
        string contentType,
        Guid contentId,
        string content,
        string[] tags,
        string countryCode,
        CancellationToken ct)
    {
        if (contentId == Guid.Empty || string.IsNullOrWhiteSpace(contentType) || string.IsNullOrWhiteSpace(content))
        {
            return;
        }

        await EnsureCrawlerCatalogTableAsync(ct);

        const string sql = @"
INSERT INTO app_data.site_crawler_catalog (
    content_id, content_type, content, content_json, content_hash, crawler_schema_version, tags, country_code, created_at, updated_at
) VALUES (
    @content_id, @content_type, @content, CAST(@content_json AS jsonb), @content_hash, @crawler_schema_version, CAST(@tags AS jsonb), @country_code, NOW(), NOW()
)
ON CONFLICT (content_id)
DO UPDATE SET
    content_type = EXCLUDED.content_type,
    content = EXCLUDED.content,
    content_json = EXCLUDED.content_json,
    content_hash = EXCLUDED.content_hash,
    crawler_schema_version = EXCLUDED.crawler_schema_version,
    tags = EXCLUDED.tags,
    country_code = EXCLUDED.country_code,
    updated_at = NOW()
WHERE app_data.site_crawler_catalog.content_hash IS DISTINCT FROM EXCLUDED.content_hash
   OR app_data.site_crawler_catalog.country_code IS DISTINCT FROM EXCLUDED.country_code
   OR app_data.site_crawler_catalog.content_type IS DISTINCT FROM EXCLUDED.content_type;";

        var connectionString = _db.Database.GetConnectionString();
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            return;
        }

        var normalizedTags = (tags ?? Array.Empty<string>())
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Select(value => value.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var normalizedPayload = NormalizeCrawlerContentPayload(content);
        var normalizedPayloadJson = JsonSerializer.Serialize(normalizedPayload);

        var normalizedCountry = string.IsNullOrWhiteSpace(countryCode)
            ? "GLOBAL"
            : countryCode.Trim().ToUpperInvariant();

        var payloadHash = ComputeCrawlerPayloadHash(contentType.Trim(), normalizedPayloadJson, normalizedTags, normalizedCountry);

        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync(ct);
        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("content_id", contentId);
        command.Parameters.AddWithValue("content_type", contentType.Trim());
        command.Parameters.AddWithValue("content", content.Trim());
        command.Parameters.AddWithValue("content_json", normalizedPayloadJson);
        command.Parameters.AddWithValue("content_hash", payloadHash);
        command.Parameters.AddWithValue("crawler_schema_version", 2);
        command.Parameters.AddWithValue("tags", JsonSerializer.Serialize(normalizedTags));
        command.Parameters.AddWithValue("country_code", normalizedCountry);
        await command.ExecuteNonQueryAsync(ct);
    }

    private async Task EnsureCrawlerCatalogTableAsync(CancellationToken ct)
    {
        const string sql = @"
CREATE SCHEMA IF NOT EXISTS app_data;

CREATE TABLE IF NOT EXISTS app_data.site_crawler_catalog (
    content_id UUID PRIMARY KEY,
    content_type TEXT NOT NULL,
    content TEXT NOT NULL,
    content_json JSONB,
    content_hash TEXT,
    crawler_schema_version INTEGER NOT NULL DEFAULT 1,
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    country_code TEXT NOT NULL DEFAULT 'GLOBAL',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_site_crawler_catalog_country_updated
    ON app_data.site_crawler_catalog (country_code, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_site_crawler_catalog_tags_gin
    ON app_data.site_crawler_catalog USING GIN (tags);

CREATE INDEX IF NOT EXISTS idx_site_crawler_catalog_content_hash
    ON app_data.site_crawler_catalog (content_hash);

ALTER TABLE app_data.site_crawler_catalog
    ADD COLUMN IF NOT EXISTS content_json JSONB;

ALTER TABLE app_data.site_crawler_catalog
    ADD COLUMN IF NOT EXISTS content_hash TEXT;

ALTER TABLE app_data.site_crawler_catalog
    ADD COLUMN IF NOT EXISTS crawler_schema_version INTEGER NOT NULL DEFAULT 1;";

        var connectionString = _db.Database.GetConnectionString();
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            return;
        }

        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync(ct);
        await using var command = new NpgsqlCommand(sql, connection);
        await command.ExecuteNonQueryAsync(ct);
    }

    private static Dictionary<string, object> NormalizeCrawlerContentPayload(string content)
    {
        var raw = string.IsNullOrWhiteSpace(content) ? string.Empty : content.Trim();

        if (raw.StartsWith("{", StringComparison.Ordinal))
        {
            try
            {
                var parsed = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(raw);
                if (parsed is { Count: > 0 })
                {
                    var normalized = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
                    foreach (var (key, value) in parsed)
                    {
                        if (string.IsNullOrWhiteSpace(key))
                        {
                            continue;
                        }

                        normalized[key] = value.ValueKind switch
                        {
                            JsonValueKind.Array => value.EnumerateArray().Select(item => item.ToString()).Where(item => !string.IsNullOrWhiteSpace(item)).ToArray(),
                            JsonValueKind.String => value.GetString() ?? string.Empty,
                            JsonValueKind.Null => string.Empty,
                            _ => value.ToString()
                        };
                    }

                    if (normalized.Count > 0)
                    {
                        return normalized;
                    }
                }
            }
            catch
            {
                // Fallback to legacy parsing below.
            }
        }

        var map = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
        var segments = raw.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        foreach (var segment in segments)
        {
            var separator = segment.IndexOf(':');
            if (separator <= 0)
            {
                continue;
            }

            var key = segment[..separator].Trim();
            var value = segment[(separator + 1)..].Trim();
            if (string.IsNullOrWhiteSpace(key))
            {
                continue;
            }

            map[key] = key.Equals("related", StringComparison.OrdinalIgnoreCase)
                ? value.Split('|', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                : value;
        }

        if (map.Count == 0 && raw.Length > 0)
        {
            map["raw"] = raw;
        }

        return map;
    }

    private static string ComputeCrawlerPayloadHash(string contentType, string payloadJson, IReadOnlyList<string> tags, string countryCode)
    {
        var canonical = string.Join("|", new[]
        {
            contentType,
            payloadJson,
            string.Join(",", tags.OrderBy(tag => tag, StringComparer.OrdinalIgnoreCase)),
            countryCode
        });

        var bytes = SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(canonical));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }
}
