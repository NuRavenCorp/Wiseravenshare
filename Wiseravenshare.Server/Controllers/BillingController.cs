using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using Stripe;
using Wiseravenshare.Server.Exceptions;
using Wiseravenshare.Server.DTOs;
using Wiseravenshare.Server.Models;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public class BillingController : ControllerBase
{
    private readonly ISubscriptionService _subscriptionService;

    public BillingController(ISubscriptionService subscriptionService)
    {
        _subscriptionService = subscriptionService;
    }

    [Authorize]
    [HttpPost("checkout-session")]
    [ProducesResponseType(typeof(CheckoutSessionResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> CreateCheckoutSession([FromBody] global::Wiseravenshare.Server.DTOs.CreateCheckoutSessionRequest request)
    {
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
