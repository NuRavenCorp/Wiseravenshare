using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.Services.Simulation;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/engagement-bots")]
public sealed class EngagementBotsController : ControllerBase
{
    private readonly EngagementSimulatorService _simulator;

    public EngagementBotsController(EngagementSimulatorService simulator)
    {
        _simulator = simulator;
    }

    /// <summary>
    /// Returns the live status of all 24 authentic engagement personas across cohorts,
    /// their active/resting cycle state, post counts, and lifetime statistics.
    /// </summary>
    [HttpGet("status")]
    public async Task<IActionResult> GetStatus(CancellationToken ct)
    {
        await _simulator.EnsureInitializedAsync(ct);
        var status = _simulator.GetStatus();
        return Ok(status);
    }

    /// <summary>
    /// Manually triggers a cadence tick across all personas for testing and verification.
    /// </summary>
    [HttpPost("trigger")]
    public async Task<IActionResult> TriggerTick(CancellationToken ct)
    {
        var actionsCount = await _simulator.RunCadenceTickAsync(ct);
        var status = _simulator.GetStatus();
        return Ok(new
        {
            success = true,
            actionsPerformed = actionsCount,
            status
        });
    }

    /// <summary>
    /// Ensures all 14 Flock personas follow all logged in and registered users.
    /// </summary>
    [HttpPost("follow-users")]
    [AllowAnonymous]
    public IActionResult FollowUsers()
    {
        var followStore = HttpContext.RequestServices.GetService<Wiseravenshare.Server.Services.FollowStore>();
        var userStore = HttpContext.RequestServices.GetService<Wiseravenshare.Server.Services.UserStore>();

        var userIds = new List<System.Guid>();
        if (userStore != null)
        {
            foreach (var u in userStore.GetAllUsersSnapshot())
            {
                if (System.Guid.TryParse(u.Id, out var g))
                {
                    userIds.Add(g);
                }
            }
        }

        var callerId = System.Guid.Empty;
        var sub = User?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (System.Guid.TryParse(sub, out var parsedCaller)) callerId = parsedCaller;
        if (callerId != System.Guid.Empty && !userIds.Contains(callerId))
        {
            userIds.Add(callerId);
        }

        var followedCount = followStore != null ? followStore.HaveBotsFollowAllUsers(userIds) : 0;
        return Ok(new
        {
            success = true,
            usersTargeted = userIds.Count,
            followRelationsEstablished = followedCount
        });
    }
}
