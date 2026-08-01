using System.ComponentModel.DataAnnotations;
using System.Diagnostics.CodeAnalysis;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.Models;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public sealed class GrowthController : ControllerBase
{
    private readonly UserStore _userStore;
    private readonly GrowthService _growthService;
    private readonly IConfiguration _configuration;

    public GrowthController(UserStore userStore, GrowthService growthService, IConfiguration configuration)
    {
        _userStore = userStore;
        _growthService = growthService;
        _configuration = configuration;
    }

    [HttpGet("onboarding")]
    public IActionResult GetOnboardingState()
    {
        if (!TryGetCurrentUser(out var user))
        {
            return Unauthorized(new { message = "Unable to resolve current user." });
        }

        var state = _growthService.GetOnboardingState(user);
        return Ok(state);
    }

    [HttpPost("events")]
    public IActionResult TrackEvent([FromBody] TrackEventRequest request)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return Unauthorized(new { message = "Unable to resolve current user." });
        }

        if (string.IsNullOrWhiteSpace(request.EventName))
        {
            return BadRequest(new { message = "eventName is required." });
        }

        _growthService.TrackEvent(user.Id, user.Email, request.EventName, request.Metadata);
        return Ok(new { success = true });
    }

    [HttpGet("funnel")]
    public IActionResult GetFunnelSummary([FromQuery] int days = 30)
    {
        var summary = _growthService.GetFunnelSummary(days);
        return Ok(summary);
    }

    [HttpPost("referrals/invite")]
    public IActionResult CreateInvite([FromBody] InviteRequest request)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return Unauthorized(new { message = "Unable to resolve current user." });
        }

        if (string.IsNullOrWhiteSpace(request.InviteeEmail) || !new EmailAddressAttribute().IsValid(request.InviteeEmail.Trim()))
        {
            return BadRequest(new { message = "A valid invitee email is required." });
        }

        try
        {
            var invite = _growthService.CreateInvite(user.Id, user.Email, request.InviteeEmail, request.Message ?? string.Empty);
            return Ok(new
            {
                invite,
                inviteLink = $"{Request.Scheme}://{Request.Host}/?ref={Uri.EscapeDataString(invite.Code)}"
            });
        }
        catch (InvalidOperationException ex)
        {
            return StatusCode(StatusCodes.Status429TooManyRequests, new { message = ex.Message });
        }
    }

    [HttpGet("referrals")]
    public IActionResult GetReferralStats()
    {
        if (!TryGetCurrentUser(out var user))
        {
            return Unauthorized(new { message = "Unable to resolve current user." });
        }

        var stats = _growthService.GetReferralStats(user.Id);
        return Ok(stats);
    }

    [HttpPost("moderation/check")]
    public IActionResult CheckModeration([FromBody] ModerationCheckRequest request)
    {
        var result = _growthService.EvaluateContent(request.Content ?? string.Empty);
        return Ok(result);
    }

    [HttpPost("moderation/report")]
    public IActionResult SubmitModerationReport([FromBody] ModerationReportRequest request)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return Unauthorized(new { message = "Unable to resolve current user." });
        }

        if (string.IsNullOrWhiteSpace(request.TargetType) || string.IsNullOrWhiteSpace(request.TargetId) || string.IsNullOrWhiteSpace(request.Reason))
        {
            return BadRequest(new { message = "targetType, targetId, and reason are required." });
        }

        try
        {
            var report = _growthService.SubmitReport(
                user.Id,
                user.Email,
                request.TargetType,
                request.TargetId,
                request.Reason,
                request.Details ?? string.Empty);

            return Ok(new { success = true, reportId = report.Id, createdAtUtc = report.CreatedAtUtc });
        }
        catch (InvalidOperationException ex)
        {
            return StatusCode(StatusCodes.Status429TooManyRequests, new { message = ex.Message });
        }
    }

    [HttpGet("moderation/reports")]
    public IActionResult GetModerationReports(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] string? status = null,
        [FromQuery] string? targetType = null,
        [FromQuery] bool includeResolved = false)
    {
        if (!IsAdminRequest())
        {
            return Forbid();
        }

        var queue = _growthService.GetModerationQueue(status, targetType, page, pageSize, includeResolved);
        return Ok(queue);
    }

    [HttpPost("moderation/reports/{reportId}/resolve")]
    public IActionResult ResolveModerationReport(string reportId, [FromBody] ModerationResolveRequest request)
    {
        if (!IsAdminRequest())
        {
            return Forbid();
        }

        if (!TryGetCurrentUser(out var user))
        {
            return Unauthorized(new { message = "Unable to resolve current user." });
        }

        if (string.IsNullOrWhiteSpace(reportId))
        {
            return BadRequest(new { message = "reportId is required." });
        }

        if (string.IsNullOrWhiteSpace(request.Outcome))
        {
            return BadRequest(new { message = "outcome is required." });
        }

        try
        {
            var report = _growthService.ResolveReport(reportId, user.Id, user.Email, request.Outcome, request.Notes ?? string.Empty);
            return Ok(new
            {
                success = true,
                reportId = report.Id,
                status = report.Status,
                reviewedAtUtc = report.ReviewedAtUtc
            });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpGet("revenue/agent")]
    public IActionResult GetRevenueAgent()
    {
        if (!TryGetCurrentUser(out var user))
        {
            return Unauthorized(new { message = "Unable to resolve current user." });
        }

        var plan = _growthService.GetOrCreateRevenueAgent(user.Id, user.Email);
        var summary = _growthService.GetRevenueSummary(user.Id, user.Email);
        return Ok(new { plan, summary });
    }

    [HttpGet("revenue/summary")]
    public IActionResult GetRevenueSummary()
    {
        if (!TryGetCurrentUser(out var user))
        {
            return Unauthorized(new { message = "Unable to resolve current user." });
        }

        var summary = _growthService.GetRevenueSummary(user.Id, user.Email);
        return Ok(summary);
    }

    [HttpGet("revenue/actions")]
    public IActionResult GetRevenueActions([FromQuery] int? weekNumber = null, [FromQuery] string? status = null)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return Unauthorized(new { message = "Unable to resolve current user." });
        }

        var items = _growthService.GetRevenueActions(user.Id, user.Email, weekNumber, status);
        return Ok(items);
    }

    [HttpPost("revenue/actions/{actionId}/status")]
    public IActionResult UpdateRevenueActionStatus(string actionId, [FromBody] RevenueActionStatusRequest request)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return Unauthorized(new { message = "Unable to resolve current user." });
        }

        if (string.IsNullOrWhiteSpace(actionId))
        {
            return BadRequest(new { message = "actionId is required." });
        }

        if (string.IsNullOrWhiteSpace(request.Status))
        {
            return BadRequest(new { message = "status is required." });
        }

        try
        {
            var action = _growthService.UpdateRevenueActionStatus(user.Id, user.Email, actionId, request.Status);
            return Ok(action);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpPost("revenue/evidence")]
    public IActionResult AddRevenueEvidence([FromBody] RevenueEvidenceCreateRequest request)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return Unauthorized(new { message = "Unable to resolve current user." });
        }

        if (request.AmountUsd <= 0)
        {
            return BadRequest(new { message = "amountUsd must be greater than 0." });
        }

        if (string.IsNullOrWhiteSpace(request.SourceType) || string.IsNullOrWhiteSpace(request.SourceReference))
        {
            return BadRequest(new { message = "sourceType and sourceReference are required." });
        }

        try
        {
            var evidence = _growthService.AddRevenueEvidence(
                user.Id,
                user.Email,
                request.WeekNumber,
                request.AmountUsd,
                request.SourceType,
                request.SourceReference,
                request.Notes ?? string.Empty);

            return Ok(evidence);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("revenue/evidence/{evidenceId}/verify")]
    public IActionResult VerifyRevenueEvidence(string evidenceId, [FromBody] RevenueEvidenceVerifyRequest request)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return Unauthorized(new { message = "Unable to resolve current user." });
        }

        if (!IsAdminRequest())
        {
            return Forbid();
        }

        if (string.IsNullOrWhiteSpace(evidenceId))
        {
            return BadRequest(new { message = "evidenceId is required." });
        }

        try
        {
            var evidence = _growthService.VerifyRevenueEvidence(
                user.Id,
                user.Email,
                evidenceId,
                request.Verified,
                user.Id,
                user.Email);

            return Ok(evidence);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpGet("revenue/evidence")]
    public IActionResult GetRevenueEvidence([FromQuery] int? weekNumber = null, [FromQuery] bool? verified = null)
    {
        if (!TryGetCurrentUser(out var user))
        {
            return Unauthorized(new { message = "Unable to resolve current user." });
        }

        var evidence = _growthService.GetRevenueEvidence(user.Id, user.Email, weekNumber, verified);
        return Ok(evidence);
    }

    private bool TryGetCurrentUser([NotNullWhen(true)] out UserRecord? user)
    {
        user = null;
        var subjectId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        if (string.IsNullOrWhiteSpace(subjectId))
        {
            return false;
        }

        return _userStore.TryGetById(subjectId, out user) && user is not null;
    }

    private bool IsAdminRequest()
    {
        var email = User.FindFirstValue(ClaimTypes.Email)
            ?? User.FindFirstValue("email")
            ?? string.Empty;

        if (string.IsNullOrWhiteSpace(email))
        {
            return false;
        }

        var configuredAdminEmails = _configuration.GetSection("Admin:Emails").Get<string[]>() ?? [];
        if (configuredAdminEmails.Any(value => string.Equals(value?.Trim(), email, StringComparison.OrdinalIgnoreCase)))
        {
            return true;
        }

        var configuredAuthUsers = _configuration.GetSection("Authentication:Users").GetChildren()
            .Select(section => section["Email"]?.Trim())
            .Where(value => !string.IsNullOrWhiteSpace(value));

        return configuredAuthUsers.Any(value => string.Equals(value, email, StringComparison.OrdinalIgnoreCase));
    }
}

public sealed class TrackEventRequest
{
    public string EventName { get; set; } = string.Empty;
    public Dictionary<string, string> Metadata { get; set; } = new(StringComparer.OrdinalIgnoreCase);
}

public sealed class InviteRequest
{
    public string InviteeEmail { get; set; } = string.Empty;
    public string? Message { get; set; }
}

public sealed class ModerationCheckRequest
{
    public string? Content { get; set; }
}

public sealed class ModerationReportRequest
{
    public string TargetType { get; set; } = string.Empty;
    public string TargetId { get; set; } = string.Empty;
    public string Reason { get; set; } = string.Empty;
    public string? Details { get; set; }
}

public sealed class ModerationResolveRequest
{
    public string Outcome { get; set; } = string.Empty;
    public string? Notes { get; set; }
}

public sealed class RevenueActionStatusRequest
{
    public string Status { get; set; } = string.Empty;
}

public sealed class RevenueEvidenceCreateRequest
{
    public int? WeekNumber { get; set; }
    public decimal AmountUsd { get; set; }
    public string SourceType { get; set; } = string.Empty;
    public string SourceReference { get; set; } = string.Empty;
    public string? Notes { get; set; }
}

public sealed class RevenueEvidenceVerifyRequest
{
    public bool Verified { get; set; }
}
