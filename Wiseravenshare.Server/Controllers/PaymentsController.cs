using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Stripe;
using Stripe.Checkout;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class PaymentsController : ControllerBase
{
    private readonly IConfiguration _configuration;

    public PaymentsController(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    [HttpGet("config")]
    [AllowAnonymous]
    public IActionResult GetPublicConfig()
    {
        var publishableKey = ResolveConfig("Stripe:PublishableKey", "STRIPE_PUBLISHABLE_KEY");
        return Ok(new
        {
            publishableKey,
            configured = !string.IsNullOrWhiteSpace(publishableKey)
        });
    }

    [HttpPost("checkout-session")]
    public IActionResult CreateCheckoutSession([FromBody] CreateCheckoutSessionRequest request)
    {
        var secretKey = ResolveConfig("Stripe:SecretKey", "STRIPE_SECRET_KEY");
        if (string.IsNullOrWhiteSpace(secretKey))
        {
            return StatusCode(StatusCodes.Status500InternalServerError, new { message = "Stripe secret key is not configured." });
        }

        var priceId = ResolvePriceId(request.BillingCycle);
        if (string.IsNullOrWhiteSpace(priceId))
        {
            return BadRequest(new { message = $"Stripe price id is not configured for {request.BillingCycle} billing." });
        }

        var successUrl = string.IsNullOrWhiteSpace(request.SuccessUrl)
            ? "https://wise-ravens.com/?subscription=success"
            : request.SuccessUrl.Trim();
        var cancelUrl = string.IsNullOrWhiteSpace(request.CancelUrl)
            ? "https://wise-ravens.com/?subscription=cancelled"
            : request.CancelUrl.Trim();

        StripeConfiguration.ApiKey = secretKey;

        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)
                     ?? User.FindFirstValue("sub")
                     ?? "anonymous";

        var options = new SessionCreateOptions
        {
            Mode = "subscription",
            SuccessUrl = successUrl,
            CancelUrl = cancelUrl,
            ClientReferenceId = userId,
            LineItems = new List<SessionLineItemOptions>
            {
                new()
                {
                    Price = priceId,
                    Quantity = 1
                }
            },
            Metadata = new Dictionary<string, string>
            {
                ["plan"] = request.Plan,
                ["billingCycle"] = request.BillingCycle,
                ["userId"] = userId
            }
        };

        var service = new SessionService();
        var session = service.Create(options);

        return Ok(new
        {
            id = session.Id,
            url = session.Url
        });
    }

    private string ResolvePriceId(string billingCycle)
    {
        var normalized = string.Equals(billingCycle, "annual", StringComparison.OrdinalIgnoreCase)
            ? "annual"
            : "monthly";

        return normalized == "annual"
            ? ResolveConfig("Stripe:PriceAnnualId", "STRIPE_PRICE_ANNUAL_ID")
            : ResolveConfig("Stripe:PriceMonthlyId", "STRIPE_PRICE_MONTHLY_ID");
    }

    private string ResolveConfig(string sectionKey, string envKey)
    {
        return (_configuration[sectionKey] ?? _configuration[envKey] ?? string.Empty).Trim();
    }
}

public sealed class CreateCheckoutSessionRequest
{
    public string Plan { get; set; } = "creator_pro";
    public string BillingCycle { get; set; } = "monthly";
    public string? SuccessUrl { get; set; }
    public string? CancelUrl { get; set; }
}
