using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Infrastructure.Data;
using Wiseravenshare.Server.Services;
using Wiseravenshare.Server.Shared;

namespace Wiseravenshare.Server.Controllers;

/// <summary>
/// GET  /api/notifications            – paginated unread + recent notifications with rich actor and post metadata
/// POST /api/notifications/mark-read  – mark one or all as read
/// GET  /api/notifications/count      – unread badge count
/// </summary>
[ApiController]
[Authorize]
[Route("api/notifications")]
public sealed class UserNotificationsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly UserStore _userStore;
    private readonly ILogger<UserNotificationsController> _logger;

    public UserNotificationsController(
        AppDbContext db,
        UserStore userStore,
        ILogger<UserNotificationsController> logger)
    {
        _db        = db;
        _userStore = userStore;
        _logger    = logger;
    }

    // ── GET /api/notifications ────────────────────────────────────────────────
    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] string? type = null,
        [FromQuery] int page     = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken ct = default)
    {
        var userId = ResolveUserId();
        if (userId == Guid.Empty) return Unauthorized();

        page     = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var query = _db.Notifications
            .AsNoTracking()
            .Where(n => n.UserId == userId && !n.IsDeleted);

        // Optional filtering by notification category/type
        if (!string.IsNullOrWhiteSpace(type))
        {
            var filter = type.Trim().ToLowerInvariant();
            if (filter is "viral" or "viralcontent" or "viralalert")
            {
                query = query.Where(n => n.Type == NotificationType.ViralContent || n.Type == NotificationType.ViralAlert);
            }
            else if (filter is "follow" or "follows")
            {
                query = query.Where(n => n.Type == NotificationType.Follow);
            }
            else if (filter is "comment" or "comments")
            {
                query = query.Where(n => n.Type == NotificationType.Comment || n.Type == NotificationType.LiveComment);
            }
            else if (filter is "like" or "likes")
            {
                query = query.Where(n => n.Type == NotificationType.Like || n.Type == NotificationType.LiveLike);
            }
            else if (filter is "repost" or "reposts")
            {
                query = query.Where(n => n.Type == NotificationType.Repost);
            }
            else if (Enum.TryParse<NotificationType>(type, true, out var parsedType))
            {
                query = query.Where(n => n.Type == parsedType);
            }
        }

        query = query.OrderByDescending(n => n.CreatedAt);

        var total = await query.CountAsync(ct);
        var rawItems = await query
            .Include(n => n.Actor)
            .Include(n => n.Post)
            .Include(n => n.Comment)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

        var items = rawItems.Select(n =>
        {
            var actorName = n.Actor?.DisplayName ?? n.Actor?.Username;
            var actorHandle = n.Actor?.Username;
            var actorAvatar = n.Actor?.AvatarUrl;

            // Fallback resolution from UserStore if Actor navigation property was unmapped
            if (string.IsNullOrWhiteSpace(actorName) && n.ActorId.HasValue)
            {
                if (_userStore.TryGetById(n.ActorId.Value.ToString("N"), out var storeUser) && storeUser != null
                    || _userStore.TryGetById(n.ActorId.Value.ToString(), out storeUser) && storeUser != null)
                {
                    actorName = storeUser.Name;
                    actorHandle = storeUser.Handle;
                    actorAvatar = storeUser.Avatar;
                }
            }

            var postTitle = n.Post != null
                ? (n.Post.Content.Length > 80 ? n.Post.Content[..80] + "..." : n.Post.Content)
                : null;
            var commentSnippet = n.Comment != null
                ? (n.Comment.Content.Length > 80 ? n.Comment.Content[..80] + "..." : n.Comment.Content)
                : null;

            string title;
            string displayContent;
            string link;

            switch (n.Type)
            {
                case NotificationType.Follow:
                    title = "New Follower";
                    displayContent = !string.IsNullOrWhiteSpace(actorHandle)
                        ? $"@{actorHandle} started following you"
                        : (n.Content ?? "Someone started following you");
                    link = !string.IsNullOrWhiteSpace(actorHandle) ? $"/profile/{actorHandle}" : "/social";
                    break;

                case NotificationType.Comment:
                    title = "New Comment";
                    if (!string.IsNullOrWhiteSpace(commentSnippet))
                    {
                        displayContent = !string.IsNullOrWhiteSpace(actorHandle)
                            ? $"@{actorHandle} commented: \"{commentSnippet}\""
                            : $"New comment: \"{commentSnippet}\"";
                    }
                    else
                    {
                        displayContent = !string.IsNullOrWhiteSpace(actorHandle)
                            ? $"@{actorHandle} commented on your post"
                            : (n.Content ?? "Someone commented on your post");
                    }
                    link = n.PostId.HasValue ? $"/social?postId={n.PostId}" : "/social";
                    break;

                case NotificationType.Like:
                    title = "New Like";
                    displayContent = !string.IsNullOrWhiteSpace(actorHandle)
                        ? $"@{actorHandle} liked your post"
                        : (n.Content ?? "Someone liked your post");
                    link = n.PostId.HasValue ? $"/social?postId={n.PostId}" : "/social";
                    break;

                case NotificationType.Repost:
                    title = "Post Reposted";
                    displayContent = !string.IsNullOrWhiteSpace(actorHandle)
                        ? $"@{actorHandle} reposted your post"
                        : (n.Content ?? "Someone reposted your post");
                    link = n.PostId.HasValue ? $"/social?postId={n.PostId}" : "/social";
                    break;

                case NotificationType.ViralContent:
                case NotificationType.ViralAlert:
                    title = "🔥 Viral Alert!";
                    displayContent = !string.IsNullOrWhiteSpace(n.Content)
                        ? n.Content
                        : "Your post is gaining major viral traction and community engagement!";
                    link = n.PostId.HasValue ? $"/social?postId={n.PostId}" : "/social";
                    break;

                case NotificationType.LiveStream:
                    title = "Live Stream Alert";
                    displayContent = n.Content ?? "A creator you follow just went live!";
                    link = !string.IsNullOrWhiteSpace(n.StreamId) ? $"/go-live/{n.StreamId}" : "/go-live";
                    break;

                default:
                    title = n.Type.ToString();
                    displayContent = n.Content ?? n.Type.ToString();
                    link = n.PostId.HasValue ? $"/social?postId={n.PostId}" : (!string.IsNullOrWhiteSpace(n.StreamId) ? $"/go-live/{n.StreamId}" : "/social");
                    break;
            }

            return new
            {
                id             = n.Id,
                type           = n.Type.ToString(),
                actorId        = n.ActorId,
                actorName,
                actorHandle,
                actorAvatar,
                postId         = n.PostId,
                postTitle,
                commentId      = n.CommentId,
                commentSnippet,
                streamId       = n.StreamId,
                title,
                content        = displayContent,
                link,
                isRead         = n.IsRead,
                readAt         = n.ReadAt,
                createdAt      = n.CreatedAt
            };
        }).ToList();

        return Ok(new { total, page, pageSize, items });
    }

    // ── GET /api/notifications/count ─────────────────────────────────────────
    [HttpGet("count")]
    public async Task<IActionResult> UnreadCount(CancellationToken ct)
    {
        var userId = ResolveUserId();
        if (userId == Guid.Empty) return Unauthorized();

        var count = await _db.Notifications
            .AsNoTracking()
            .CountAsync(n => n.UserId == userId && !n.IsRead && !n.IsDeleted, ct);

        return Ok(new { unread = count });
    }

    // ── POST /api/notifications/mark-read ────────────────────────────────────
    [HttpPost("mark-read")]
    public async Task<IActionResult> MarkRead(
        [FromBody] MarkReadRequest request,
        CancellationToken ct)
    {
        var userId = ResolveUserId();
        if (userId == Guid.Empty) return Unauthorized();

        var now = DateTime.UtcNow;
        int affected;

        if (request.All)
        {
            affected = await _db.Notifications
                .Where(n => n.UserId == userId && !n.IsRead && !n.IsDeleted)
                .ExecuteUpdateAsync(s => s
                    .SetProperty(n => n.IsRead, true)
                    .SetProperty(n => n.ReadAt, now)
                    .SetProperty(n => n.UpdatedAt, now),
                    ct);
        }
        else if (request.Id.HasValue)
        {
            affected = await _db.Notifications
                .Where(n => n.Id == request.Id.Value && n.UserId == userId && !n.IsDeleted)
                .ExecuteUpdateAsync(s => s
                    .SetProperty(n => n.IsRead, true)
                    .SetProperty(n => n.ReadAt, now)
                    .SetProperty(n => n.UpdatedAt, now),
                    ct);
        }
        else
        {
            return BadRequest(new { message = "Provide id or all=true." });
        }

        return Ok(new { marked = affected });
    }

    private Guid ResolveUserId()
    {
        var raw = User.FindFirstValue(ClaimTypes.NameIdentifier)
               ?? User.FindFirstValue("sub")
               ?? User.FindFirstValue("userId");
        return Guid.TryParse(raw, out var id) ? id : Guid.Empty;
    }

    public sealed class MarkReadRequest
    {
        public Guid? Id  { get; set; }
        public bool All  { get; set; }
    }
}
