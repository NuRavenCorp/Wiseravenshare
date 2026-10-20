using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Infrastructure.Data;
using Wiseravenshare.Server.Services;
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
    private readonly LiveStreamStateStore _liveStreamStateStore;
    private readonly ILogger<EntityCompatController> _logger;

    public EntityCompatController(
        AppDbContext db,
        LiveStreamStateStore liveStreamStateStore,
        ILogger<EntityCompatController> logger)
    {
        _db = db;
        _liveStreamStateStore = liveStreamStateStore;
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
                "livestream" => Ok(FilterLiveStreams(body, limit)),
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
                "livestream" => CountLiveStreams(body),
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

    [HttpPost("{entityName}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public IActionResult Create(
        string entityName,
        [FromBody] JsonElement payload)
    {
        if (!string.Equals(entityName, "LiveStream", StringComparison.OrdinalIgnoreCase))
        {
            return NotFound(new { message = $"Entity '{entityName}' does not support create in compat mode." });
        }

        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        var title = ReadString(payload, "title");
        if (string.IsNullOrWhiteSpace(title))
        {
            return BadRequest(new { message = "title is required." });
        }

        var now = DateTime.UtcNow;
        var stream = new LiveStreamState
        {
            id = ReadString(payload, "id") is { Length: > 0 } id ? id : Guid.NewGuid().ToString("N"),
            created_by_id = userId.ToString(),
            title = title,
            description = ReadString(payload, "description"),
            streamer_id = ReadString(payload, "streamer_id") is { Length: > 0 } sid ? sid : userId.ToString(),
            status = ReadString(payload, "status") is { Length: > 0 } status ? status : "live",
            current_chunk_uri = ReadString(payload, "current_chunk_uri"),
            chunk_sequence = ReadInt(payload, "chunk_sequence", 0),
            is_audio_only = ReadBool(payload, "is_audio_only", false),
            started_at = TryReadDateTime(payload, "started_at") ?? now,
            created_date = now,
            updated_date = now,
        };

        _liveStreamStateStore.Create(stream);
        return Ok(stream);
    }

    [HttpPatch("{entityName}/{id}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public IActionResult Update(
        string entityName,
        string id,
        [FromBody] JsonElement payload)
    {
        if (!string.Equals(entityName, "LiveStream", StringComparison.OrdinalIgnoreCase))
        {
            return NotFound(new { message = $"Entity '{entityName}' does not support update in compat mode." });
        }

        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        if (!_liveStreamStateStore.TryGet(id, out var existing))
        {
            return NotFound(new { message = "Live stream not found." });
        }

        if (!string.Equals(existing.created_by_id, userId.ToString(), StringComparison.OrdinalIgnoreCase))
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = "You do not own this stream." });
        }

        var updated = _liveStreamStateStore.Update(id, stream =>
        {
            var title = ReadString(payload, "title");
            if (!string.IsNullOrWhiteSpace(title)) stream.title = title;

            var description = ReadString(payload, "description");
            if (!string.IsNullOrWhiteSpace(description)) stream.description = description;

            var status = ReadString(payload, "status");
            if (!string.IsNullOrWhiteSpace(status)) stream.status = status;

            var chunkUri = ReadString(payload, "current_chunk_uri");
            if (!string.IsNullOrWhiteSpace(chunkUri)) stream.current_chunk_uri = chunkUri;

            if (TryReadInt(payload, "chunk_sequence", out var chunkSequence))
            {
                stream.chunk_sequence = Math.Max(0, chunkSequence);
            }

            if (TryReadBool(payload, "is_audio_only", out var isAudioOnly))
            {
                stream.is_audio_only = isAudioOnly;
            }

            var endedAt = TryReadDateTime(payload, "ended_at");
            if (endedAt.HasValue) stream.ended_at = endedAt.Value;

            var startedAt = TryReadDateTime(payload, "started_at");
            if (startedAt.HasValue) stream.started_at = startedAt.Value;
        });

        if (updated is null)
        {
            return NotFound(new { message = "Live stream not found." });
        }

        return Ok(updated);
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

    private EntityFilterResponse FilterLiveStreams(JsonElement body, int limit)
    {
        var status = ReadString(body, "query.status");
        var streamerId = ReadString(body, "query.streamer_id");
        var sort = ReadString(body, "options.sort");

        IEnumerable<LiveStreamState> query = _liveStreamStateStore.GetAll();
        if (!string.IsNullOrWhiteSpace(status))
        {
            query = query.Where(stream => string.Equals(stream.status, status, StringComparison.OrdinalIgnoreCase));
        }

        if (!string.IsNullOrWhiteSpace(streamerId))
        {
            query = query.Where(stream => string.Equals(stream.streamer_id, streamerId, StringComparison.OrdinalIgnoreCase));
        }

        query = sort switch
        {
            "created_date" => query.OrderBy(stream => stream.created_date),
            "-created_date" => query.OrderByDescending(stream => stream.created_date),
            "updated_date" => query.OrderBy(stream => stream.updated_date),
            "-updated_date" => query.OrderByDescending(stream => stream.updated_date),
            _ => query.OrderByDescending(stream => stream.updated_date)
        };

        var items = query.Take(limit).Cast<object>().ToList();
        return new EntityFilterResponse { Items = items, Total = items.Count };
    }

    private int CountLiveStreams(JsonElement body)
    {
        var status = ReadString(body, "query.status");
        var query = _liveStreamStateStore.GetAll().AsEnumerable();
        if (!string.IsNullOrWhiteSpace(status))
        {
            query = query.Where(stream => string.Equals(stream.status, status, StringComparison.OrdinalIgnoreCase));
        }
        return query.Count();
    }

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

    private static string? ReadString(JsonElement body, string dotPath)
    {
        try
        {
            var parts = dotPath.Split('.');
            var current = body;
            foreach (var part in parts)
            {
                if (!current.TryGetProperty(part, out current))
                {
                    return null;
                }
            }

            if (current.ValueKind == JsonValueKind.String)
            {
                return current.GetString();
            }

            return current.ValueKind == JsonValueKind.Null || current.ValueKind == JsonValueKind.Undefined
                ? null
                : current.ToString();
        }
        catch
        {
            return null;
        }
    }

    private static bool ReadBool(JsonElement body, string dotPath, bool defaultValue)
    {
        return TryReadBool(body, dotPath, out var result) ? result : defaultValue;
    }

    private static bool TryReadBool(JsonElement body, string dotPath, out bool value)
    {
        value = false;
        try
        {
            var parts = dotPath.Split('.');
            var current = body;
            foreach (var part in parts)
            {
                if (!current.TryGetProperty(part, out current))
                {
                    return false;
                }
            }

            if (current.ValueKind == JsonValueKind.True || current.ValueKind == JsonValueKind.False)
            {
                value = current.GetBoolean();
                return true;
            }

            if (current.ValueKind == JsonValueKind.String && bool.TryParse(current.GetString(), out var parsed))
            {
                value = parsed;
                return true;
            }

            return false;
        }
        catch
        {
            return false;
        }
    }

    private static bool TryReadInt(JsonElement body, string dotPath, out int value)
    {
        value = 0;
        try
        {
            var parts = dotPath.Split('.');
            var current = body;
            foreach (var part in parts)
            {
                if (!current.TryGetProperty(part, out current))
                {
                    return false;
                }
            }

            if (current.ValueKind == JsonValueKind.Number && current.TryGetInt32(out value))
            {
                return true;
            }

            if (current.ValueKind == JsonValueKind.String && int.TryParse(current.GetString(), out var parsed))
            {
                value = parsed;
                return true;
            }

            return false;
        }
        catch
        {
            return false;
        }
    }

    private static DateTime? TryReadDateTime(JsonElement body, string dotPath)
    {
        var raw = ReadString(body, dotPath);
        return DateTime.TryParse(raw, out var parsed) ? parsed : null;
    }
}

public sealed class EntityFilterResponse
{
    public List<object> Items { get; set; } = [];
    public int Total { get; set; }
}
