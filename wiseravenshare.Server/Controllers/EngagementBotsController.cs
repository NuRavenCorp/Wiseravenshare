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
    /// Returns the live status of all 14 authentic engagement personas,
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
}
