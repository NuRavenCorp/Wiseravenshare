using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Infrastructure.Data;
using Wiseravenshare.Server.Shared;

namespace Wiseravenshare.Server.Controllers;

/// <summary>
/// Generic entity compatibility layer.
/// The frontend uses a BaaS-style entityProxy that POSTs to /api/entities/{name}/filter
/// and /api/entities/{name}/aggregate. This controller provides those endpoints so the
/// browser never receives 405 Method Not Allowed from the SPA GET-only fallback.
///
/// Known entities (Post, Conversation) return real data for the authenticated user.
/// All other entities (Vibe, JamSession, KaraokePayment, etc.) return empty collections
/// until dedicated tables and services are added.
/// </summary>
[ApiController]
[Authorize]
[Route("api/entities")]
public sealed class EntityCompatController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ILogger<EntityCompatController> _logger;

    public EntityCompatController(AppDbContext db, ILogger<EntityCompatController> logger)
    {
        _db = db;
        _logger = logger;
    }

    // ── filter ────────────────────────────────────────────────────────────────

    [HttpPost("{entityName}/filter")]
    [ProducesResponseType(typeof(EntityFilterResponse), StatusCodes.Status200OK)]
    public async Task<IActionResult> Filter(
        string entityName,
        [FromBody] JsonElement body,
        CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        var limit = ReadInt(body, "options.limit", 50);
        limit = Math.Clamp(limit, 1, 200);

        try
        {
            return entityName.ToLowerInvariant() switch
            {
                "post" => Ok(await FilterPostsAsync(userId, body, limit, cancellationToken)),
                "conversation" => Ok(await FilterConversationsAsync(userId, limit, cancellationToken)),
                _ => Ok(EmptyResult())
            };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "EntityCompat filter failed for entity '{Entity}'.", entityName);
            return Ok(EmptyResult());
        }
    }

    // ── aggregate ─────────────────────────────────────────────────────────────

    [HttpPost("{entityName}/aggregate")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> Aggregate(
        string entityName,
        [FromBody] JsonElement body,
        CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();

        try
        {
            var result = entityName.ToLowerInvariant() switch
            {
                "post" => await AggregatePostsAsync(userId, cancellationToken),
                "vibe" => (object)new { count = 0, total = 0, items = Array.Empty<object>() },
                _ => (object)new { count = 0, total = 0, items = Array.Empty<object>() }
            };
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "EntityCompat aggregate failed for entity '{Entity}'.", entityName);
            return Ok(new { count = 0, total = 0, items = Array.Empty<object>() });
        }
    }

    // ── count ─────────────────────────────────────────────────────────────────

    [HttpPost("{entityName}/count")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> Count(
        string entityName,
        [FromBody] JsonElement body,
        CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();

        try
        {
            var count = entityName.ToLowerInvariant() switch
            {
                "post" => await _db.Posts
                    .AsNoTracking()
                    .CountAsync(p => p.UserId == userId && !p.IsDeleted, cancellationToken),
                "conversation" => await _db.Conversations
                    .AsNoTracking()
                    .CountAsync(c => c.Participants.Any(p => p.UserId == userId), cancellationToken),
                _ => 0
            };
            return Ok(new { count });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "EntityCompat count failed for entity '{Entity}'.", entityName);
            return Ok(new { count = 0 });
        }
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private async Task<EntityFilterResponse> FilterPostsAsync(
        Guid userId,
        JsonElement body,
        int limit,
        CancellationToken cancellationToken)
    {
        var posts = await _db.Posts
            .AsNoTracking()
            .Where(p => p.UserId == userId && !p.IsDeleted)
            .OrderByDescending(p => p.CreatedAt)
            .Take(limit)
            .Select(p => new
            {
                id = p.Id,
                created_by_id = p.UserId,
                content = p.Content,
                status = "published",
                created_date = p.CreatedAt,
                updated_at = p.UpdatedAt
            })
            .ToListAsync(cancellationToken);

        return new EntityFilterResponse
        {
            Items = posts.Cast<object>().ToList(),
            Total = posts.Count
        };
    }

    private async Task<EntityFilterResponse> FilterConversationsAsync(
        Guid userId,
        int limit,
        CancellationToken cancellationToken)
    {
        var conversations = await _db.Conversations
            .AsNoTracking()
            .Where(c => c.Participants.Any(p => p.UserId == userId))
            .OrderByDescending(c => c.UpdatedAt)
            .Take(limit)
            .Select(c => new
            {
                id = c.Id,
                created_date = c.CreatedAt,
                updated_at = c.UpdatedAt
            })
            .ToListAsync(cancellationToken);

        return new EntityFilterResponse
        {
            Items = conversations.Cast<object>().ToList(),
            Total = conversations.Count
        };
    }

    private async Task<object> AggregatePostsAsync(Guid userId, CancellationToken cancellationToken)
    {
        var count = await _db.Posts
            .AsNoTracking()
            .CountAsync(p => p.UserId == userId && !p.IsDeleted, cancellationToken);
        return new { count, total = count, items = Array.Empty<object>() };
    }

    private static EntityFilterResponse EmptyResult() =>
        new() { Items = [], Total = 0 };

    private static int ReadInt(JsonElement body, string dotPath, int defaultValue)
    {
        try
        {
            var parts = dotPath.Split('.');
            var current = body;
            foreach (var part in parts)
            {
                if (!current.TryGetProperty(part, out current))
                    return defaultValue;
            }
            return current.ValueKind == JsonValueKind.Number && current.TryGetInt32(out var v) ? v : defaultValue;
        }
        catch
        {
            return defaultValue;
        }
    }
}

public sealed class EntityFilterResponse
{
    public List<object> Items { get; set; } = [];
    public int Total { get; set; }
}
