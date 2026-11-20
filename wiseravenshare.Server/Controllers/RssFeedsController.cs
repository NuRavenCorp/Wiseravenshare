using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.ComponentModel.DataAnnotations;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Infrastructure.Data;
using Wiseravenshare.Server.Services;
using Wiseravenshare.Server.Shared;

namespace Wiseravenshare.Server.Controllers;

/// <summary>
/// RSS / Social Feed Subscription CRUD.
///
/// Routes:
///   GET    /api/rss-feeds                  – list user's subscriptions
///   POST   /api/rss-feeds                  – subscribe to a feed URL
///   DELETE /api/rss-feeds/{id}             – unsubscribe
///   PATCH  /api/rss-feeds/{id}/pause       – toggle IsActive
///   POST   /api/rss-feeds/{id}/refresh     – force immediate re-ingest
///   GET    /api/rss-feeds/items            – aggregated beautified items for user
///   PATCH  /api/rss-feeds/items/{itemId}/read  – mark item read
/// </summary>
[ApiController]
[Route("api/rss-feeds")]
[Authorize(AuthenticationSchemes = "Identity.Application,Bearer")]
public sealed class RssFeedsController(
    AppDbContext db,
    IRssFeedService rssFeedService,
    IRssFeedIngestService ingestService,
    ILogger<RssFeedsController> logger) : ControllerBase
{
    // ── List subscriptions ────────────────────────────────────────────────

    [HttpGet]
    public async Task<IActionResult> ListSubscriptions(CancellationToken ct = default)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty) return Unauthorized();

        var subs = await db.RssFeedSubscriptions
            .Where(s => s.UserId == userId && !s.IsDeleted)
            .OrderByDescending(s => s.CreatedAt)
            .Select(s => new
            {
                id = s.Id,
                feedUrl = s.FeedUrl,
                displayName = s.DisplayName,
                platform = s.Platform,
                faviconUrl = s.FaviconUrl,
                lastFetchedAt = s.LastFetchedAt,
                lastItemAt = s.LastItemAt,
                isActive = s.IsActive,
                consecutiveErrors = s.ConsecutiveErrors,
            })
            .ToListAsync(ct);

        return Ok(subs);
    }

    // ── Subscribe ─────────────────────────────────────────────────────────

    [HttpPost]
    public async Task<IActionResult> Subscribe([FromBody] SubscribeRssFeedRequest body, CancellationToken ct = default)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty) return Unauthorized();

        if (string.IsNullOrWhiteSpace(body.FeedUrl) || !Uri.TryCreate(body.FeedUrl.Trim(), UriKind.Absolute, out _))
            return BadRequest(new { message = "A valid feed URL is required." });

        var feedUrl = body.FeedUrl.Trim();

        var exists = await db.RssFeedSubscriptions.AnyAsync(
            s => s.UserId == userId && s.FeedUrl == feedUrl && !s.IsDeleted, ct);
        if (exists)
            return Conflict(new { message = "You are already subscribed to this feed." });

        // Quick preview fetch to validate the URL and derive display name
        var preview = await rssFeedService.FetchAndParseFeedAsync(feedUrl, limit: 1);
        var displayName = !string.IsNullOrWhiteSpace(body.DisplayName)
            ? body.DisplayName.Trim()
            : (preview.Count > 0
                ? (preview[0].AuthorHandle?.Length > 0 ? preview[0].AuthorHandle : GetDomainName(feedUrl))
                : GetDomainName(feedUrl));

        var platform = InferPlatform(feedUrl, body.Platform);

        var sub = new RssFeedSubscription
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            FeedUrl = feedUrl,
            DisplayName = displayName[..Math.Min(displayName.Length, 200)],
            Platform = platform,
            FaviconUrl = body.FaviconUrl?.Trim(),
            IsActive = true,
            ConsecutiveErrors = 0,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };

        db.RssFeedSubscriptions.Add(sub);
        await db.SaveChangesAsync(ct);

        // Kick off an immediate ingest in the background (fire-and-forget)
        _ = Task.Run(() => ingestService.IngestSubscriptionAsync(sub.Id, CancellationToken.None), CancellationToken.None);

        logger.LogInformation("User {UserId} subscribed to RSS feed {FeedUrl}", userId, feedUrl);
        return CreatedAtAction(nameof(ListSubscriptions), new { }, new { id = sub.Id, displayName = sub.DisplayName, platform = sub.Platform });
    }

    // ── Unsubscribe ───────────────────────────────────────────────────────

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Unsubscribe(Guid id, CancellationToken ct = default)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty) return Unauthorized();

        var sub = await db.RssFeedSubscriptions
            .FirstOrDefaultAsync(s => s.Id == id && s.UserId == userId && !s.IsDeleted, ct);
        if (sub is null) return NotFound();

        sub.IsDeleted = true;
        sub.DeletedAt = DateTime.UtcNow;
        sub.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    // ── Pause / resume ────────────────────────────────────────────────────

    [HttpPatch("{id:guid}/pause")]
    public async Task<IActionResult> TogglePause(Guid id, CancellationToken ct = default)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty) return Unauthorized();

        var sub = await db.RssFeedSubscriptions
            .FirstOrDefaultAsync(s => s.Id == id && s.UserId == userId && !s.IsDeleted, ct);
        if (sub is null) return NotFound();

        sub.IsActive = !sub.IsActive;
        sub.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return Ok(new { isActive = sub.IsActive });
    }

    // ── Force refresh ─────────────────────────────────────────────────────

    [HttpPost("{id:guid}/refresh")]
    public async Task<IActionResult> ForceRefresh(Guid id, CancellationToken ct = default)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty) return Unauthorized();

        var sub = await db.RssFeedSubscriptions
            .FirstOrDefaultAsync(s => s.Id == id && s.UserId == userId && !s.IsDeleted, ct);
        if (sub is null) return NotFound();

        await ingestService.IngestSubscriptionAsync(id, ct);
        return Ok(new { message = "Feed refreshed." });
    }

    // ── Get items ─────────────────────────────────────────────────────────

    [HttpGet("items")]
    public async Task<IActionResult> GetItems(
        [FromQuery] Guid? subscriptionId = null,
        [FromQuery] bool unreadOnly = false,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 30,
        CancellationToken ct = default)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty) return Unauthorized();

        var safePage = Math.Max(1, page);
        var safePageSize = Math.Clamp(pageSize, 1, 100);

        var query = db.RssFeedItems
            .Where(i => i.UserId == userId && !i.IsDeleted);

        if (subscriptionId.HasValue)
            query = query.Where(i => i.SubscriptionId == subscriptionId.Value);
        if (unreadOnly)
            query = query.Where(i => !i.IsRead);

        var total = await query.CountAsync(ct);
        var items = await query
            .OrderByDescending(i => i.PublishedAt ?? (DateTimeOffset)i.CreatedAt)
            .Skip((safePage - 1) * safePageSize)
            .Take(safePageSize)
            .Select(i => new
            {
                id = i.Id,
                subscriptionId = i.SubscriptionId,
                platform = i.Platform,
                title = i.Title,
                bodyText = i.BodyText,
                imageUrl = i.ImageUrl,
                permalinkUrl = i.PermalinkUrl,
                sourceName = i.SourceName,
                faviconUrl = i.FaviconUrl,
                publishedAt = i.PublishedAt,
                isRead = i.IsRead,
            })
            .ToListAsync(ct);

        return Ok(new { total, page = safePage, pageSize = safePageSize, items });
    }

    // ── Mark read ─────────────────────────────────────────────────────────

    [HttpPatch("items/{itemId:guid}/read")]
    public async Task<IActionResult> MarkRead(Guid itemId, CancellationToken ct = default)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty) return Unauthorized();

        var item = await db.RssFeedItems
            .FirstOrDefaultAsync(i => i.Id == itemId && i.UserId == userId && !i.IsDeleted, ct);
        if (item is null) return NotFound();

        item.IsRead = true;
        item.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    private static string GetDomainName(string url)
    {
        if (Uri.TryCreate(url, UriKind.Absolute, out var uri))
            return uri.Host.Replace("www.", "");
        return "RSS Feed";
    }

    private static string InferPlatform(string url, string? hint)
    {
        if (!string.IsNullOrWhiteSpace(hint)) return hint.Trim().ToLowerInvariant();
        if (url.Contains("facebook.com", StringComparison.OrdinalIgnoreCase)) return "facebook";
        if (url.Contains("tiktok.com", StringComparison.OrdinalIgnoreCase)) return "tiktok";
        if (url.Contains("bsky.app", StringComparison.OrdinalIgnoreCase)) return "bluesky";
        if (url.Contains("youtube.com", StringComparison.OrdinalIgnoreCase)) return "youtube";
        if (url.Contains("twitter.com", StringComparison.OrdinalIgnoreCase)
            || url.Contains("x.com", StringComparison.OrdinalIgnoreCase)) return "twitter";
        return "rss";
    }
}

public sealed class SubscribeRssFeedRequest
{
    [Required, MaxLength(2048)]
    public string FeedUrl { get; set; } = string.Empty;

    [MaxLength(200)]
    public string? DisplayName { get; set; }

    [MaxLength(30)]
    public string? Platform { get; set; }

    [MaxLength(500)]
    public string? FaviconUrl { get; set; }
}
