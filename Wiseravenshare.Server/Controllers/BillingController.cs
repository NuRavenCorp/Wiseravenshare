using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using Stripe;
using Wiseravenshare.Server.Exceptions;
using Wiseravenshare.Server.DTOs;
using Wiseravenshare.Server.Infrastructure.Data;
using Wiseravenshare.Server.Models;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public class BillingController : ControllerBase
{
    private readonly ISubscriptionService _subscriptionService;
    private readonly AppDbContext _db;

    public BillingController(ISubscriptionService subscriptionService, AppDbContext db)
    {
        _subscriptionService = subscriptionService;
        _db = db;
    }

    [Authorize]
    [HttpPost("checkout-session")]
    [ProducesResponseType(typeof(CheckoutSessionResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> CreateCheckoutSession([FromBody] global::Wiseravenshare.Server.DTOs.CreateCheckoutSessionRequest request)
    {
        var verificationResult = await EnsureEmailVerifiedForPurchaseAsync();
        if (verificationResult is not null)
        {
            return verificationResult;
        }

        try
        {
            var userId = User.GetUserId();
            var result = await _subscriptionService.CreateCheckoutSessionAsync(userId, request);
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new ErrorResponse { Message = ex.Message });
        }
        catch (StripeException ex)
        {
            return BadRequest(new ErrorResponse { Message = ex.StripeError?.Message ?? ex.Message });
        }
        catch (NotFoundException ex)
        {
            return NotFound(new ErrorResponse { Message = ex.Message });
        }
    }

    [Authorize]
    [HttpPost("portal-session")]
    [ProducesResponseType(typeof(PortalSessionResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> CreatePortalSession([FromBody] global::Wiseravenshare.Server.DTOs.CreatePortalSessionRequest request)
    {
        try
        {
            var userId = User.GetUserId();
            var result = await _subscriptionService.CreatePortalSessionAsync(userId, request);
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new ErrorResponse { Message = ex.Message });
        }
        catch (StripeException ex)
        {
            return BadRequest(new ErrorResponse { Message = ex.StripeError?.Message ?? ex.Message });
        }
        catch (NotFoundException ex)
        {
            return NotFound(new ErrorResponse { Message = ex.Message });
        }
    }

    [Authorize]
    [HttpGet("subscription")]
    [ProducesResponseType(typeof(SubscriptionStatusDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetSubscription()
    {
        if (IsAllAccessAdmin())
        {
            var now = DateTime.UtcNow;
            return Ok(new SubscriptionStatusDto
            {
                HasActiveSubscription = true,
                Status = "admin_all_access",
                PriceId = "admin-pass",
                CurrentPeriodEnd = now.AddYears(10),
                CancelAtPeriodEnd = false,
                StripeCustomerId = "admin-pass",
                StripeSubscriptionId = "admin-pass"
            });
        }

        var userId = User.GetUserId();
        var result = await _subscriptionService.GetSubscriptionStatusAsync(userId);
        return Ok(result);
    }

    [Authorize]
    [HttpGet("webhook-workflow")]
    [ProducesResponseType(typeof(StripeWebhookWorkflowStatusDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetWebhookWorkflowStatus()
    {
        if (!IsAllAccessAdmin())
        {
            return Forbid();
        }

        var result = await _subscriptionService.GetWebhookWorkflowStatusAsync(includeAllSubscriptions: true);
        return Ok(result);
    }

    private bool IsAllAccessAdmin()
    {
        var accessScope = User.FindFirstValue("access_scope") ?? string.Empty;
        if (string.Equals(accessScope, "admin", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        var adminPassClaim = User.FindFirstValue("admin_pass") ?? string.Empty;
        return string.Equals(adminPassClaim, "all-access", StringComparison.OrdinalIgnoreCase);
    }

    private async Task<IActionResult?> EnsureEmailVerifiedForPurchaseAsync()
    {
        if (IsAllAccessAdmin())
        {
            return null;
        }

        var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        if (string.IsNullOrWhiteSpace(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
        {
            return Unauthorized(new
            {
                message = "User context is missing. Please sign in again.",
                code = "missing_user_context"
            });
        }

        var user = await _db.Users.AsNoTracking().SingleOrDefaultAsync(x => x.Id == userId);
        if (user is null || !user.IsVerified)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new
            {
                message = "Email verification is required before completing a purchase.",
                code = "email_not_verified"
            });
        }

        return null;
    }

    [AllowAnonymous]
    [HttpPost("webhook")]
    public async Task<IActionResult> Webhook()
    {
        using var reader = new StreamReader(HttpContext.Request.Body);
        var payload = await reader.ReadToEndAsync();
        var signature = Request.Headers["Stripe-Signature"].ToString();

        try
        {
            await _subscriptionService.HandleWebhookAsync(payload, signature);
            return Ok();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new ErrorResponse { Message = ex.Message });
        }
        catch (StripeException ex)
        {
            return BadRequest(new ErrorResponse { Message = ex.StripeError?.Message ?? ex.Message });
        }
    }
}
