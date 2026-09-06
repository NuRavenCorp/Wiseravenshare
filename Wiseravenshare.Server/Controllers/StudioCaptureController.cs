using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.DTOs;
using Wiseravenshare.Server.Services.StudioCapture;
using Wiseravenshare.Server.Shared;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/studio-capture")]
[Authorize]
public sealed class StudioCaptureController : ControllerBase
{
    private readonly IStudioCaptureService _studioCaptureService;

    public StudioCaptureController(IStudioCaptureService studioCaptureService)
    {
        _studioCaptureService = studioCaptureService;
    }

    [HttpGet("profile")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<StudioCaptureRigProfileResponse?>> GetProfile(CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        var profile = await _studioCaptureService.GetRigProfileAsync(userId, cancellationToken);
        return Ok(profile);
    }

    [HttpPost("profile")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<StudioCaptureRigProfileResponse>> UpsertProfile(
        [FromBody] UpsertStudioCaptureRigProfileRequest request,
        CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        if (request.AnalogInputChannels <= 0)
        {
            return BadRequest(new { message = "AnalogInputChannels must be greater than 0." });
        }

        var profile = await _studioCaptureService.UpsertRigProfileAsync(userId, request, cancellationToken);
        return Ok(profile);
    }

    [HttpGet("sources")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<IReadOnlyList<StudioCaptureSourceCaptureResponse>>> GetRecentSources(
        [FromQuery] int limit = 20,
        CancellationToken cancellationToken = default)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        var items = await _studioCaptureService.GetRecentSourceCapturesAsync(userId, limit, cancellationToken);
        return Ok(items);
    }

    [HttpPost("sources")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<StudioCaptureSourceCaptureResponse>> RecordSource(
        [FromBody] RecordStudioCaptureSourceRequest request,
        CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        if (string.IsNullOrWhiteSpace(request.SourceName))
        {
            return BadRequest(new { message = "SourceName is required." });
        }

        if (string.IsNullOrWhiteSpace(request.DeviceIdentifier))
        {
            return BadRequest(new { message = "DeviceIdentifier is required." });
        }

        var result = await _studioCaptureService.RecordSourceCaptureAsync(userId, request, cancellationToken);
        return Ok(result);
    }
}
