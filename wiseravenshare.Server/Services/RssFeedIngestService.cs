using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Infrastructure.Data;

namespace Wiseravenshare.Server.Services;

public interface IRssFeedIngestService
{
    Task IngestAllActiveSubscriptionsAsync(CancellationToken ct = default);
    Task IngestSubscriptionAsync(Guid subscriptionId, CancellationToken ct = default);
}

public sealed class RssFeedIngestOptions
{
    public const string SectionName = "Social:RssIngest";

    public int PollIntervalMinutes { get; set; } = 15;
    public int InitialDelaySeconds { get; set; } = 30;
}

public sealed class RssFeedIngestService : IRssFeedIngestService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IRssFeedService _rssFeedService;
    private readonly ILogger<RssFeedIngestService> _logger;

    public RssFeedIngestService(
        IServiceScopeFactory scopeFactory,
        IRssFeedService rssFeedService,
        ILogger<RssFeedIngestService> logger)
    {
        _scopeFactory = scopeFactory;
        _rssFeedService = rssFeedService;
        _logger = logger;
    }

    public async Task IngestAllActiveSubscriptionsAsync(CancellationToken ct = default)
    {
        await using var scope = _scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var subs = await db.RssFeedSubscriptions
            .Where(s => s.IsActive && !s.IsDeleted && s.ConsecutiveErrors < 5)
            .ToListAsync(ct);

        _logger.LogInformation("RSS ingest: processing {Count} active subscriptions", subs.Count);

        foreach (var sub in subs)
        {
            if (ct.IsCancellationRequested) break;
            try
            {
                await IngestOneAsync(db, sub, ct);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Ingest failed for subscription {Id} ({Url})", sub.Id, sub.FeedUrl);
            }
        }
    }

    public async Task IngestSubscriptionAsync(Guid subscriptionId, CancellationToken ct = default)
    {
        await using var scope = _scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var sub = await db.RssFeedSubscriptions.FirstOrDefaultAsync(
            s => s.Id == subscriptionId && !s.IsDeleted, ct);

        if (sub is null) return;
        await IngestOneAsync(db, sub, ct);
    }

    private async Task IngestOneAsync(AppDbContext db, RssFeedSubscription sub, CancellationToken ct)
    {
        var feedItems = await _rssFeedService.FetchAndParseFeedAsync(sub.FeedUrl, limit: 25);

        if (feedItems.Count == 0)
        {
            sub.ConsecutiveErrors++;
            sub.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            return;
        }

        // Update display name from first item if still empty
        if (string.IsNullOrWhiteSpace(sub.DisplayName) && feedItems.Count > 0)
        {
            sub.DisplayName = feedItems[0].AuthorHandle?.Truncate(200) ?? GetDomainName(sub.FeedUrl);
        }

        var latestPublished = feedItems
            .Where(i => i.CreatedAt.HasValue)
            .Select(i => i.CreatedAt!.Value)
            .DefaultIfEmpty()
            .Max();

        // Fetch existing external ids for this subscription to deduplicate
        var existingIds = await db.RssFeedItems
            .Where(i => i.SubscriptionId == sub.Id && !i.IsDeleted)
            .Select(i => i.ExternalId)
            .ToHashSetAsync(ct);

        int newCount = 0;
        foreach (var item in feedItems)
        {
            var extId = NormalizeExternalId(sub.FeedUrl, item.ExternalId);
            if (existingIds.Contains(extId)) continue;

            var title = SplitTitleFromText(item.Text, out var body);

            db.RssFeedItems.Add(new RssFeedItem
            {
                Id = Guid.NewGuid(),
                SubscriptionId = sub.Id,
                UserId = sub.UserId,
                ExternalId = extId,
                Platform = sub.Platform,
                Title = title?.Truncate(500),
                BodyText = body?.Truncate(2000),
                ImageUrl = item.MediaUrl?.Truncate(2048),
                PermalinkUrl = item.PermalinkUrl?.Truncate(2048),
                SourceName = sub.DisplayName.Truncate(200),
                FaviconUrl = sub.FaviconUrl?.Truncate(500),
                PublishedAt = item.CreatedAt,
                IsRead = false,
                IsSystemFeed = sub.IsSystemFeed,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
            });

            existingIds.Add(extId);
            newCount++;
        }

        sub.LastFetchedAt = DateTimeOffset.UtcNow;
        if (latestPublished != default)
            sub.LastItemAt = latestPublished;
        sub.ConsecutiveErrors = 0;
        sub.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync(ct);
        _logger.LogInformation("Ingested {New} new items for subscription {Id}", newCount, sub.Id);
    }

    private static string NormalizeExternalId(string feedUrl, string rawId)
    {
        if (string.IsNullOrWhiteSpace(rawId))
        {
            rawId = Guid.NewGuid().ToString();
        }

        var key = $"{feedUrl}::{rawId}";
        if (key.Length <= 512) return key;

        using var sha = SHA256.Create();
        return Convert.ToHexString(sha.ComputeHash(Encoding.UTF8.GetBytes(key))).ToLowerInvariant();
    }

    private static string? SplitTitleFromText(string? text, out string? body)
    {
        if (string.IsNullOrWhiteSpace(text)) { body = null; return null; }
        var parts = text.Split('\n', 2, StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 1) { body = text.Truncate(2000); return null; }
        body = parts[1].Trim().Truncate(2000);
        return parts[0].Trim().Truncate(500);
    }

    private static string GetDomainName(string url)
    {
        if (Uri.TryCreate(url, UriKind.Absolute, out var uri))
            return uri.Host.Replace("www.", "");
        return "RSS Feed";
    }
}

/// <summary>Polls all active RSS subscriptions every 15 minutes.</summary>
public sealed class RssFeedIngestBackgroundService : BackgroundService
{
    private readonly IRssFeedIngestService _ingestService;
    private readonly ILogger<RssFeedIngestBackgroundService> _logger;
    private readonly TimeSpan _pollInterval;
    private readonly TimeSpan _initialDelay;

    public RssFeedIngestBackgroundService(
        IRssFeedIngestService ingestService,
        IOptions<RssFeedIngestOptions> options,
        ILogger<RssFeedIngestBackgroundService> logger)
    {
        _ingestService = ingestService;
        _logger = logger;
        var configured = options.Value ?? new RssFeedIngestOptions();
        _pollInterval = TimeSpan.FromMinutes(Math.Clamp(configured.PollIntervalMinutes, 1, 120));
        _initialDelay = TimeSpan.FromSeconds(Math.Clamp(configured.InitialDelaySeconds, 0, 300));
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (_initialDelay > TimeSpan.Zero)
        {
            await Task.Delay(_initialDelay, stoppingToken);
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await _ingestService.IngestAllActiveSubscriptionsAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogError(ex, "RSS ingest background service encountered an unexpected error");
            }

            await Task.Delay(_pollInterval, stoppingToken);
        }
    }
}

internal static class StringExtensions
{
    internal static string Truncate(this string? value, int maxLength)
    {
        if (string.IsNullOrEmpty(value)) return string.Empty;
        return value.Length <= maxLength ? value : value[..maxLength];
    }
}
