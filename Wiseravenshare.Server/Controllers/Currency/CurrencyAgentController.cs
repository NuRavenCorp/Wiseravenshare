// Wiseravenshare.Server/Controllers/Currency/CurrencyAgentController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.Services.Currency;
using Wiseravenshare.Server.Shared;

namespace Wiseravenshare.Server.Controllers.Currency;

[ApiController]
[Route("api/currency-agent")]
[Authorize]
[Produces("application/json")]
public class CurrencyAgentController : ControllerBase
{
    private readonly ICurrencyAgentService _currencyAgent;
    private readonly ILogger<CurrencyAgentController> _logger;

    public CurrencyAgentController(ICurrencyAgentService currencyAgent, ILogger<CurrencyAgentController> logger)
    {
        _currencyAgent = currencyAgent;
        _logger = logger;
    }

    /// <summary>Submit work hours for verification (WSC is minted only after approval).</summary>
    [HttpPost("work-hours")]
    public async Task<IActionResult> SubmitWorkHours([FromBody] WorkHourSubmission submission)
    {
        var userId = User.GetUserId();
        var result = await _currencyAgent.SubmitWorkHoursAsync(userId, submission);
        return result.Success ? Ok(result) : BadRequest(new { error = result.Error });
    }

    /// <summary>Verify/reject a work hour submission (Moderator/Admin only).</summary>
    [HttpPost("work-hours/{submissionId:guid}/verify")]
    [Authorize(Roles = "Admin,Moderator,TruthGuardian")]
    public async Task<IActionResult> VerifyWorkHours(Guid submissionId, [FromBody] VerifyWorkHoursRequest request)
    {
        var verifierId = User.GetUserId();
        var result = await _currencyAgent.VerifyWorkHoursAsync(submissionId, verifierId, request.Approved, request.Notes);
        return result.Success ? Ok(result) : BadRequest(new { error = result.Error });
    }

    /// <summary>Get the user's currency dashboard summary.</summary>
    [HttpGet("dashboard")]
    public async Task<IActionResult> GetDashboard()
    {
        var userId = User.GetUserId();
        return Ok(await _currencyAgent.GetUserCurrencySummaryAsync(userId));
    }

    /// <summary>Conversational command interface for the currency agent.</summary>
    [HttpPost("chat")]
    public async Task<IActionResult> Chat([FromBody] ChatRequest request)
    {
        var userId = User.GetUserId();
        var response = await _currencyAgent.ProcessConversationalCommandAsync(userId, request.Command);
        return Ok(new { response });
    }

    /// <summary>Currency health report (Admin only).</summary>
    [HttpGet("health")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> GetHealth() => Ok(await _currencyAgent.GetCurrencyHealthAsync());

    /// <summary>Anomaly report (Admin only).</summary>
    [HttpGet("anomalies")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> GetAnomalies() => Ok(await _currencyAgent.DetectAnomaliesAsync());
}

public class VerifyWorkHoursRequest
{
    public bool Approved { get; set; }
    public string? Notes { get; set; }
}

public class ChatRequest
{
    public string Command { get; set; } = string.Empty;
}
