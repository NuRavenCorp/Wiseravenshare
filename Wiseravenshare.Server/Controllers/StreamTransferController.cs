using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using Wiseravenshare.Server.Services.StreamBridge;

namespace Wiseravenshare.Server.Controllers;

/// <summary>
/// Creator-facing transfer endpoint — used by WiseRavenShare to send media to WiseRavenStream.
/// </summary>
[ApiController]
[Route("api/stream-transfer")]
[Authorize]
public class StreamTransferController : ControllerBase
{
    private readonly IStreamTransferService _svc;
    private readonly ILogger<StreamTransferController> _logger;

    public StreamTransferController(IStreamTransferService svc, ILogger<StreamTransferController> logger)
    {
        _svc = svc;
        _logger = logger;
    }

    private string CurrentUserId =>
        User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? User.FindFirstValue("sub")
        ?? User.FindFirstValue("id")
        ?? throw new InvalidOperationException("User identity not found.");

    /// <summary>Initiate a transfer from WiseRavenShare to WiseRavenStream.</summary>
    [HttpPost]
    [ProducesResponseType(typeof(TransferDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Initiate([FromBody] InitiateTransferRequest req, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.VideoUrl) || string.IsNullOrWhiteSpace(req.Title))
            return BadRequest(new { error = "videoUrl and title are required." });

        var result = await _svc.InitiateAsync(req with { SourceCreatorId = CurrentUserId }, ct);
        return CreatedAtAction(nameof(Get), new { id = result.Id }, result);
    }

    /// <summary>Poll transfer status.</summary>
    [HttpGet("{id:guid}")]
    [ProducesResponseType(typeof(TransferDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        var result = await _svc.GetAsync(id, ct);
        return result is null ? NotFound() : Ok(result);
    }

    /// <summary>Retry a failed transfer (max 3 attempts).</summary>
    [HttpPost("{id:guid}/retry")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Retry(Guid id, CancellationToken ct)
    {
        var ok = await _svc.RetryAsync(id, ct);
        return ok ? NoContent() : BadRequest(new { error = "Cannot retry: not found or max retries exceeded." });
    }

    /// <summary>Cancel a pending transfer.</summary>
    [HttpDelete("{id:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Cancel(Guid id, CancellationToken ct)
    {
        await _svc.CancelAsync(id, ct);
        return NoContent();
    }
}

/// <summary>
/// Admin-only gatekeeper dashboard endpoint.
/// </summary>
[ApiController]
[Route("api/stream-gatekeeper")]
[Authorize(Roles = "Admin,Moderator")]
public class StreamGatekeeperController : ControllerBase
{
    private readonly IStreamTransferService _svc;

    public StreamGatekeeperController(IStreamTransferService svc)
    {
        _svc = svc;
    }

    private string CurrentAdminId =>
        User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? User.FindFirstValue("sub")
        ?? throw new InvalidOperationException("Admin identity not found.");

    /// <summary>Get all transfers awaiting human review.</summary>
    [HttpGet("queue")]
    [ProducesResponseType(typeof(IReadOnlyList<TransferDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetQueue(CancellationToken ct)
    {
        var queue = await _svc.GetPendingReviewAsync(ct);
        return Ok(queue);
    }

    /// <summary>Submit a gatekeeper decision on a flagged transfer.</summary>
    [HttpPost("{id:guid}/decision")]
    [ProducesResponseType(typeof(TransferDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Decide(
        Guid id,
        [FromBody] GatekeeperDecisionRequest req,
        CancellationToken ct)
    {
        var allowed = new[] { "Cleared", "RequiresEdit", "Escalated", "Rejected" };
        if (!allowed.Contains(req.Action))
            return BadRequest(new { error = $"action must be one of: {string.Join(", ", allowed)}" });

        if (string.IsNullOrWhiteSpace(req.Rationale) || req.Rationale.Trim().Length < 10)
            return BadRequest(new { error = "rationale must be at least 10 characters." });

        try
        {
            var result = await _svc.ApplyGatekeeperDecisionAsync(id, CurrentAdminId, req, ct);
            return Ok(result);
        }
        catch (KeyNotFoundException)
        {
            return NotFound();
        }
    }
}

