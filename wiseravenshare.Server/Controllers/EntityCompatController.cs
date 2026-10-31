using System.Linq;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.DTOs.Post;
using Wiseravenshare.Server.Entities;
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
public sealed partial class EntityCompatController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly LiveStreamStateStore _liveStreamStateStore;
    private readonly IMediaBlobSignatureService _signatureService;
    private readonly IPostService _postService;
    private readonly ILogger<EntityCompatController> _logger;

    public EntityCompatController(
        AppDbContext db,
        LiveStreamStateStore liveStreamStateStore,
        IMediaBlobSignatureService signatureService,
        IPostService postService,
        ILogger<EntityCompatController> logger)
    {
        _db = db;
        _liveStreamStateStore = liveStreamStateStore;
        _signatureService = signatureService;
        _postService = postService;
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
                "conversation" => Ok(await FilterConversationsAsync(userId, body, limit, cancellationToken)),
                "message" => Ok(await FilterMessagesAsync(userId, body, limit, cancellationToken)),
                "livestream" => Ok(FilterLiveStreams(body, limit)),
                "jamsession" => Ok(await FilterJamSessionsAsync(userId, body, limit, cancellationToken)),
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
                "message" => await CountMessagesAsync(userId, body, cancellationToken),
                "livestream" => CountLiveStreams(body),
                "jamsession" => await CountJamSessionsAsync(userId, body, cancellationToken),
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
    public async Task<IActionResult> Create(
        string entityName,
        [FromBody] JsonElement payload)
    {
        if (string.Equals(entityName, "Post", StringComparison.OrdinalIgnoreCase))
        {
            return await CreatePostCompat(payload);
        }

        if (string.Equals(entityName, "Message", StringComparison.OrdinalIgnoreCase))
        {
            return await CreateMessageCompat(payload);
        }

        if (string.Equals(entityName, "JamSession", StringComparison.OrdinalIgnoreCase))
        {
            return await CreateJamSessionCompat(payload);
        }

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
            kept_permanently = ReadBool(payload, "kept_permanently", false),
            kept_at = TryReadDateTime(payload, "kept_at"),
            kept_by = ReadString(payload, "kept_by"),
            expires_at = TryReadDateTime(payload, "expires_at"),
            expiry_reminder_sent_at = TryReadDateTime(payload, "expiry_reminder_sent_at"),
            deleted_at = TryReadDateTime(payload, "deleted_at"),
            final_recording_uri = ReadString(payload, "final_recording_uri"),
            final_video_id = ReadString(payload, "final_video_id"),
            created_date = now,
            updated_date = now,
        };

        _liveStreamStateStore.Create(stream);
        return Ok(stream);
    }

    [HttpPatch("{entityName}/{id}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> Update(
        string entityName,
        string id,
        [FromBody] JsonElement payload)
    {
        if (string.Equals(entityName, "Post", StringComparison.OrdinalIgnoreCase))
        {
            return await UpdatePostCompat(id, payload);
        }

        if (string.Equals(entityName, "JamSession", StringComparison.OrdinalIgnoreCase))
        {
            return await UpdateJamSessionCompat(id, payload);
        }

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
            if (!string.IsNullOrWhiteSpace(status))
            {
                stream.status = status;
                if (string.Equals(status, "ended", StringComparison.OrdinalIgnoreCase))
                {
                    stream.ended_at ??= DateTime.UtcNow;
                    if (!stream.kept_permanently && !stream.expires_at.HasValue)
                    {
                        stream.expires_at = stream.ended_at.Value.AddHours(72);
                    }
                }
            }

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
            if (endedAt.HasValue)
            {
                stream.ended_at = endedAt.Value;
                if (!stream.kept_permanently && !stream.expires_at.HasValue)
                {
                    stream.expires_at = endedAt.Value.AddHours(72);
                }
            }

            var startedAt = TryReadDateTime(payload, "started_at");
            if (startedAt.HasValue) stream.started_at = startedAt.Value;

            if (TryReadBool(payload, "kept_permanently", out var keptPermanently))
            {
                stream.kept_permanently = keptPermanently;
                if (keptPermanently)
                {
                    stream.kept_at ??= DateTime.UtcNow;
                    stream.kept_by ??= "ui";
                    stream.expires_at = null;
                }
            }

            var keptAt = TryReadDateTime(payload, "kept_at");
            if (keptAt.HasValue) stream.kept_at = keptAt.Value;

            var keptBy = ReadString(payload, "kept_by");
            if (!string.IsNullOrWhiteSpace(keptBy)) stream.kept_by = keptBy;

            var expiresAt = TryReadDateTime(payload, "expires_at");
            if (expiresAt.HasValue) stream.expires_at = expiresAt.Value;

            var reminderSentAt = TryReadDateTime(payload, "expiry_reminder_sent_at");
            if (reminderSentAt.HasValue) stream.expiry_reminder_sent_at = reminderSentAt.Value;

            var deletedAt = TryReadDateTime(payload, "deleted_at");
            if (deletedAt.HasValue) stream.deleted_at = deletedAt.Value;

            var finalRecordingUri = ReadString(payload, "final_recording_uri");
            if (!string.IsNullOrWhiteSpace(finalRecordingUri)) stream.final_recording_uri = finalRecordingUri;

            var finalVideoId = ReadString(payload, "final_video_id");
            if (!string.IsNullOrWhiteSpace(finalVideoId)) stream.final_video_id = finalVideoId;
        });

        if (updated is null)
        {
            return NotFound(new { message = "Live stream not found." });
        }

        return Ok(updated);
    }

    [HttpDelete("{entityName}/{id}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Delete(string entityName, string id)
    {
        if (!string.Equals(entityName, "Post", StringComparison.OrdinalIgnoreCase))
        {
            return NotFound(new { message = $"Entity '{entityName}' does not support delete in compat mode." });
        }

        var userId = User.GetUserId();
        if (!Guid.TryParse(id, out var postId))
        {
            return BadRequest(new { message = "Invalid post id." });
        }

        var post = await _db.Posts.FirstOrDefaultAsync(p => p.Id == postId);
        if (post is null)
        {
            return NotFound(new { message = "Post not found." });
        }

        var isAdmin = User.IsInRole("Admin");
        if (post.UserId != userId && !isAdmin)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = "You do not own this post." });
        }

        post.IsDeleted = true;
        post.DeletedAt = DateTime.UtcNow;
        post.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private async Task<EntityFilterResponse> FilterPostsAsync(
        Guid userId,
        JsonElement body,
        int limit,
        CancellationToken cancellationToken)
    {
        var createdByIdRaw = ReadString(body, "query.created_by_id");
        var status = ReadString(body, "query.status");
        var postType = ReadString(body, "query.post_type");
        var externalSource = ReadString(body, "query.external_source");
        var sort = ReadString(body, "options.sort");

        var query = _db.Posts.AsNoTracking();

        if (Guid.TryParse(createdByIdRaw, out var createdById) && createdById != Guid.Empty)
        {
            query = query.Where(p => p.UserId == createdById);
        }
        else if (string.IsNullOrWhiteSpace(status))
        {
            query = query.Where(p => p.UserId == userId);
        }

        if (!string.IsNullOrWhiteSpace(status))
        {
            query = status.Equals("archived", StringComparison.OrdinalIgnoreCase)
                ? query.Where(p => p.IsDeleted)
                : query.Where(p => !p.IsDeleted);
        }

        if (!string.IsNullOrWhiteSpace(postType)
            && Enum.TryParse<PostType>(postType, true, out var parsedType))
        {
            query = query.Where(p => p.Type == parsedType);
        }

        if (!string.IsNullOrWhiteSpace(externalSource)
            && Guid.TryParse(externalSource, out var repostOfId)
            && repostOfId != Guid.Empty)
        {
            query = query.Where(p => p.RepostOfId == repostOfId);
        }

        query = sort switch
        {
            "created_date" => query.OrderBy(p => p.CreatedAt),
            "updated_date" => query.OrderBy(p => p.UpdatedAt),
            "-updated_date" => query.OrderByDescending(p => p.UpdatedAt),
            _ => query.OrderByDescending(p => p.CreatedAt),
        };

        var posts = await query
            .Take(limit)
            .Select(p => new
            {
                id = p.Id,
                created_by_id = p.UserId,
                content = p.Content,
                status = p.IsDeleted ? "archived" : "published",
                created_date = p.CreatedAt,
                updated_date = p.UpdatedAt,
                like_count = p.LikesCount,
                repost_count = p.RepostsCount,
                comment_count = p.CommentsCount,
                share_count = p.SharesCount,
                bookmark_count = p.BookmarksCount,
                view_count = p.ViewsCount,
                post_type = p.Type.ToString().ToLowerInvariant(),
                media_uris = p.MediaUrls,
                external_source = p.RepostOfId,
                truth_score = p.TruthScore
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
        JsonElement body,
        int limit,
        CancellationToken cancellationToken)
    {
        var sort = ReadString(body, "options.sort");
        var query = _db.Conversations
            .AsNoTracking()
            .Where(c => c.Participants.Any(p => p.UserId == userId));

        query = sort switch
        {
            "created_date" => query.OrderBy(c => c.CreatedAt),
            "-created_date" => query.OrderByDescending(c => c.CreatedAt),
            "last_message_at" => query.OrderBy(c => c.LastMessageAt ?? c.CreatedAt),
            "-last_message_at" => query.OrderByDescending(c => c.LastMessageAt ?? c.CreatedAt),
            "updated_at" => query.OrderBy(c => c.UpdatedAt),
            _ => query.OrderByDescending(c => c.LastMessageAt ?? c.UpdatedAt)
        };

        var conversations = await query
            .Take(limit)
            .Select(c => new
            {
                id = c.Id,
                participants = c.Participants.Select(p => p.UserId).ToArray(),
                type = c.IsGroup ? "group" : "direct",
                title = c.GroupName,
                last_message_at = c.LastMessageAt,
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

    private async Task<EntityFilterResponse> FilterMessagesAsync(
        Guid userId,
        JsonElement body,
        int limit,
        CancellationToken cancellationToken)
    {
        var conversationId = TryReadGuid(body, "query.conversation_id")
            ?? TryReadGuid(body, "query.conversationId");
        if (!conversationId.HasValue)
        {
            return EmptyResult();
        }

        var isParticipant = await _db.ConversationParticipants
            .AsNoTracking()
            .AnyAsync(p => p.ConversationId == conversationId.Value && p.UserId == userId, cancellationToken);
        if (!isParticipant)
        {
            return EmptyResult();
        }

        var sort = ReadString(body, "options.sort");
        var query = _db.Messages
            .AsNoTracking()
            .Where(m => m.ConversationId == conversationId.Value);

        query = sort switch
        {
            "-created_date" => query.OrderByDescending(m => m.CreatedAt),
            "updated_at" => query.OrderBy(m => m.UpdatedAt),
            "-updated_at" => query.OrderByDescending(m => m.UpdatedAt),
            _ => query.OrderBy(m => m.CreatedAt)
        };

        var messages = await query
            .Take(limit)
            .Select(m => new
            {
                id = m.Id,
                conversation_id = m.ConversationId,
                content = m.Content,
                created_by_id = m.SenderId,
                created_date = m.CreatedAt,
                updated_at = m.UpdatedAt,
                parent_message_id = m.ReplyToId
            })
            .ToListAsync(cancellationToken);

        return new EntityFilterResponse
        {
            Items = messages.Cast<object>().ToList(),
            Total = messages.Count
        };
    }

    private async Task<int> CountMessagesAsync(Guid userId, JsonElement body, CancellationToken cancellationToken)
    {
        var conversationId = TryReadGuid(body, "query.conversation_id")
            ?? TryReadGuid(body, "query.conversationId");
        if (!conversationId.HasValue)
        {
            return 0;
        }

        var isParticipant = await _db.ConversationParticipants
            .AsNoTracking()
            .AnyAsync(p => p.ConversationId == conversationId.Value && p.UserId == userId, cancellationToken);
        if (!isParticipant)
        {
            return 0;
        }

        return await _db.Messages
            .AsNoTracking()
            .CountAsync(m => m.ConversationId == conversationId.Value, cancellationToken);
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
        query = query.Where(stream => stream.deleted_at is null);
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

        var items = query
            .Take(limit)
            .Select(SignLiveStreamMediaPaths)
            .Cast<object>()
            .ToList();
        return new EntityFilterResponse { Items = items, Total = items.Count };
    }

    private int CountLiveStreams(JsonElement body)
    {
        var status = ReadString(body, "query.status");
        var query = _liveStreamStateStore.GetAll().Where(stream => stream.deleted_at is null);
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

private async Task EnsureJamSessionStorageAsync(CancellationToken cancellationToken = default)
{
    await _db.Database.ExecuteSqlRawAsync(
        """
        CREATE TABLE IF NOT EXISTS app_data.compat_jam_sessions (
            id TEXT PRIMARY KEY,
            created_by_id TEXT NOT NULL,
            description TEXT NULL,
            title TEXT NOT NULL,
            participants JSONB NOT NULL DEFAULT '[]'::jsonb,
            signup_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
            scheduled_date TEXT NULL,
            started_at TEXT NULL,
            bpm INTEGER NOT NULL DEFAULT 120,
            status TEXT NOT NULL DEFAULT 'active',
            max_participants INTEGER NULL,
            track_uris JSONB NOT NULL DEFAULT '[]'::jsonb,
            created_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS ix_compat_jam_sessions_status ON app_data.compat_jam_sessions(status);
        CREATE INDEX IF NOT EXISTS ix_compat_jam_sessions_created_date ON app_data.compat_jam_sessions(created_date DESC);
        """,
        cancellationToken);
}

private async Task<EntityFilterResponse> FilterJamSessionsAsync(Guid userId, JsonElement body, int limit, CancellationToken cancellationToken)
{
    await EnsureJamSessionStorageAsync(cancellationToken);
    var status = ReadString(body, "query.status");
    var statusIn = TryReadStringArray(body, "query.status.$in");
    var sort = ReadString(body, "options.sort");

    var query = _db.CompatJamSessions.AsNoTracking();

    if (statusIn is { Length: > 0 })
    {
        var normalized = statusIn
            .Where(s => !string.IsNullOrWhiteSpace(s))
            .Select(s => s.Trim())
            .ToArray();
        if (normalized.Length > 0)
        {
            query = query.Where(x => normalized.Contains(x.Status));
        }
    }
    else if (!string.IsNullOrWhiteSpace(status))
    {
        query = query.Where(x => x.Status == status);
    }

    query = sort switch
    {
        "created_date" => query.OrderBy(x => x.CreatedDate),
        "-created_date" => query.OrderByDescending(x => x.CreatedDate),
        "started_at" => query.OrderBy(x => x.StartedAtRaw),
        "-started_at" => query.OrderByDescending(x => x.StartedAtRaw),
        _ => query.OrderBy(x => x.StartedAtRaw).ThenBy(x => x.CreatedDate)
    };

    var rows = await query.Take(limit).ToListAsync(cancellationToken);
    var items = rows.Select(MapJamSessionCompatRow).Cast<object>().ToList();
    return new EntityFilterResponse { Items = items, Total = items.Count };
}

private async Task<int> CountJamSessionsAsync(Guid userId, JsonElement body, CancellationToken cancellationToken)
{
    await EnsureJamSessionStorageAsync(cancellationToken);
    var status = ReadString(body, "query.status");
    var statusIn = TryReadStringArray(body, "query.status.$in");

    var query = _db.CompatJamSessions.AsNoTracking();

    if (statusIn is { Length: > 0 })
    {
        var normalized = statusIn
            .Where(s => !string.IsNullOrWhiteSpace(s))
            .Select(s => s.Trim())
            .ToArray();
        if (normalized.Length > 0)
        {
            query = query.Where(x => normalized.Contains(x.Status));
        }
    }
    else if (!string.IsNullOrWhiteSpace(status))
    {
        query = query.Where(x => x.Status == status);
    }

    return await query.CountAsync(cancellationToken);
}

private async Task<IActionResult> CreateJamSessionCompat(JsonElement payload)
{
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

    await EnsureJamSessionStorageAsync();

    var userIdText = userId.ToString();
    var participants = TryReadStringArray(payload, "participants")?
        .Where(v => !string.IsNullOrWhiteSpace(v))
        .Select(v => v.Trim())
        .Distinct(StringComparer.OrdinalIgnoreCase)
        .ToList()
        ?? [];
    if (!participants.Contains(userIdText, StringComparer.OrdinalIgnoreCase))
    {
        participants.Add(userIdText);
    }

    var signupIds = TryReadStringArray(payload, "signup_ids")?
        .Where(v => !string.IsNullOrWhiteSpace(v))
        .Select(v => v.Trim())
        .Distinct(StringComparer.OrdinalIgnoreCase)
        .ToList()
        ?? [userIdText];

    var startedAt = ReadString(payload, "started_at");
    var scheduledDate = ReadString(payload, "scheduled_date");
    var now = DateTime.UtcNow;
    if (string.IsNullOrWhiteSpace(startedAt))
    {
        startedAt = !string.IsNullOrWhiteSpace(scheduledDate) ? scheduledDate : now.ToString("O");
    }

    var row = new CompatJamSession
    {
        Id = Guid.NewGuid().ToString("N"),
        CreatedById = userIdText,
        Title = title.Trim(),
        Description = ReadString(payload, "description"),
        ParticipantsJson = SerializeStringArray(participants),
        SignupIdsJson = SerializeStringArray(signupIds),
        ScheduledDateRaw = scheduledDate,
        StartedAtRaw = startedAt,
        Bpm = TryReadInt(payload, "bpm", out var bpm) ? Math.Clamp(bpm, 40, 300) : 120,
        Status = ReadString(payload, "status") is { Length: > 0 } s ? s : "active",
        MaxParticipants = TryReadInt(payload, "max_participants", out var maxParticipants) ? Math.Max(1, maxParticipants) : null,
        TrackUrisJson = SerializeStringArray(TryReadStringArray(payload, "track_uris") ?? []),
        CreatedDate = now,
        UpdatedDate = now,
    };

    _db.CompatJamSessions.Add(row);
    await _db.SaveChangesAsync();
    return Ok(MapJamSessionCompatRow(row));
}

private async Task<IActionResult> UpdateJamSessionCompat(string id, JsonElement payload)
{
    var userId = User.GetUserId();
    if (userId == Guid.Empty)
    {
        return Unauthorized(new { message = "Invalid user session." });
    }

    await EnsureJamSessionStorageAsync();

    var row = await _db.CompatJamSessions.FirstOrDefaultAsync(x => x.Id == id);
    if (row is null)
    {
        return NotFound(new { message = "Jam session not found." });
    }

    var userIdText = userId.ToString();
    var participants = ParseStringArray(row.ParticipantsJson);
    var isAdmin = User.IsInRole("Admin");
    if (!isAdmin
        && !string.Equals(row.CreatedById, userIdText, StringComparison.OrdinalIgnoreCase)
        && !participants.Contains(userIdText, StringComparer.OrdinalIgnoreCase))
    {
        return StatusCode(StatusCodes.Status403Forbidden, new { message = "You do not have access to update this jam session." });
    }

    var title = ReadString(payload, "title");
    if (!string.IsNullOrWhiteSpace(title))
    {
        row.Title = title.Trim();
    }

    var description = ReadString(payload, "description");
    if (description is not null)
    {
        row.Description = description;
    }

    var status = ReadString(payload, "status");
    if (!string.IsNullOrWhiteSpace(status))
    {
        row.Status = status.Trim();
    }

    if (TryReadInt(payload, "bpm", out var bpm))
    {
        row.Bpm = Math.Clamp(bpm, 40, 300);
    }

    if (TryReadInt(payload, "max_participants", out var maxParticipants))
    {
        row.MaxParticipants = Math.Max(1, maxParticipants);
    }

    var startedAt = ReadString(payload, "started_at");
    if (startedAt is not null)
    {
        row.StartedAtRaw = startedAt;
    }

    var scheduledDate = ReadString(payload, "scheduled_date");
    if (scheduledDate is not null)
    {
        row.ScheduledDateRaw = scheduledDate;
    }

    var participantUpdate = TryReadStringArray(payload, "participants");
    if (participantUpdate is { Length: > 0 })
    {
        row.ParticipantsJson = SerializeStringArray(
            participantUpdate
                .Where(v => !string.IsNullOrWhiteSpace(v))
                .Select(v => v.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToArray());
    }

    var signupUpdate = TryReadStringArray(payload, "signup_ids");
    if (signupUpdate is not null)
    {
        row.SignupIdsJson = SerializeStringArray(
            signupUpdate
                .Where(v => !string.IsNullOrWhiteSpace(v))
                .Select(v => v.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToArray());
    }

    var trackUrisUpdate = TryReadStringArray(payload, "track_uris");
    if (trackUrisUpdate is not null)
    {
        row.TrackUrisJson = SerializeStringArray(trackUrisUpdate);
    }

    row.UpdatedDate = DateTime.UtcNow;
    await _db.SaveChangesAsync();
    return Ok(MapJamSessionCompatRow(row));
}

private static object MapJamSessionCompatRow(CompatJamSession row)
{
    return new
    {
        id = row.Id,
        created_by_id = row.CreatedById,
        description = row.Description,
        title = row.Title,
        participants = ParseStringArray(row.ParticipantsJson),
        signup_ids = ParseStringArray(row.SignupIdsJson),
        scheduled_date = row.ScheduledDateRaw,
        started_at = row.StartedAtRaw,
        bpm = row.Bpm,
        status = row.Status,
        max_participants = row.MaxParticipants,
        track_uris = ParseStringArray(row.TrackUrisJson),
        created_date = row.CreatedDate,
        updated_date = row.UpdatedDate
    };
}

private static string[] ParseStringArray(string? raw)
{
    if (string.IsNullOrWhiteSpace(raw))
    {
        return [];
    }

    try
    {
        var values = JsonSerializer.Deserialize<string[]>(raw);
        return values?
            .Where(v => !string.IsNullOrWhiteSpace(v))
            .Select(v => v.Trim())
            .ToArray()
            ?? [];
    }
    catch
    {
        return [];
    }
}

private static string SerializeStringArray(IEnumerable<string> values)
{
    var normalized = values
        .Where(v => !string.IsNullOrWhiteSpace(v))
        .Select(v => v.Trim())
        .Distinct(StringComparer.OrdinalIgnoreCase)
        .ToArray();
    return JsonSerializer.Serialize(normalized);
}

private async Task<IActionResult> CreatePostCompat(JsonElement payload)
{
    var userId = User.GetUserId();
    if (userId == Guid.Empty)
    {
        return Unauthorized(new { message = "Invalid user session." });
    }

    var content = ReadString(payload, "content");
    if (string.IsNullOrWhiteSpace(content))
    {
        return BadRequest(new { message = "content is required." });
    }

    var mediaUrisJson = ReadString(payload, "mediaUrls");
    var mediaUrisArray = TryReadStringArray(payload, "media_uris");
    if (string.IsNullOrWhiteSpace(mediaUrisJson) && mediaUrisArray?.Length > 0)
    {
        mediaUrisJson = JsonSerializer.Serialize(mediaUrisArray);
    }

    var dto = new CreatePostDto
    {
        Content = content,
        Type = ReadString(payload, "type") ?? "Text",
        MediaUrl = ReadString(payload, "mediaUrl") ?? mediaUrisArray?.FirstOrDefault(),
        MediaUrls = mediaUrisJson,
        YoutubeUrl = ReadString(payload, "youtubeUrl"),
        TikTokUrl = ReadString(payload, "tiktokUrl"),
        FacebookUrl = ReadString(payload, "facebookUrl"),
        LocationName = ReadString(payload, "location_name"),
        IsTruthDispatch = ReadBool(payload, "truthDispatch", false),
        TruthDeclarationAccepted = ReadBool(payload, "truthDeclarationAccepted", false),
        IsSensitive = ReadBool(payload, "is_sensitive", false),
        Latitude = TryReadDecimal(payload, "latitude") is { } latitude ? (double)latitude : null,
        Longitude = TryReadDecimal(payload, "longitude") is { } longitude ? (double)longitude : null,
        RepostOfId = TryReadGuid(payload, "repostOfId") ?? TryReadGuid(payload, "external_source")
    };

    var created = await _postService.CreatePostAsync(userId, dto);
    return Ok(created);
}

private async Task<IActionResult> CreateMessageCompat(JsonElement payload)
{
    var userId = User.GetUserId();
    if (userId == Guid.Empty)
    {
        return Unauthorized(new { message = "Invalid user session." });
    }

    var conversationId = TryReadGuid(payload, "conversation_id")
        ?? TryReadGuid(payload, "conversationId");
    if (!conversationId.HasValue)
    {
        return BadRequest(new { message = "conversation_id is required." });
    }

    var isParticipant = await _db.ConversationParticipants
        .AsNoTracking()
        .AnyAsync(p => p.ConversationId == conversationId.Value && p.UserId == userId);
    if (!isParticipant)
    {
        return StatusCode(StatusCodes.Status403Forbidden, new { message = "You are not a participant in this conversation." });
    }

    var content = ReadString(payload, "content");
    if (string.IsNullOrWhiteSpace(content))
    {
        return BadRequest(new { message = "content is required." });
    }

    var message = new Message
    {
        ConversationId = conversationId.Value,
        SenderId = userId,
        Content = content.Trim(),
        Type = MessageType.Text,
        ReplyToId = TryReadGuid(payload, "parent_message_id") ?? TryReadGuid(payload, "parentMessageId")
    };

    _db.Messages.Add(message);
    var conversation = await _db.Conversations.FirstOrDefaultAsync(c => c.Id == conversationId.Value);
    if (conversation is not null)
    {
        conversation.LastMessageAt = DateTime.UtcNow;
    }

    await _db.SaveChangesAsync();

    return Ok(new
    {
        id = message.Id,
        conversation_id = message.ConversationId,
        content = message.Content,
        created_by_id = message.SenderId,
        created_date = message.CreatedAt,
        updated_at = message.UpdatedAt,
        parent_message_id = message.ReplyToId
    });
}

private async Task<IActionResult> UpdatePostCompat(string id, JsonElement payload)
{
    var userId = User.GetUserId();
    if (!Guid.TryParse(id, out var postId))
    {
        return BadRequest(new { message = "Invalid post id." });
    }

    var post = await _db.Posts.FirstOrDefaultAsync(p => p.Id == postId);
    if (post is null)
    {
        return NotFound(new { message = "Post not found." });
    }

    var isAdmin = User.IsInRole("Admin");
    if (post.UserId != userId && !isAdmin)
    {
        return StatusCode(StatusCodes.Status403Forbidden, new { message = "You do not own this post." });
    }

    var content = ReadString(payload, "content");
    if (!string.IsNullOrWhiteSpace(content))
    {
        post.Content = content;
    }

    var mediaUris = TryReadStringArray(payload, "media_uris");
    if (mediaUris?.Length > 0)
    {
        post.MediaUrls = mediaUris;
    }
    else
    {
        var mediaUrlsJson = ReadString(payload, "mediaUrls");
        if (!string.IsNullOrWhiteSpace(mediaUrlsJson))
        {
            try
            {
                post.MediaUrls = JsonSerializer.Deserialize<string[]>(mediaUrlsJson) ?? post.MediaUrls;
            }
            catch
            {
                // Keep existing media urls when payload is not JSON.
            }
        }
    }

    if (TryReadInt(payload, "like_count", out var likeCount))
    {
        post.LikesCount = Math.Max(0, likeCount);
    }

    if (TryReadInt(payload, "repost_count", out var repostCount))
    {
        post.RepostsCount = Math.Max(0, repostCount);
    }

    if (TryReadInt(payload, "comment_count", out var commentCount))
    {
        post.CommentsCount = Math.Max(0, commentCount);
    }

    if (TryReadInt(payload, "share_count", out var shareCount))
    {
        post.SharesCount = Math.Max(0, shareCount);
    }

    if (TryReadInt(payload, "bookmark_count", out var bookmarkCount))
    {
        post.BookmarksCount = Math.Max(0, bookmarkCount);
    }

    if (TryReadInt(payload, "view_count", out var viewCount))
    {
        post.ViewsCount = Math.Max(0, viewCount);
    }

    if (TryReadBool(payload, "is_sensitive", out var isSensitive))
    {
        post.IsSensitive = isSensitive;
    }

    var status = ReadString(payload, "status");
    if (!string.IsNullOrWhiteSpace(status))
    {
        var archive = status.Equals("archived", StringComparison.OrdinalIgnoreCase);
        post.IsDeleted = archive;
        post.DeletedAt = archive ? DateTime.UtcNow : null;
    }

    if (TryReadDecimal(payload, "truth_score") is { } truthScore)
    {
        post.TruthScore = truthScore;
    }

    var truthStatus = ReadString(payload, "truth_status");
    if (!string.IsNullOrWhiteSpace(truthStatus))
    {
        post.TruthCorrection = truthStatus;
    }

    post.UpdatedAt = DateTime.UtcNow;
    await _db.SaveChangesAsync();

    return Ok(new
    {
        id = post.Id,
        created_by_id = post.UserId,
        content = post.Content,
        status = post.IsDeleted ? "archived" : "published",
        created_date = post.CreatedAt,
        updated_date = post.UpdatedAt,
        like_count = post.LikesCount,
        repost_count = post.RepostsCount,
        comment_count = post.CommentsCount,
        share_count = post.SharesCount,
        bookmark_count = post.BookmarksCount,
        view_count = post.ViewsCount,
        post_type = post.Type.ToString().ToLowerInvariant(),
        media_uris = post.MediaUrls,
        external_source = post.RepostOfId,
        truth_score = post.TruthScore
    });
}

private static Guid? TryReadGuid(JsonElement body, string dotPath)
{
    var raw = ReadString(body, dotPath);
    return Guid.TryParse(raw, out var value) && value != Guid.Empty ? value : null;
}

private static decimal? TryReadDecimal(JsonElement body, string dotPath)
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

        if (current.ValueKind == JsonValueKind.Number && current.TryGetDecimal(out var numeric))
        {
            return numeric;
        }

        if (current.ValueKind == JsonValueKind.String && decimal.TryParse(current.GetString(), out var parsed))
        {
            return parsed;
        }

        return null;
    }
    catch
    {
        return null;
    }
}

private static string[]? TryReadStringArray(JsonElement body, string dotPath)
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

        if (current.ValueKind != JsonValueKind.Array)
        {
            return null;
        }

        return current
            .EnumerateArray()
            .Where(item => item.ValueKind == JsonValueKind.String)
            .Select(item => item.GetString())
            .Where(item => !string.IsNullOrWhiteSpace(item))
            .Cast<string>()
            .ToArray();
    }
    catch
    {
        return null;
    }
}

}

public sealed class EntityFilterResponse
{
    public List<object> Items { get; set; } = [];
    public int Total { get; set; }
}

public partial class EntityCompatController
{
    private LiveStreamState SignLiveStreamMediaPaths(LiveStreamState stream)
    {
        stream.current_chunk_uri = AppendBlobSignatureIfNeeded(stream.current_chunk_uri);
        stream.final_recording_uri = AppendBlobSignatureIfNeeded(stream.final_recording_uri);
        return stream;
    }

    private string? AppendBlobSignatureIfNeeded(string? mediaPath)
    {
        if (string.IsNullOrWhiteSpace(mediaPath))
        {
            return mediaPath;
        }

        var value = mediaPath.Trim();
        if (!value.StartsWith("/api/media/blob/", StringComparison.OrdinalIgnoreCase)
            || value.Contains("sig=", StringComparison.OrdinalIgnoreCase))
        {
            return value;
        }

        const string prefix = "/api/media/blob/";
        var objectKey = Uri.UnescapeDataString(value.Split('?', 2)[0][prefix.Length..]).Trim('/');
        if (string.IsNullOrWhiteSpace(objectKey))
        {
            return value;
        }

        var signature = _signatureService.SignKey(objectKey);
        if (string.IsNullOrWhiteSpace(signature))
        {
            return value;
        }

        var separator = value.Contains('?') ? "&" : "?";
        return $"{value}{separator}sig={Uri.EscapeDataString(signature)}";
    }
}
