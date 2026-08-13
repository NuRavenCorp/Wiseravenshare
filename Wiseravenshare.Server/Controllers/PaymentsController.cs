using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Stripe;
using Stripe.Checkout;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class PaymentsController : ControllerBase
{
    private readonly IConfiguration _configuration;
    private readonly GrowthService _growthService;
    private readonly UserStore _userStore;
    private readonly ILogger<PaymentsController> _logger;

    public PaymentsController(
        IConfiguration configuration,
        GrowthService growthService,
        UserStore userStore,
        ILogger<PaymentsController> logger)
    {
        _configuration = configuration;
        _growthService = growthService;
        _userStore = userStore;
        _logger = logger;
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

        var plan = string.IsNullOrWhiteSpace(request.Plan) ? "creator_pro" : request.Plan.Trim();
        var priceId = ResolvePriceId(plan, request.BillingCycle);
        if (string.IsNullOrWhiteSpace(priceId))
        {
            return BadRequest(new { message = $"Stripe price id is not configured for the {plan} {request.BillingCycle} plan." });
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

        Session session;
        try
        {
            var service = new SessionService();
            session = service.Create(options);
        }
        catch (StripeException ex)
        {
            _logger.LogError(ex, "Stripe checkout session creation failed.");
            return BadRequest(new { message = ex.StripeError?.Message ?? ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error while creating Stripe checkout session.");
            return StatusCode(StatusCodes.Status500InternalServerError, new { message = "Failed to create checkout session." });
        }

        try
        {
            var email = string.Empty;
            if (_userStore.TryGetById(userId, out var user) && user is not null)
            {
                email = user.Email;
            }

            _growthService.TrackEvent(
                userId,
                email,
                "checkout_started",
                new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
                {
                    ["source"] = "payments_controller",
                    ["plan"] = request.Plan,
                    ["billingCycle"] = request.BillingCycle,
                    ["checkoutSessionId"] = session.Id ?? string.Empty
                });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Growth tracking failed during checkout session creation for user {UserId}.", userId);
        }

        return Ok(new
        {
            id = session.Id,
            url = session.Url
        });
    }

    private string ResolvePriceId(string plan, string billingCycle)
    {
        var normalizedPlan = string.IsNullOrWhiteSpace(plan) ? "creator_pro" : plan.Trim();
        var normalizedCycle = string.Equals(billingCycle, "annual", StringComparison.OrdinalIgnoreCase)
            ? "annual"
            : "monthly";

        var planKey = normalizedPlan.ToLowerInvariant() switch
        {
            "creator_pro" => "CreatorPro",
            "growth_suite" => "GrowthSuite",
            "studio_plus" => "StudioPlus",
            _ => "CreatorPro"
        };

        var sectionKey = normalizedCycle == "annual"
            ? $"Stripe:Price{planKey}AnnualId"
            : $"Stripe:Price{planKey}MonthlyId";

        var envKey = normalizedCycle == "annual"
            ? $"STRIPE_PRICE_{planKey.ToUpperInvariant()}_ANNUAL_ID"
            : $"STRIPE_PRICE_{planKey.ToUpperInvariant()}_MONTHLY_ID";

        var resolved = ResolveConfig(sectionKey, envKey);
        if (!string.IsNullOrWhiteSpace(resolved))
        {
            return resolved;
        }

        var legacySectionKey = normalizedCycle == "annual"
            ? "Stripe:PriceAnnualId"
            : "Stripe:PriceMonthlyId";

        var legacyEnvKey = normalizedCycle == "annual"
            ? "STRIPE_PRICE_ANNUAL_ID"
            : "STRIPE_PRICE_MONTHLY_ID";

        return ResolveConfig(legacySectionKey, legacyEnvKey);
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
