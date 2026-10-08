using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Hubs;
using Wiseravenshare.Server.Infrastructure.Data;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/mediainteraction")]
[Authorize]
public class MediaInteractionController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IHubContext<SocialHub> _socialHub;
    private readonly ILogger<MediaInteractionController> _logger;

    public MediaInteractionController(AppDbContext db, IHubContext<SocialHub> socialHub, ILogger<MediaInteractionController> logger)
    {
        _db = db;
        _socialHub = socialHub;
        _logger = logger;
    }

    [HttpPost("comment")]
    public async Task<IActionResult> PostComment([FromBody] PostCommentRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Content))
            return BadRequest(new { message = "Comment content is required." });

        var userId = ResolveUserId();
        if (userId == Guid.Empty) return Unauthorized();

        if (!await _db.MediaItems.AnyAsync(m => m.Id == request.MediaContentId && !m.IsDeleted, ct))
            return NotFound(new { message = "Media item not found." });

        var comment = new MediaComment
        {
            MediaId = request.MediaContentId,
            UserId = userId,
            Content = request.Content.Trim(),
            ParentCommentId = request.ParentCommentId
        };
        _db.MediaComments.Add(comment);
        _db.UserActivities.Add(new UserActivity
        {
            ActorUserId = userId,
            ActivityType = UserActivityType.CommentPosted,
            TargetId = request.MediaContentId,
            TargetType = "MediaItem",
            Summary = $"Commented on media {request.MediaContentId}"
        });
        await _db.SaveChangesAsync(ct);

        var payload = new { commentId = comment.Id, mediaContentId = request.MediaContentId, userId, content = comment.Content, createdAt = comment.CreatedAt, parentCommentId = request.ParentCommentId };
        await _socialHub.Clients.Group(SocialHub.BuildMediaGroup(request.MediaContentId.ToString())).SendAsync("NewComment", payload, ct);
        return Ok(payload);
    }

    [HttpPost("like")]
    public async Task<IActionResult> ToggleLike([FromBody] LikeRequest request, CancellationToken ct)
    {
        var userId = ResolveUserId();
        if (userId == Guid.Empty) return Unauthorized();

        if (!await _db.MediaItems.AnyAsync(m => m.Id == request.MediaContentId && !m.IsDeleted, ct))
            return NotFound(new { message = "Media item not found." });

        var existing = await _db.MediaLikes.FirstOrDefaultAsync(l => l.MediaId == request.MediaContentId && l.UserId == userId, ct);
        bool liked;
        if (existing is not null) { _db.MediaLikes.Remove(existing); liked = false; }
        else
        {
            _db.MediaLikes.Add(new MediaLike { MediaId = request.MediaContentId, UserId = userId });
            _db.UserActivities.Add(new UserActivity { ActorUserId = userId, ActivityType = UserActivityType.MediaLiked, TargetId = request.MediaContentId, TargetType = "MediaItem", Summary = $"Liked media {request.MediaContentId}" });
            liked = true;
        }
        await _db.SaveChangesAsync(ct);

        var count = await _db.MediaLikes.CountAsync(l => l.MediaId == request.MediaContentId, ct);
        var payload = new { mediaContentId = request.MediaContentId, liked, likesCount = count };
        await _socialHub.Clients.Group(SocialHub.BuildMediaGroup(request.MediaContentId.ToString())).SendAsync("LikeToggled", payload, ct);
        return Ok(payload);
    }

    private Guid ResolveUserId()
    {
        var raw = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub") ?? User.FindFirstValue("userId");
        return Guid.TryParse(raw, out var id) ? id : Guid.Empty;
    }

    public sealed class PostCommentRequest { public Guid MediaContentId { get; set; } public string Content { get; set; } = string.Empty; public Guid? ParentCommentId { get; set; } }
    public sealed class LikeRequest { public Guid MediaContentId { get; set; } }
}
