using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Hubs;
using Wiseravenshare.Server.Infrastructure.Data;
using Wiseravenshare.Server.Services;
using Wiseravenshare.Server.Services.Simulation;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/follow")]
[AllowAnonymous]
public class FollowController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly FollowStore _followStore;
    private readonly EngagementSimulatorService _simulator;
    private readonly IHubContext<SocialHub> _socialHub;
    private readonly INotificationService _notificationService;
    private readonly ILogger<FollowController> _logger;

    public FollowController(
        AppDbContext db,
        FollowStore followStore,
        EngagementSimulatorService simulator,
        IHubContext<SocialHub> socialHub,
        INotificationService notificationService,
        ILogger<FollowController> logger)
    {
        _db = db;
        _followStore = followStore;
        _simulator = simulator;
        _socialHub = socialHub;
        _notificationService = notificationService;
        _logger = logger;
    }

    /// <summary>
    /// Toggles follow status for a creator or user and returns the updated tallies.
    /// Works for both authenticated users and anonymous sessions with local persistence.
    /// </summary>
    [HttpPost("toggle")]
    public async Task<IActionResult> ToggleFollow([FromBody] ToggleFollowRequest request, CancellationToken ct)
    {
        var followerId = ResolveUserId();
        if (followerId == Guid.Empty)
        {
            followerId = ResolveOrCreateAnonymousId();
        }

        if (followerId == request.TargetUserId && request.TargetUserId != Guid.Empty)
        {
            return BadRequest(new { message = "Cannot follow yourself." });
        }

        var personaKey = request.PersonaKey ?? request.TargetUsername;
        var targetId = request.TargetUserId;

        // Execute toggle in thread-safe FollowStore (with disk persistence & EF mirror)
        var success = _followStore.ToggleFollow(
            followerId,
            targetId,
            personaKey,
            out var nowFollowing,
            out var followersCount,
            out var followingCount);

        if (!success)
        {
            return BadRequest(new { message = "Invalid target creator." });
        }

        if (nowFollowing)
        {
            try
            {
                // Real-time SignalR push
                if (targetId != Guid.Empty)
                {
                    await _socialHub.Clients.Group(SocialHub.BuildUserGroup(targetId.ToString()))
                        .SendAsync("NewFollower", new
                        {
                            followerId,
                            targetUserId = targetId,
                            followersCount,
                            occurredAt = DateTime.UtcNow
                        }, ct);
                }

                // Push global count update to everyone on SocialHub
                await _socialHub.Clients.All.SendAsync("FollowTallyUpdated", new
                {
                    targetUserId = targetId,
                    personaKey,
                    followersCount,
                    occurredAt = DateTime.UtcNow
                }, ct);

                // Notification if real user target
                if (targetId != Guid.Empty)
                {
                    _ = _notificationService.SendAsync(
                        targetId,
                        NotificationType.Follow,
                        actorId: followerId,
                        content: "started following you",
                        cancellationToken: ct);
                }
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "SignalR notification for follow toggle skipped.");
            }
        }

        return Ok(new
        {
            success = true,
            nowFollowing,
            followerId,
            targetUserId = targetId,
            personaKey,
            followersCount,
            followingCount
        });
    }

    /// <summary>
    /// Checks follow status and followers tally for a specific user ID or persona.
    /// </summary>
    [HttpGet("status/{targetUserId:guid}")]
    public IActionResult GetFollowStatus(Guid targetUserId, [FromQuery] string? personaKey = null)
    {
        var followerId = ResolveUserId();
        if (followerId == Guid.Empty)
        {
            followerId = ResolveOrCreateAnonymousId();
        }

        var isFollowing = _followStore.IsFollowing(followerId, targetUserId, personaKey);
        var followersCount = _followStore.GetFollowersCount(targetUserId, personaKey);
        var followingCount = _followStore.GetFollowingCount(followerId);

        return Ok(new
        {
            isFollowing,
            followerId,
            targetUserId,
            followersCount,
            followingCount
        });
    }

    /// <summary>
    /// Returns the complete follow tally for the current user and all Flock creator personas.
    /// Used by TheFlockCreatorsShelf and PostsFeed to show exact live counters.
    /// </summary>
    [HttpGet("tally")]
    public async Task<IActionResult> GetTally(CancellationToken ct)
    {
        var callerId = ResolveUserId();
        if (callerId == Guid.Empty)
        {
            callerId = ResolveOrCreateAnonymousId();
        }

        await _simulator.EnsureInitializedAsync(ct);
        var simStatus = _simulator.GetStatus();

        var personaList = new List<PersonaFollowTallyDto>();
        if (simStatus?.Personas != null)
        {
            foreach (var p in simStatus.Personas)
            {
                _followStore.RegisterPersona(p.Key, p.UserId, p.Username);
                personaList.Add(new PersonaFollowTallyDto
                {
                    Key = p.Key,
                    UserId = p.UserId,
                    Username = p.Username,
                    DisplayName = p.DisplayName,
                    Archetype = p.Archetype,
                    AvatarUrl = p.AvatarUrl
                });
            }
        }

        var tally = _followStore.GetTally(callerId, personaList);
        return Ok(tally);
    }

    /// <summary>
    /// Returns list of account IDs currently followed by the calling user.
    /// </summary>
    [HttpGet("following")]
    public IActionResult GetFollowing()
    {
        var callerId = ResolveUserId();
        if (callerId == Guid.Empty)
        {
            callerId = ResolveOrCreateAnonymousId();
        }

        var ids = _followStore.GetFollowingIds(callerId);
        var count = _followStore.GetFollowingCount(callerId);

        return Ok(new
        {
            followingCount = count,
            followingIds = ids
        });
    }

    /// <summary>
    /// Returns follower count for a specific target.
    /// </summary>
    [HttpGet("followers/{targetUserId:guid}")]
    public IActionResult GetFollowers(Guid targetUserId, [FromQuery] string? personaKey = null)
    {
        var count = _followStore.GetFollowersCount(targetUserId, personaKey);
        return Ok(new
        {
            targetUserId,
            followersCount = count
        });
    }

    private Guid ResolveUserId()
    {
        var raw = User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? User.FindFirstValue("sub")
            ?? User.FindFirstValue("userId");

        if (Guid.TryParse(raw, out var id) && id != Guid.Empty)
        {
            return id;
        }

        return Guid.Empty;
    }

    private Guid ResolveOrCreateAnonymousId()
    {
        var anonHeader = Request.Headers["X-Anonymous-User"].FirstOrDefault();
        if (Guid.TryParse(anonHeader, out var parsed) && parsed != Guid.Empty)
        {
            return parsed;
        }

        if (Request.Cookies.TryGetValue("wr_anon_id", out var cookieVal) && Guid.TryParse(cookieVal, out var cookieGuid))
        {
            return cookieGuid;
        }

        var newId = Guid.NewGuid();
        try
        {
            Response.Cookies.Append("wr_anon_id", newId.ToString(), new Microsoft.AspNetCore.Http.CookieOptions
            {
                Expires = DateTimeOffset.UtcNow.AddYears(1),
                HttpOnly = false,
                SameSite = Microsoft.AspNetCore.Http.SameSiteMode.Lax
            });
        }
        catch { }

        return newId;
    }

    public sealed class ToggleFollowRequest
    {
        public Guid TargetUserId { get; set; }
        public string? PersonaKey { get; set; }
        public string? TargetUsername { get; set; }
    }
}
