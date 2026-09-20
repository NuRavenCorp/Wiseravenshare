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
        var publishableKey = ResolveConfig("Stripe:PublishableKey", "STRIPE_PUBLISHABLE_API", "STRIPE_PUBLISHABLE_KEY");
        return Ok(new
        {
            publishableKey,
            configured = !string.IsNullOrWhiteSpace(publishableKey)
        });
    }

    [HttpGet("catalog")]
    [AllowAnonymous]
    public IActionResult GetCatalog()
    {
        var catalog = new[]
        {
            BuildCatalogPlan(
                planId: "ip_basic",
                name: "IP Protection Basic",
                tagline: "Proof-of-creation and DMCA starter protection",
                badge: "Entry level",
                defaultMonthlyAmount: 5,
                defaultAnnualAmount: 50),
            BuildCatalogPlan(
                planId: "ip_standard",
                name: "IP Protection Standard",
                tagline: "Monitoring and takedown support",
                badge: "Popular",
                defaultMonthlyAmount: 15,
                defaultAnnualAmount: 150),
            BuildCatalogPlan(
                planId: "ip_pro",
                name: "IP Protection Pro",
                tagline: "Full IP protection and licensing support",
                badge: "Best value",
                defaultMonthlyAmount: 30,
                defaultAnnualAmount: 300),
            BuildCatalogPlan(
                planId: "creator_pro",
                name: "Creator Pro",
                tagline: "For solo creators shipping consistently",
                badge: "Most popular",
                defaultMonthlyAmount: 19,
                defaultAnnualAmount: 190),
            BuildCatalogPlan(
                planId: "growth_suite",
                name: "Growth Suite",
                tagline: "For creators scaling their audience",
                badge: "Best for growth",
                defaultMonthlyAmount: 39,
                defaultAnnualAmount: 390),
            BuildCatalogPlan(
                planId: "studio_plus",
                name: "Studio Plus",
                tagline: "For teams and agencies",
                badge: "For teams",
                defaultMonthlyAmount: 79,
                defaultAnnualAmount: 790)
        };

        return Ok(new
        {
            source = "stripe_config",
            plans = catalog
        });
    }

    [HttpGet("health")]
    [AllowAnonymous]
    public IActionResult GetStripeHealth()
    {
        var publishableKey = ResolveConfig("Stripe:PublishableKey", "STRIPE_PUBLISHABLE_API", "STRIPE_PUBLISHABLE_KEY");
        var secretKey = ResolveConfig("Stripe:SecretKey", "STRIPE_SECRET_API", "STRIPE_RESTRICTED_API", "STRIPE_SECRET_KEY");
        var webhookSecret = ResolveConfig("Stripe:WebhookSecret", "STRIPE_WEBHOOK_SECRET");

        var creatorProMonthly = ResolvePriceIdRaw("creator_pro", "monthly");
        var creatorProAnnual = ResolvePriceIdRaw("creator_pro", "annual");
        var ipBasicMonthly = ResolvePriceIdRaw("ip_basic", "monthly");
        var ipBasicAnnual = ResolvePriceIdRaw("ip_basic", "annual");
        var ipStandardMonthly = ResolvePriceIdRaw("ip_standard", "monthly");
        var ipStandardAnnual = ResolvePriceIdRaw("ip_standard", "annual");
        var ipProMonthly = ResolvePriceIdRaw("ip_pro", "monthly");
        var ipProAnnual = ResolvePriceIdRaw("ip_pro", "annual");
        var growthSuiteMonthly = ResolvePriceIdRaw("growth_suite", "monthly");
        var growthSuiteAnnual = ResolvePriceIdRaw("growth_suite", "annual");
        var studioPlusMonthly = ResolvePriceIdRaw("studio_plus", "monthly");
        var studioPlusAnnual = ResolvePriceIdRaw("studio_plus", "annual");

        var issues = new List<string>();

        if (string.IsNullOrWhiteSpace(publishableKey)) issues.Add("missing: Stripe publishable key");
        if (string.IsNullOrWhiteSpace(secretKey)) issues.Add("missing: Stripe secret key");
        if (string.IsNullOrWhiteSpace(webhookSecret)) issues.Add("missing: Stripe webhook secret");

        if (string.IsNullOrWhiteSpace(creatorProMonthly)) issues.Add("missing: creator_pro monthly price id");
        else if (!IsStripePriceId(creatorProMonthly)) issues.Add("invalid: creator_pro monthly must start with price_");

        if (string.IsNullOrWhiteSpace(creatorProAnnual)) issues.Add("missing: creator_pro annual price id");
        else if (!IsStripePriceId(creatorProAnnual)) issues.Add("invalid: creator_pro annual must start with price_");

        if (string.IsNullOrWhiteSpace(ipBasicMonthly)) issues.Add("missing: ip_basic monthly price id");
        else if (!IsStripePriceId(ipBasicMonthly)) issues.Add("invalid: ip_basic monthly must start with price_");

        if (string.IsNullOrWhiteSpace(ipBasicAnnual)) issues.Add("missing: ip_basic annual price id");
        else if (!IsStripePriceId(ipBasicAnnual)) issues.Add("invalid: ip_basic annual must start with price_");

        if (string.IsNullOrWhiteSpace(ipStandardMonthly)) issues.Add("missing: ip_standard monthly price id");
        else if (!IsStripePriceId(ipStandardMonthly)) issues.Add("invalid: ip_standard monthly must start with price_");

        if (string.IsNullOrWhiteSpace(ipStandardAnnual)) issues.Add("missing: ip_standard annual price id");
        else if (!IsStripePriceId(ipStandardAnnual)) issues.Add("invalid: ip_standard annual must start with price_");

        if (string.IsNullOrWhiteSpace(ipProMonthly)) issues.Add("missing: ip_pro monthly price id");
        else if (!IsStripePriceId(ipProMonthly)) issues.Add("invalid: ip_pro monthly must start with price_");

        if (string.IsNullOrWhiteSpace(ipProAnnual)) issues.Add("missing: ip_pro annual price id");
        else if (!IsStripePriceId(ipProAnnual)) issues.Add("invalid: ip_pro annual must start with price_");

        if (string.IsNullOrWhiteSpace(growthSuiteMonthly)) issues.Add("missing: growth_suite monthly price id");
        else if (!IsStripePriceId(growthSuiteMonthly)) issues.Add("invalid: growth_suite monthly must start with price_");

        if (string.IsNullOrWhiteSpace(growthSuiteAnnual)) issues.Add("missing: growth_suite annual price id");
        else if (!IsStripePriceId(growthSuiteAnnual)) issues.Add("invalid: growth_suite annual must start with price_");

        if (string.IsNullOrWhiteSpace(studioPlusMonthly)) issues.Add("missing: studio_plus monthly price id");
        else if (!IsStripePriceId(studioPlusMonthly)) issues.Add("invalid: studio_plus monthly must start with price_");

        if (string.IsNullOrWhiteSpace(studioPlusAnnual)) issues.Add("missing: studio_plus annual price id");
        else if (!IsStripePriceId(studioPlusAnnual)) issues.Add("invalid: studio_plus annual must start with price_");

        return Ok(new
        {
            configured = issues.Count == 0,
            keys = new
            {
                publishableKeyConfigured = !string.IsNullOrWhiteSpace(publishableKey),
                secretKeyConfigured = !string.IsNullOrWhiteSpace(secretKey),
                webhookSecretConfigured = !string.IsNullOrWhiteSpace(webhookSecret)
            },
            plans = new
            {
                ip_basic = new
                {
                    monthly = new { value = ipBasicMonthly, validPriceId = IsStripePriceId(ipBasicMonthly) },
                    annual = new { value = ipBasicAnnual, validPriceId = IsStripePriceId(ipBasicAnnual) }
                },
                ip_standard = new
                {
                    monthly = new { value = ipStandardMonthly, validPriceId = IsStripePriceId(ipStandardMonthly) },
                    annual = new { value = ipStandardAnnual, validPriceId = IsStripePriceId(ipStandardAnnual) }
                },
                ip_pro = new
                {
                    monthly = new { value = ipProMonthly, validPriceId = IsStripePriceId(ipProMonthly) },
                    annual = new { value = ipProAnnual, validPriceId = IsStripePriceId(ipProAnnual) }
                },
                creator_pro = new
                {
                    monthly = new { value = creatorProMonthly, validPriceId = IsStripePriceId(creatorProMonthly) },
                    annual = new { value = creatorProAnnual, validPriceId = IsStripePriceId(creatorProAnnual) }
                },
                growth_suite = new
                {
                    monthly = new { value = growthSuiteMonthly, validPriceId = IsStripePriceId(growthSuiteMonthly) },
                    annual = new { value = growthSuiteAnnual, validPriceId = IsStripePriceId(growthSuiteAnnual) }
                },
                studio_plus = new
                {
                    monthly = new { value = studioPlusMonthly, validPriceId = IsStripePriceId(studioPlusMonthly) },
                    annual = new { value = studioPlusAnnual, validPriceId = IsStripePriceId(studioPlusAnnual) }
                }
            },
            issues
        });
    }

    [HttpPost("checkout-session")]
    public IActionResult CreateCheckoutSession([FromBody] CreateCheckoutSessionRequest request)
    {
        var secretKey = ResolveConfig("Stripe:SecretKey", "STRIPE_SECRET_API", "STRIPE_RESTRICTED_API", "STRIPE_SECRET_KEY");
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
        var rawPriceId = ResolvePriceIdRaw(plan, billingCycle);
        return IsStripePriceId(rawPriceId) ? rawPriceId : string.Empty;
    }

    private string ResolvePriceIdRaw(string plan, string billingCycle)
    {
        var normalizedPlan = string.IsNullOrWhiteSpace(plan) ? "creator_pro" : plan.Trim();
        var normalizedCycle = string.Equals(billingCycle, "annual", StringComparison.OrdinalIgnoreCase)
            ? "annual"
            : "monthly";

        var planKey = normalizedPlan.ToLowerInvariant() switch
        {
            "ip_basic" => "IpBasic",
            "ip_standard" => "IpStandard",
            "ip_pro" => "IpPro",
            "creator_pro" => "CreatorPro",
            "growth_suite" => "GrowthSuite",
            "studio_plus" => "StudioPlus",
            _ => "CreatorPro"
        };

        var envToken = normalizedPlan.ToLowerInvariant() switch
        {
            "ip_basic" => "IP_BASIC",
            "ip_standard" => "IP_STANDARD",
            "ip_pro" => "IP_PRO",
            "creator_pro" => "CREATOR_PRO",
            "growth_suite" => "GROWTH_SUITE",
            "studio_plus" => "STUDIO_PLUS",
            _ => "CREATOR_PRO"
        };

        var sectionKey = normalizedCycle == "annual"
            ? $"Stripe:Price{planKey}AnnualId"
            : $"Stripe:Price{planKey}MonthlyId";

        var envKey = normalizedCycle == "annual"
            ? $"STRIPE_PRICE_{envToken}_ANNUAL_ID"
            : $"STRIPE_PRICE_{envToken}_MONTHLY_ID";

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

    private static bool IsStripePriceId(string? value)
    {
        return !string.IsNullOrWhiteSpace(value) && value.Trim().StartsWith("price_", StringComparison.OrdinalIgnoreCase);
    }

    private string ResolveConfig(string sectionKey, params string[] envKeys)
    {
        var value = _configuration[sectionKey];
        if (!string.IsNullOrWhiteSpace(value))
        {
            return value.Trim();
        }

        foreach (var envKey in envKeys)
        {
            value = _configuration[envKey];
            if (!string.IsNullOrWhiteSpace(value))
            {
                return value.Trim();
            }
        }

        return string.Empty;
    }

    private object BuildCatalogPlan(
        string planId,
        string name,
        string tagline,
        string badge,
        int defaultMonthlyAmount,
        int defaultAnnualAmount)
    {
        var monthlyPriceId = ResolvePriceId(planId, "monthly");
        var annualPriceId = ResolvePriceId(planId, "annual");

        return new
        {
            planId,
            name,
            tagline,
            badge,
            monthly = new
            {
                priceId = monthlyPriceId,
                configured = !string.IsNullOrWhiteSpace(monthlyPriceId),
                amountUsd = defaultMonthlyAmount
            },
            annual = new
            {
                priceId = annualPriceId,
                configured = !string.IsNullOrWhiteSpace(annualPriceId),
                amountUsd = defaultAnnualAmount
            }
        };
    }
}

public sealed class CreateCheckoutSessionRequest
{
    public string Plan { get; set; } = "creator_pro";
    public string BillingCycle { get; set; } = "monthly";
    public string? SuccessUrl { get; set; }
    public string? CancelUrl { get; set; }
}
