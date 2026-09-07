using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
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

// ─── Interface ────────────────────────────────────────────────────────────────
public interface IPersonalizationService
{
    Task TrackInteractionAsync(Guid userId, TrackInteractionRequest req, CancellationToken ct = default);
    Task<IReadOnlyList<PersonalizedRecommendation>> GetRecommendationsAsync(Guid userId, int count = 20, CancellationToken ct = default);
    Task<IReadOnlyList<RegionalTrendItem>>          GetRegionalTrendsAsync(string countryCode = "GLOBAL", string category = "General", CancellationToken ct = default);
    Task AutoTagContentAsync(string targetType, Guid targetId, string content, CancellationToken ct = default);
    Task<Dictionary<string, float>>                 GetUserEmbeddingAsync(Guid userId, CancellationToken ct = default);
    Task ProcessCrawledContentAsync(string contentType, Guid contentId, string content, string[] tags, string countryCode, CancellationToken ct = default);
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
}
