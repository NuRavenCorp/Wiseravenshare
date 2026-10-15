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
[Route("api/follow")]
[Authorize]
public class FollowController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IHubContext<SocialHub> _socialHub;
    private readonly ILogger<FollowController> _logger;

    public FollowController(AppDbContext db, IHubContext<SocialHub> socialHub, ILogger<FollowController> logger)
    { _db = db; _socialHub = socialHub; _logger = logger; }

    [HttpPost("toggle")]
    public async Task<IActionResult> ToggleFollow([FromBody] ToggleFollowRequest request, CancellationToken ct)
    {
        var followerId = ResolveUserId();
        if (followerId == Guid.Empty) return Unauthorized();
        if (followerId == request.TargetUserId) return BadRequest(new { message = "Cannot follow yourself." });
        if (!await _db.Users.AnyAsync(u => u.Id == request.TargetUserId && !u.IsDeleted, ct))
            return NotFound(new { message = "Target user not found." });

        var existing = await _db.UserFollows.FirstOrDefaultAsync(f => f.FollowerId == followerId && f.FollowingId == request.TargetUserId && !f.IsDeleted, ct);
        bool nowFollowing;
        if (existing is not null) { _db.UserFollows.Remove(existing); nowFollowing = false; }
        else
        {
            _db.UserFollows.Add(new Follow { FollowerId = followerId, FollowingId = request.TargetUserId });
            _db.UserActivities.Add(new UserActivity { ActorUserId = followerId, ActivityType = UserActivityType.Followed, TargetId = request.TargetUserId, TargetType = "User", Summary = $"{followerId} followed {request.TargetUserId}" });
            nowFollowing = true;
        }
        await _db.SaveChangesAsync(ct);

        if (nowFollowing)
            await _socialHub.Clients.Group(SocialHub.BuildUserGroup(request.TargetUserId.ToString()))
                .SendAsync("NewFollower", new { followerId, targetUserId = request.TargetUserId, occurredAt = DateTime.UtcNow }, ct);

        return Ok(new { nowFollowing, followerId, targetUserId = request.TargetUserId });
    }

    [HttpGet("status/{targetUserId:guid}")]
    public async Task<IActionResult> GetFollowStatus(Guid targetUserId, CancellationToken ct)
    {
        var followerId = ResolveUserId();
        if (followerId == Guid.Empty) return Unauthorized();
        var isFollowing = await _db.UserFollows.AnyAsync(f => f.FollowerId == followerId && f.FollowingId == targetUserId && !f.IsDeleted, ct);
        return Ok(new { isFollowing, followerId, targetUserId });
    }

    private Guid ResolveUserId()
    {
        var raw = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub") ?? User.FindFirstValue("userId");
        return Guid.TryParse(raw, out var id) ? id : Guid.Empty;
    }

    public sealed class ToggleFollowRequest { public Guid TargetUserId { get; set; } }
}
