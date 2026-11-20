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
/// RSS / Social Feed — server-to-server aggregation surface.
///
/// Public (no auth):
///   GET  /api/rss-feeds/system-items    – latest items from server-configured feeds
///
/// Admin only (Bearer/Cookie):
///   POST /api/rss-feeds/admin/refresh   – trigger re-ingest of all system feeds now
///
/// These routes are intentionally invisible to end-users.
/// Feed management happens exclusively through appsettings Social:SystemFeeds.
/// </summary>
[ApiController]
[Route("api/rss-feeds")]
public sealed class RssFeedsController(
    AppDbContext db,
    IRssFeedIngestService ingestService,
    ILogger<RssFeedsController> logger) : ControllerBase
{
    // ── Public system feed items ──────────────────────────────────────────
    // No auth required — the content is ingested server-side from public feeds.

    [HttpGet("system-items")]
    [AllowAnonymous]
    public async Task<IActionResult> GetSystemItems(
        [FromQuery] string? platform = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 30,
        CancellationToken ct = default)
    {
        var safePage = Math.Max(1, page);
        var safePageSize = Math.Clamp(pageSize, 1, 100);

        var query = db.RssFeedItems
            .Where(i => i.IsSystemFeed && !i.IsDeleted);

        if (!string.IsNullOrWhiteSpace(platform))
            query = query.Where(i => i.Platform == platform.Trim().ToLowerInvariant());

        var total = await query.CountAsync(ct);
        var items = await query
            .OrderByDescending(i => i.PublishedAt ?? (DateTimeOffset)i.CreatedAt)
            .Skip((safePage - 1) * safePageSize)
            .Take(safePageSize)
            .Select(i => new
            {
                id          = i.Id,
                platform    = i.Platform,
                title       = i.Title,
                bodyText    = i.BodyText,
                imageUrl    = i.ImageUrl,
                permalinkUrl = i.PermalinkUrl,
                sourceName  = i.SourceName,
                faviconUrl  = i.FaviconUrl,
                publishedAt = i.PublishedAt,
            })
            .ToListAsync(ct);

        return Ok(new { total, page = safePage, pageSize = safePageSize, items });
    }

    // ── Admin: force re-ingest ─────────────────────────────────────────────

    [HttpPost("admin/refresh")]
    [Authorize(AuthenticationSchemes = "Identity.Application,Bearer")]
    public async Task<IActionResult> AdminRefresh(CancellationToken ct = default)
    {
        // Restrict to admins
        var userId = User.GetUserId();
        if (userId == Guid.Empty) return Unauthorized();

        logger.LogInformation("Admin {UserId} triggered RSS system-feed refresh", userId);
        await ingestService.IngestAllActiveSubscriptionsAsync(ct);
        return Ok(new { message = "System feeds refreshed." });
    }
}
