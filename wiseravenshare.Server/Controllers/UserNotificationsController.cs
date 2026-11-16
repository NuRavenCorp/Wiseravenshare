using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Infrastructure.Data;
using Wiseravenshare.Server.Shared;

namespace Wiseravenshare.Server.Controllers;

/// <summary>
/// GET  /api/notifications            – paginated unread + recent notifications
/// POST /api/notifications/mark-read  – mark one or all as read
/// GET  /api/notifications/count      – unread badge count
/// </summary>
[ApiController]
[Authorize]
[Route("api/notifications")]
public sealed class UserNotificationsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ILogger<UserNotificationsController> _logger;

    public UserNotificationsController(AppDbContext db, ILogger<UserNotificationsController> logger)
    {
        _db     = db;
        _logger = logger;
    }

    // ── GET /api/notifications ────────────────────────────────────────────────
    [HttpGet]
    public async Task<IActionResult> List(
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
            .Where(n => n.UserId == userId && !n.IsDeleted)
            .OrderByDescending(n => n.CreatedAt);

        var total = await query.CountAsync(ct);
        var items = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(n => new
            {
                n.Id,
                type         = n.Type.ToString(),
                n.ActorId,
                n.PostId,
                n.CommentId,
                n.StreamId,
                n.Content,
                n.IsRead,
                n.ReadAt,
                n.CreatedAt
            })
            .ToListAsync(ct);

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
