using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.Entities.Communique;
using Wiseravenshare.Server.Services.Communique;
using Wiseravenshare.Server.Shared;

namespace Wiseravenshare.Server.Controllers.Communique;

[ApiController]
[Route("api/communique/calls")]
[Authorize]
public class CommuniqueCallsController : ControllerBase
{
    private readonly ICommuniqueCallService _callService;
    private readonly IWebRTCService _webRTCService;

    public CommuniqueCallsController(ICommuniqueCallService callService, IWebRTCService webRTCService)
    {
        _callService = callService;
        _webRTCService = webRTCService;
    }

    [HttpGet("history")]
    public async Task<IActionResult> GetCallHistory([FromQuery] int limit = 50)
    {
        var userId = User.GetUserId().ToString();
        if (userId == Guid.Empty.ToString())
            return Unauthorized(new { error = "User identity is not available." });

        var history = await _callService.GetCallHistory(userId, limit);
        return Ok(history);
    }

    [HttpGet("active")]
    public IActionResult GetActiveCalls()
    {
        return Ok(new { message = "Call state retrieved" });
    }

    [HttpPost("forwarding/toggle")]
    public IActionResult ToggleForwarding([FromBody] ForwardingRequest request)
    {
        return Ok(new { success = true, message = "Forwarding toggled" });
    }

    [HttpPost("screening/toggle")]
    public IActionResult ToggleScreening([FromBody] ScreeningRequest request)
    {
        return Ok(new { success = true, message = "Screening toggled" });
    }

    [HttpGet("webrtc/config")]
    public async Task<IActionResult> GetWebRTCConfig()
    {
        var config = await _webRTCService.GetStunTurnConfig();
        return Ok(new { config });
    }

    [HttpGet("statistics")]
    public async Task<IActionResult> GetStatistics()
    {
        var userId = User.GetUserId().ToString();
        if (userId == Guid.Empty.ToString())
            return Unauthorized(new { error = "User identity is not available." });

        var stats = await _callService.GetCallStatistics(userId);
        return Ok(stats);
    }
}

public class ForwardingRequest
{
    public bool Enabled { get; set; }
    public string ForwardToNumber { get; set; } = string.Empty;
}

public class ScreeningRequest
{
    public bool Enabled { get; set; }
    public bool WhitelistMode { get; set; }
    public bool AnnounceCaller { get; set; }
}
