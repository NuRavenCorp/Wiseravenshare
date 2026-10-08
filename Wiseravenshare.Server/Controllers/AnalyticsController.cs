using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Infrastructure.Data;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/analytics")]
[Authorize]
public class AnalyticsController : ControllerBase
{
    private readonly AppDbContext _db;

    public AnalyticsController(AppDbContext db) => _db = db;

    [HttpGet("feed/{userId:guid}")]
    public async Task<IActionResult> GetActivityFeed(Guid userId, [FromQuery] int page = 1, [FromQuery] int pageSize = 50, CancellationToken ct = default)
    {
        var callerId = ResolveUserId();
        if (callerId != userId && !User.IsInRole("Admin")) return Forbid();

        pageSize = Math.Clamp(pageSize, 1, 100);
        page = Math.Max(1, page);

        var followingIds = await _db.UserFollows
            .Where(f => f.FollowerId == userId && !f.IsDeleted)
            .Select(f => f.FollowingId)
            .ToListAsync(ct);

        var relevantIds = followingIds.Append(userId).Distinct().ToList();

        var activities = await _db.UserActivities
            .AsNoTracking()
            .Where(a => relevantIds.Contains(a.ActorUserId) && !a.IsDeleted)
            .OrderByDescending(a => a.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(a => new
            {
                id = a.Id,
                actorUserId = a.ActorUserId,
                activityType = a.ActivityType.ToString(),
                targetId = a.TargetId,
                targetType = a.TargetType,
                summary = a.Summary,
                occurredAt = a.CreatedAt
            })
            .ToListAsync(ct);

        return Ok(new { userId, page, pageSize, activities });
    }

    private Guid ResolveUserId()
    {
        var raw = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub") ?? User.FindFirstValue("userId");
        return Guid.TryParse(raw, out var id) ? id : Guid.Empty;
    }
}
