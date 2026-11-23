using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/access-gates")]
[Produces("application/json")]
public sealed class AccessGateController : ControllerBase
{
    private readonly AccessGateService _accessGateService;
    private readonly IConfiguration _configuration;
    private readonly ILogger<AccessGateController> _logger;

    public AccessGateController(
        AccessGateService accessGateService,
        IConfiguration configuration,
        ILogger<AccessGateController> logger)
    {
        _accessGateService = accessGateService;
        _configuration = configuration;
        _logger = logger;
    }

    /// <summary>
    /// Gets the current master gate status, user access state, and active discount info.
    /// Available to all users (authenticated or anonymous).
    /// </summary>
    [HttpGet("status")]
    [AllowAnonymous]
    public IActionResult GetStatus()
    {
        var status = _accessGateService.GetStatus(User);
        return Ok(status);
    }

    /// <summary>
    /// Admin endpoint: toggles the Master Feature Gate.
    /// When open (default), all users have full access to all features.
    /// When closed, default is locked until payment is received.
    /// </summary>
    [HttpPost("toggle")]
    [Authorize]
    public IActionResult ToggleGate([FromBody] ToggleGateRequest request)
    {
        if (!IsAdmin())
        {
            return Forbid();
        }

        var adminEmail = GetUserEmail();
        _accessGateService.SetMasterGate(request.Open, adminEmail, request.Reason);
        var status = _accessGateService.GetStatus(User);

        return Ok(new
        {
            message = request.Open
                ? "Master gates OPEN: All users granted full access to all pricing features."
                : "Master gates CLOSED: Default is now LOCKED until payment is received.",
            status
        });
    }

    /// <summary>
    /// Admin endpoint: returns complete gate configuration, audit log, and payment grants.
    /// </summary>
    [HttpGet("admin-summary")]
    [Authorize]
    public IActionResult GetAdminSummary()
    {
        if (!IsAdmin())
        {
            return Forbid();
        }

        var fullState = _accessGateService.GetFullState();
        var status = _accessGateService.GetStatus(User);

        return Ok(new
        {
            status,
            state = fullState
        });
    }

    /// <summary>
    /// Admin endpoint: manually grants an all-access key to a user by email or ID.
    /// </summary>
    [HttpPost("grant-user")]
    [Authorize]
    public IActionResult GrantUser([FromBody] GrantUserRequest request)
    {
        if (!IsAdmin())
        {
            return Forbid();
        }

        var adminEmail = GetUserEmail();
        _accessGateService.GrantUserAccess(request.Identifier, adminEmail, request.Reason);

        return Ok(new
        {
            message = $"All-access key granted to '{request.Identifier}'.",
            identifier = request.Identifier
        });
    }

    /// <summary>
    /// Admin endpoint: revokes an all-access key from a user.
    /// </summary>
    [HttpPost("revoke-user")]
    [Authorize]
    public IActionResult RevokeUser([FromBody] GrantUserRequest request)
    {
        if (!IsAdmin())
        {
            return Forbid();
        }

        var adminEmail = GetUserEmail();
        _accessGateService.RevokeUserAccess(request.Identifier, adminEmail, request.Reason);

        return Ok(new
        {
            message = $"Access key revoked for '{request.Identifier}'.",
            identifier = request.Identifier
        });
    }

    /// <summary>
    /// Records payment received for a user, granting access to all gates permanently.
    /// </summary>
    [HttpPost("record-payment")]
    [Authorize]
    public IActionResult RecordPayment([FromBody] RecordPaymentRequest request)
    {
        var currentUserId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub") ?? string.Empty;
        var currentUserEmail = GetUserEmail();

        var targetUserId = string.IsNullOrWhiteSpace(request.UserId) ? currentUserId : request.UserId.Trim();
        var targetEmail = string.IsNullOrWhiteSpace(request.Email) ? currentUserEmail : request.Email.Trim();

        // Non-admins can only record payment for themselves
        if (!IsAdmin() && !string.Equals(targetUserId, currentUserId, StringComparison.OrdinalIgnoreCase)
            && !string.Equals(targetEmail, currentUserEmail, StringComparison.OrdinalIgnoreCase))
        {
            return Forbid();
        }

        _accessGateService.RecordPaymentReceived(
            targetUserId,
            targetEmail,
            request.PlanKey ?? "all_gates_unlocked",
            request.Source ?? "manual_confirmation",
            request.Notes);

        return Ok(new
        {
            message = $"Payment confirmed. All gates unlocked for user '{targetUserId}' ({targetEmail}).",
            userId = targetUserId,
            email = targetEmail,
            planKey = request.PlanKey ?? "all_gates_unlocked"
        });
    }

    private bool IsAdmin()
    {
        if (AuthAccessPolicy.IsAllAccessAdmin(User))
        {
            return true;
        }

        var email = GetUserEmail();
        return AuthAccessPolicy.IsConfiguredAdminEmail(_configuration, email);
    }

    private string GetUserEmail()
    {
        return User.FindFirstValue(ClaimTypes.Email)
            ?? User.FindFirstValue("email")
            ?? User.FindFirstValue(ClaimTypes.Name)
            ?? string.Empty;
    }
}

public sealed class ToggleGateRequest
{
    public bool Open { get; set; }
    public string? Reason { get; set; }
}

public sealed class GrantUserRequest
{
    public string Identifier { get; set; } = string.Empty;
    public string? Reason { get; set; }
}

public sealed class RecordPaymentRequest
{
    public string? UserId { get; set; }
    public string? Email { get; set; }
    public string? PlanKey { get; set; }
    public string? Source { get; set; }
    public string? Notes { get; set; }
}
