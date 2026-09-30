using Microsoft.EntityFrameworkCore;
using Stripe;
using BillingPortalSessionService = Stripe.BillingPortal.SessionService;
using BillingPortalSessionCreateOptions = Stripe.BillingPortal.SessionCreateOptions;
using CheckoutSession = Stripe.Checkout.Session;
using CheckoutSessionCreateOptions = Stripe.Checkout.SessionCreateOptions;
using CheckoutSessionLineItemOptions = Stripe.Checkout.SessionLineItemOptions;
using CheckoutSessionSubscriptionDataOptions = Stripe.Checkout.SessionSubscriptionDataOptions;
using CheckoutSessionService = Stripe.Checkout.SessionService;
using Wiseravenshare.Server.Exceptions;
using Wiseravenshare.Server.Entities.Access;
using Wiseravenshare.Server.Infrastructure.Data;

namespace Wiseravenshare.Server.Services;

public class SubscriptionService : ISubscriptionService
{
    private static readonly StripeWebhookTriggerDto[] WorkflowTriggerBlueprint =
    [
        new StripeWebhookTriggerDto
        {
            Trigger = "checkout.session.completed",
            Steps = [
                "hydrate checkout session",
                "load Stripe subscription",
                "upsert local subscription state"
            ]
        },
        new StripeWebhookTriggerDto
        {
            Trigger = "customer.subscription.created",
            Steps = [
                "read Stripe subscription object",
                "upsert local subscription state"
            ]
        },
        new StripeWebhookTriggerDto
        {
            Trigger = "customer.subscription.updated",
            Steps = [
                "read Stripe subscription object",
                "upsert local subscription state"
            ]
        },
        new StripeWebhookTriggerDto
        {
            Trigger = "customer.subscription.deleted",
            Steps = [
                "read Stripe subscription object",
                "upsert local subscription state"
            ]
        },
        new StripeWebhookTriggerDto
        {
            Trigger = "invoice.payment_succeeded",
            Steps = [
                "read Stripe invoice object",
                "fetch latest Stripe subscription",
                "upsert local subscription state"
            ]
        },
        new StripeWebhookTriggerDto
        {
            Trigger = "invoice.payment_failed",
            Steps = [
                "read Stripe invoice object",
                "fetch latest Stripe subscription",
                "upsert local subscription state"
            ]
        }
    ];

    private readonly AppDbContext _dbContext;
    private readonly ILogger<SubscriptionService> _logger;
    private readonly GrowthService _growthService;
    private readonly IConfiguration _configuration;
    private readonly string _secretKey;
    private readonly string _webhookSecret;
    private readonly IFeatureAccessPolicyService _featureAccessPolicyService;

    // Maps plan keys to their env variable names (monthly + annual) for price ID lookup
    private static readonly (string PlanKey, string[] EnvKeys)[] PlanPriceEnvMap =
    [
        ("podcast_pro",      ["STRIPE_PRICE_PODCAST_PRO_MONTHLY_ID",                    "STRIPE_PRICE_PODCAST_PRO_ANNUAL_ID"]),
        ("studio_plus",      ["STRIPE_PRICE_STUDIO_PLUS_MONTHLY_ID",                    "STRIPE_PRICE_STUDIO_PLUS_ANNUAL_ID"]),
        ("growth_suite",     ["STRIPE_PRICE_GROWTH_SUITE_MONTHLY_ID",                   "STRIPE_PRICE_GROWTH_SUITE_ANNUAL_ID"]),
        ("copy_pro",         ["STRIPE_PRICE_COPY_PRO_MONTHLY_ID",                       "STRIPE_PRICE_COPY_PRO_ANNUAL_ID"]),
        ("copy_standard",    ["STRIPE_PRICE_COPY_STANDARD_MONTHLY_ID",                  "STRIPE_PRICE_COPY_STANDARD_ANNUAL_ID"]),
        ("creator_pro",      ["STRIPE_PRICE_CREATOR_PRO_MONTHLY_ID",                    "STRIPE_PRICE_CREATOR_PRO_ANNUAL_ID"]),
        ("rights_basic",     ["STRIPE_PRICE_MUSIC_STUDIO_RIGHTS_BASIC_MONTHLY_ID",      "STRIPE_PRICE_MUSIC_STUDIO_RIGHTS_BASIC_ANNUAL_ID"]),
        ("rights_standard",  ["STRIPE_PRICE_MUSIC_STUDIO_RIGHTS_STANDARD_MONTHLY_ID",   "STRIPE_PRICE_MUSIC_STUDIO_RIGHTS_STANDARD_ANNUAL_ID"]),
        ("rights_pro",       ["STRIPE_PRICE_MUSIC_STUDIO_RIGHTS_PRO_MONTHLY_ID",        "STRIPE_PRICE_MUSIC_STUDIO_RIGHTS_PRO_ANNUAL_ID"]),
    ];

    public SubscriptionService(
        AppDbContext dbContext,
        IConfiguration configuration,
        ILogger<SubscriptionService> logger,
        GrowthService growthService,
        IFeatureAccessPolicyService featureAccessPolicyService)
    {
        _dbContext = dbContext;
        _logger = logger;
        _growthService = growthService;
        _configuration = configuration;
        _featureAccessPolicyService = featureAccessPolicyService;

        _secretKey = ResolveConfig(configuration, "Stripe:SecretKey", "STRIPE_SECRET_API", "STRIPE_RESTRICTED_API", "STRIPE_SECRET_KEY");
        _webhookSecret = ResolveConfig(configuration, "Stripe:WebhookSecret", "STRIPE_WEBHOOK_SECRET");
    }

    public async Task<CheckoutSessionResponse> CreateCheckoutSessionAsync(Guid userId, CreateCheckoutSessionRequest request)
    {
        EnsureStripeConfigured();

        if (string.IsNullOrWhiteSpace(request.PriceId))
        {
            throw new InvalidOperationException("PriceId is required.");
        }

        if (string.IsNullOrWhiteSpace(request.SuccessUrl) || string.IsNullOrWhiteSpace(request.CancelUrl))
        {
            throw new InvalidOperationException("SuccessUrl and CancelUrl are required.");
        }

        var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == userId && !u.IsDeleted);
        if (user == null)
        {
            throw new NotFoundException("User not found.");
        }

        var customerId = await GetOrCreateCustomerIdAsync(userId, user.Email, user.DisplayName);

        var options = new CheckoutSessionCreateOptions
        {
            Mode = "subscription",
            Customer = customerId,
            SuccessUrl = request.SuccessUrl,
            CancelUrl = request.CancelUrl,
            LineItems =
            [
                new CheckoutSessionLineItemOptions
                {
                    Price = request.PriceId,
                    Quantity = 1,
                }
            ],
            AllowPromotionCodes = true,
            Metadata = new Dictionary<string, string>
            {
                ["userId"] = userId.ToString(),
                ["plan"] = NormalizePlan(request.Plan),
                ["billingCycle"] = NormalizeBillingCycle(request.BillingCycle)
            }
        };

        var trialDays = ResolveTrialDays(request.Plan);
        if (trialDays > 0)
        {
            options.SubscriptionData = new CheckoutSessionSubscriptionDataOptions
            {
                TrialPeriodDays = trialDays
            };
        }

        var sessionService = new CheckoutSessionService();
        var session = await sessionService.CreateAsync(options);

        if (string.IsNullOrWhiteSpace(session.Id) || string.IsNullOrWhiteSpace(session.Url))
        {
            throw new InvalidOperationException("Failed to create Stripe checkout session.");
        }

        return new CheckoutSessionResponse
        {
            SessionId = session.Id,
            Url = session.Url
        };
    }

    private static string NormalizePlan(string? plan)
    {
        return string.IsNullOrWhiteSpace(plan) ? "creator_pro" : plan.Trim().ToLowerInvariant();
    }

    private static string NormalizeBillingCycle(string? billingCycle)
    {
        return string.Equals(billingCycle, "annual", StringComparison.OrdinalIgnoreCase)
            ? "annual"
            : "monthly";
    }

    private static int ResolveTrialDays(string? plan)
    {
        return NormalizePlan(plan) switch
        {
            "growth_suite"   => 14,
            "studio_plus"    => 7,
            "podcast_pro"    => 30,
            "rights_basic"   => 14,
            "rights_standard" => 7,
            "rights_pro"     => 30,
            _ => 0
        };
    }

    public async Task<PortalSessionResponse> CreatePortalSessionAsync(Guid userId, CreatePortalSessionRequest request)
    {
        EnsureStripeConfigured();

        if (string.IsNullOrWhiteSpace(request.ReturnUrl))
        {
            throw new InvalidOperationException("ReturnUrl is required.");
        }

        var subscription = await _dbContext.Set<UserSubscription>()
            .AsTracking()
            .FirstOrDefaultAsync(s => s.UserId == userId && !s.IsDeleted);

        if (subscription == null || string.IsNullOrWhiteSpace(subscription.StripeCustomerId))
        {
            throw new NotFoundException("No Stripe customer found for this user.");
        }

        var portalService = new BillingPortalSessionService();
        var portalSession = await portalService.CreateAsync(new BillingPortalSessionCreateOptions
        {
            Customer = subscription.StripeCustomerId,
            ReturnUrl = request.ReturnUrl
        });

        if (string.IsNullOrWhiteSpace(portalSession.Url))
        {
            throw new InvalidOperationException("Failed to create Stripe portal session.");
        }

        return new PortalSessionResponse { Url = portalSession.Url };
    }

    public async Task<SubscriptionStatusDto> GetSubscriptionStatusAsync(Guid userId)
    {
        var subscription = await _dbContext.Set<UserSubscription>()
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.UserId == userId && !s.IsDeleted);

        if (subscription == null)
        {
            return new SubscriptionStatusDto();
        }

        var isActive = subscription.Status is "active" or "trialing" or "past_due";

        return new SubscriptionStatusDto
        {
            HasActiveSubscription = isActive,
            Status = subscription.Status,
            PriceId = subscription.StripePriceId,
            PlanKey = subscription.PlanKey,
            CurrentPeriodEnd = subscription.CurrentPeriodEnd,
            CancelAtPeriodEnd = subscription.CancelAtPeriodEnd,
            StripeCustomerId = subscription.StripeCustomerId,
            StripeSubscriptionId = subscription.StripeSubscriptionId
        };
    }

    public async Task<StripeWebhookWorkflowStatusDto> GetWebhookWorkflowStatusAsync(bool includeAllSubscriptions, Guid? userId = null)
    {
        var query = _dbContext.Set<UserSubscription>()
            .AsNoTracking()
            .Where(s => !s.IsDeleted);

        if (!includeAllSubscriptions)
        {
            if (!userId.HasValue || userId.Value == Guid.Empty)
            {
                return new StripeWebhookWorkflowStatusDto
                {
                    GeneratedAtUtc = DateTime.UtcNow,
                    Triggers = WorkflowTriggerBlueprint.Select(CloneTrigger).ToList(),
                    Subscriptions = []
                };
            }

            query = query.Where(s => s.UserId == userId.Value);
        }

        var subscriptions = await query
            .OrderByDescending(s => s.UpdatedAt)
            .Take(200)
            .Select(s => new StripeWebhookSubscriptionStateDto
            {
                UserId = s.UserId,
                StripeCustomerId = s.StripeCustomerId,
                StripeSubscriptionId = s.StripeSubscriptionId,
                StripePriceId = s.StripePriceId,
                Status = s.Status,
                CancelAtPeriodEnd = s.CancelAtPeriodEnd,
                CurrentPeriodEnd = s.CurrentPeriodEnd,
                LastWebhookEventId = s.LastWebhookEventId,
                UpdatedAtUtc = s.UpdatedAt
            })
            .ToListAsync();

        return new StripeWebhookWorkflowStatusDto
        {
            GeneratedAtUtc = DateTime.UtcNow,
            Triggers = WorkflowTriggerBlueprint.Select(CloneTrigger).ToList(),
            Subscriptions = subscriptions
        };
    }

    public async Task HandleWebhookAsync(string payload, string signatureHeader)
    {
        EnsureStripeConfigured();

        Event stripeEvent;

        if (!string.IsNullOrWhiteSpace(_webhookSecret))
        {
            stripeEvent = EventUtility.ConstructEvent(payload, signatureHeader, _webhookSecret);
        }
        else
        {
            stripeEvent = EventUtility.ParseEvent(payload);
        }

        await RunWebhookWorkflowAsync(stripeEvent);
    }

    private async Task RunWebhookWorkflowAsync(Event stripeEvent)
    {
        if (stripeEvent is null)
        {
            return;
        }

        var trigger = stripeEvent.Type ?? string.Empty;
        _logger.LogInformation("Stripe workflow trigger received: {Trigger} ({EventId})", trigger, stripeEvent.Id);

        if (trigger == "checkout.session.completed" && stripeEvent.Data.Object is CheckoutSession checkoutSession)
        {
            // Workflow: checkout.session.completed -> hydrate subscription -> upsert local subscription state
            await HandleCheckoutCompletedAsync(checkoutSession, stripeEvent.Id);
            return;
        }

        if (trigger is "customer.subscription.created" or "customer.subscription.updated" or "customer.subscription.deleted")
        {
            // Workflow: subscription lifecycle event -> upsert local subscription state
            if (stripeEvent.Data.Object is not Stripe.Subscription stripeSubscription)
            {
                _logger.LogWarning("Stripe workflow expected subscription object for trigger {Trigger} ({EventId}).", trigger, stripeEvent.Id);
                return;
            }

            await UpsertFromStripeSubscriptionAsync(stripeSubscription, stripeEvent.Id);
            return;
        }

        if (trigger == "invoice.payment_succeeded" && stripeEvent.Data.Object is Invoice invoice && !string.IsNullOrWhiteSpace(invoice.SubscriptionId))
        {
            // Workflow: invoice.payment_succeeded -> load subscription from Stripe -> upsert local state
            var subscriptionService = new Stripe.SubscriptionService();
            var refreshedSubscription = await subscriptionService.GetAsync(invoice.SubscriptionId);
            await UpsertFromStripeSubscriptionAsync(refreshedSubscription, stripeEvent.Id);
            return;
        }

        if (trigger == "invoice.payment_failed" && stripeEvent.Data.Object is Invoice failedInvoice && !string.IsNullOrWhiteSpace(failedInvoice.SubscriptionId))
        {
            // Workflow: invoice.payment_failed -> load subscription from Stripe -> upsert local state
            var subscriptionService = new Stripe.SubscriptionService();
            var refreshedSubscription = await subscriptionService.GetAsync(failedInvoice.SubscriptionId);
            await UpsertFromStripeSubscriptionAsync(refreshedSubscription, stripeEvent.Id);
            return;
        }

        _logger.LogInformation("Stripe workflow trigger ignored: {Trigger} ({EventId})", trigger, stripeEvent.Id);
    }

    private async Task HandleCheckoutCompletedAsync(CheckoutSession session, string eventId)
    {
        if (session.Mode != "subscription" || string.IsNullOrWhiteSpace(session.SubscriptionId) || string.IsNullOrWhiteSpace(session.CustomerId))
        {
            return;
        }

        var subscriptionService = new Stripe.SubscriptionService();
        var stripeSubscription = await subscriptionService.GetAsync(session.SubscriptionId);
        await UpsertFromStripeSubscriptionAsync(stripeSubscription, eventId, session.CustomerId, session.Metadata);
    }

    private async Task UpsertFromStripeSubscriptionAsync(
        Stripe.Subscription stripeSubscription,
        string eventId,
        string? customerIdOverride = null,
        IDictionary<string, string>? metadata = null)
    {
        var customerId = customerIdOverride ?? stripeSubscription.CustomerId;
        if (string.IsNullOrWhiteSpace(customerId))
        {
            _logger.LogWarning("Stripe webhook missing customer id for subscription {SubscriptionId}", stripeSubscription.Id);
            return;
        }

        var stripePriceId = stripeSubscription.Items.Data.FirstOrDefault()?.Price?.Id ?? string.Empty;
        var status = stripeSubscription.Status ?? "inactive";
        var currentPeriodEnd = stripeSubscription.CurrentPeriodEnd;

        var subscription = await _dbContext.Set<UserSubscription>()
            .AsTracking()
            .FirstOrDefaultAsync(s => s.StripeCustomerId == customerId && !s.IsDeleted);

        if (subscription != null
            && !string.IsNullOrWhiteSpace(subscription.LastWebhookEventId)
            && string.Equals(subscription.LastWebhookEventId, eventId, StringComparison.Ordinal))
        {
            _logger.LogInformation(
                "Skipping duplicate Stripe webhook event {EventId} for customer {CustomerId}.",
                eventId,
                customerId);
            return;
        }

        if (subscription == null)
        {
            Guid userId = Guid.Empty;
            if (metadata != null && metadata.TryGetValue("userId", out var userIdRaw))
            {
                Guid.TryParse(userIdRaw, out userId);
            }

            if (userId == Guid.Empty && stripeSubscription.Metadata.TryGetValue("userId", out var subUserIdRaw))
            {
                Guid.TryParse(subUserIdRaw, out userId);
            }

            if (userId == Guid.Empty)
            {
                _logger.LogWarning("Stripe webhook event {EventId} did not include a valid userId metadata field.", eventId);
                return;
            }

            subscription = new UserSubscription
            {
                UserId = userId,
                StripeCustomerId = customerId,
            };

            await _dbContext.Set<UserSubscription>().AddAsync(subscription);
        }

        subscription.StripeSubscriptionId = stripeSubscription.Id;
        subscription.StripePriceId = stripePriceId;
        subscription.Status = status;
        subscription.CancelAtPeriodEnd = stripeSubscription.CancelAtPeriodEnd;
        subscription.CurrentPeriodEnd = currentPeriodEnd;
        subscription.LastWebhookEventId = eventId;
        subscription.UpdatedAt = DateTime.UtcNow;

        // Resolve and persist the plan key so feature access works with real Stripe price IDs.
        // Priority: (1) session/subscription metadata plan field, (2) env-var price ID lookup.
        var resolvedPlanKey = string.Empty;
        if (metadata != null && metadata.TryGetValue("plan", out var metadataPlan) && !string.IsNullOrWhiteSpace(metadataPlan))
        {
            resolvedPlanKey = metadataPlan.Trim().ToLowerInvariant();
        }
        if (string.IsNullOrWhiteSpace(resolvedPlanKey) && stripeSubscription.Metadata.TryGetValue("plan", out var subPlan) && !string.IsNullOrWhiteSpace(subPlan))
        {
            resolvedPlanKey = subPlan.Trim().ToLowerInvariant();
        }
        if (string.IsNullOrWhiteSpace(resolvedPlanKey) && !string.IsNullOrWhiteSpace(stripePriceId))
        {
            resolvedPlanKey = ResolvePlanKeyFromPriceId(stripePriceId);
        }
        if (!string.IsNullOrWhiteSpace(resolvedPlanKey))
        {
            subscription.PlanKey = resolvedPlanKey;
            _logger.LogInformation(
                "Resolved plan key '{PlanKey}' for user {UserId} from price {PriceId}.",
                resolvedPlanKey, subscription.UserId, stripePriceId);
        }

        await _dbContext.SaveChangesAsync();

        try
        {
            var user = await _dbContext.Users
                .AsNoTracking()
                .FirstOrDefaultAsync(u => u.Id == subscription.UserId && !u.IsDeleted);

            var email = user?.Email ?? string.Empty;
            var metadataPayload = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            {
                ["stripeSubscriptionId"] = stripeSubscription.Id ?? string.Empty,
                ["stripePriceId"] = stripePriceId,
                ["status"] = status,
                ["eventId"] = eventId
            };

            _growthService.TrackEvent(subscription.UserId.ToString(), email, "subscription_status_updated", metadataPayload);

            if (string.Equals(status, "active", StringComparison.OrdinalIgnoreCase)
                || string.Equals(status, "trialing", StringComparison.OrdinalIgnoreCase))
            {
                _growthService.TrackEvent(subscription.UserId.ToString(), email, "subscription_activated", metadataPayload);

                // Auto-release features based on tier
                await ReleaseFeaturesByTierAsync(subscription.UserId, subscription.PlanKey ?? string.Empty);

                var sourceReference = BuildRevenueEvidenceSourceReference(eventId, stripeSubscription.Id);
                var existingEvidence = _growthService.GetRevenueEvidence(subscription.UserId.ToString(), email, null, null)
                    .Any(entry => string.Equals(entry.SourceReference, sourceReference, StringComparison.OrdinalIgnoreCase));

                if (!existingEvidence)
                {
                    var amountUsd = ResolveSubscriptionAmountUsd(stripeSubscription);
                    if (amountUsd > 0)
                    {
                        var evidence = _growthService.AddRevenueEvidence(
                            subscription.UserId.ToString(),
                            email,
                            null,
                            amountUsd,
                            "stripe_subscription_activation",
                            sourceReference,
                            $"Auto-captured from Stripe webhook event {eventId}.");

                        _logger.LogInformation(
                            "Recorded revenue evidence {EvidenceId} for user {UserId} from Stripe event {EventId}.",
                            evidence.Id,
                            subscription.UserId,
                            eventId);
                    }
                    else
                    {
                        _logger.LogWarning(
                            "Skipped auto revenue evidence for Stripe event {EventId} because amount could not be resolved.",
                            eventId);
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Growth tracking failed for subscription webhook event {EventId}.", eventId);
        }
    }

    private static string BuildRevenueEvidenceSourceReference(string eventId, string? subscriptionId)
    {
        var sub = string.IsNullOrWhiteSpace(subscriptionId) ? "unknown-subscription" : subscriptionId.Trim();
        return $"stripe-event:{eventId}|subscription:{sub}";
    }

    private static decimal ResolveSubscriptionAmountUsd(Stripe.Subscription stripeSubscription)
    {
        var price = stripeSubscription.Items.Data.FirstOrDefault()?.Price;
        if (price is null)
        {
            return 0;
        }

        var amountCents = price.UnitAmountDecimal
            ?? (price.UnitAmount.HasValue ? Convert.ToDecimal(price.UnitAmount.Value) : 0m);

        if (amountCents <= 0)
        {
            return 0;
        }

        return Math.Round(amountCents / 100m, 2);
    }

    private async Task<string> GetOrCreateCustomerIdAsync(Guid userId, string email, string displayName)
    {
        var existing = await _dbContext.Set<UserSubscription>()
            .AsTracking()
            .FirstOrDefaultAsync(s => s.UserId == userId && !s.IsDeleted);

        if (existing != null && !string.IsNullOrWhiteSpace(existing.StripeCustomerId))
        {
            return existing.StripeCustomerId;
        }

        var customerService = new CustomerService();
        var customer = await customerService.CreateAsync(new CustomerCreateOptions
        {
            Email = email,
            Name = displayName,
            Metadata = new Dictionary<string, string>
            {
                ["userId"] = userId.ToString()
            }
        });

        if (string.IsNullOrWhiteSpace(customer.Id))
        {
            throw new InvalidOperationException("Failed to create Stripe customer.");
        }

        if (existing == null)
        {
            existing = new UserSubscription
            {
                UserId = userId,
                StripeCustomerId = customer.Id,
                Status = "inactive",
            };
            await _dbContext.Set<UserSubscription>().AddAsync(existing);
        }
        else
        {
            existing.StripeCustomerId = customer.Id;
            existing.UpdatedAt = DateTime.UtcNow;
        }

        await _dbContext.SaveChangesAsync();
        return customer.Id;
    }

    private void EnsureStripeConfigured()
    {
        if (string.IsNullOrWhiteSpace(_secretKey))
        {
            throw new InvalidOperationException("Stripe secret key is not configured.");
        }

        StripeConfiguration.ApiKey = _secretKey;
    }

    private static string ResolveConfig(IConfiguration configuration, string sectionKey, params string[] envKeys)
    {
        var value = configuration[sectionKey];
        if (!string.IsNullOrWhiteSpace(value))
        {
            return value.Trim();
        }

        foreach (var envKey in envKeys)
        {
            value = configuration[envKey];
            if (!string.IsNullOrWhiteSpace(value))
            {
                return value.Trim();
            }
        }

        return string.Empty;
    }

    /// <summary>
    /// Looks up a plan key ("podcast_pro", "studio_plus", etc.) from a real Stripe price ID
    /// by comparing against configured env-var price IDs. Falls back to string-pattern matching
    /// for dev/test price IDs that embed the plan name.
    /// </summary>
    private string ResolvePlanKeyFromPriceId(string priceId)
    {
        if (string.IsNullOrWhiteSpace(priceId))
            return string.Empty;

        var p = priceId.Trim();

        // Check against all env-configured real Stripe price IDs (highest priority)
        foreach (var (planKey, envKeys) in PlanPriceEnvMap)
        {
            foreach (var envKey in envKeys)
            {
                var configured = _configuration[envKey];
                if (!string.IsNullOrWhiteSpace(configured)
                    && string.Equals(configured.Trim(), p, StringComparison.OrdinalIgnoreCase))
                {
                    return planKey;
                }
            }
        }

        // String-pattern fallback for dev/test price IDs
        var lower = p.ToLowerInvariant();
        if (lower.Contains("podcast_pro") || lower.Contains("podcast-pro")) return "podcast_pro";
        if (lower.Contains("studio_plus") || lower.Contains("studio-plus")) return "studio_plus";
        if (lower.Contains("growth_suite") || lower.Contains("growth-suite")) return "growth_suite";
        if (lower.Contains("copy_pro") || lower.Contains("copy-pro")) return "copy_pro";
        if (lower.Contains("copy_standard") || lower.Contains("copy-standard")) return "copy_standard";
        if (lower.Contains("creator_pro") || lower.Contains("creator-pro")) return "creator_pro";
        if (lower.Contains("rights_pro") || lower.Contains("rights-pro")) return "rights_pro";
        if (lower.Contains("rights_standard") || lower.Contains("rights-standard")) return "rights_standard";
        if (lower.Contains("rights_basic") || lower.Contains("rights-basic")) return "rights_basic";

        return string.Empty;
    }

    private static StripeWebhookTriggerDto CloneTrigger(StripeWebhookTriggerDto trigger)
    {
        return new StripeWebhookTriggerDto
        {
            Trigger = trigger.Trigger,
            Steps = trigger.Steps.ToList()
        };
    }

    /// <summary>
    /// Auto-release features based on subscription tier when payment is received.
    /// Maps plan key (growth_suite, studio_plus, podcast_pro) to feature keys for immediate unlock.
    /// </summary>
    private async Task ReleaseFeaturesByTierAsync(Guid userId, string planKey)
    {
        if (string.IsNullOrWhiteSpace(planKey) || _featureAccessPolicyService == null)
        {
            return;
        }

        var featuresByPlan = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase)
        {
            // Growth Suite: Analytics, sentiment, history, recommendations, reports
            ["growth_suite"] = new[]
            {
                "growth-analytics-dashboard",
                "audience-sentiment-tracking",
                "30-day-performance-history",
                "topic-recommendations",
                "monthly-download-reports",
                "podcast-analytics"
            },

            // Studio Plus: Team workflows + all Growth Suite features
            ["studio_plus"] = new[]
            {
                "growth-analytics-dashboard",
                "audience-sentiment-tracking",
                "30-day-performance-history",
                "topic-recommendations",
                "monthly-download-reports",
                "team-review-workflows",
                "assignment-approval-chains",
                "permission-based-editing",
                "team-member-analytics",
                "multi-role-simultaneous-editing",
                "team-workspace-shared-assets",
                "persistent-workspace-pages",
                "podcast-analytics"
            },

            // Podcast Pro Bundle: Premium support + all Growth Suite + all Studio Plus
            ["podcast_pro"] = new[]
            {
                "growth-analytics-dashboard",
                "audience-sentiment-tracking",
                "30-day-performance-history",
                "topic-recommendations",
                "monthly-download-reports",
                "team-review-workflows",
                "assignment-approval-chains",
                "permission-based-editing",
                "team-member-analytics",
                "multi-role-simultaneous-editing",
                "team-workspace-shared-assets",
                "persistent-workspace-pages",
                "podcast-analytics",
                "guided-studio-flow",
                "podcast-pro-bundle",
                "24-7-priority-support",
                "monthly-strategy-calls",
                "custom-episode-templates",
                "advanced-analytics-export"
            },

            // ── Music Rights / IP Protection plans ──────────────────────────────────
            // Basic: Timestamped proof, SHA-256 fingerprint, DMCA template, certificate
            ["rights_basic"] = new[]
            {
                "music-rights-registration",
                "sha256-fingerprint",
                "timestamped-proof-of-creation",
                "dmca-takedown-template",
                "proof-of-creation-certificate"
            },

            // Standard: Everything in Basic + infringement monitoring + licensing templates
            ["rights_standard"] = new[]
            {
                "music-rights-registration",
                "sha256-fingerprint",
                "timestamped-proof-of-creation",
                "dmca-takedown-template",
                "proof-of-creation-certificate",
                "cross-platform-infringement-monitoring",
                "automated-takedown-filing",
                "sync-mechanical-licensing-templates",
                "revenue-split-tracking",
                "streaming-royalty-registration"
            },

            // Pro: Everything in Standard + priority support + advanced registrations
            ["rights_pro"] = new[]
            {
                "music-rights-registration",
                "sha256-fingerprint",
                "timestamped-proof-of-creation",
                "dmca-takedown-template",
                "proof-of-creation-certificate",
                "cross-platform-infringement-monitoring",
                "automated-takedown-filing",
                "sync-mechanical-licensing-templates",
                "revenue-split-tracking",
                "streaming-royalty-registration",
                "rights-pro-bundle",
                "priority-ip-support",
                "legal-consultation-credit",
                "global-rights-database-registration",
                "blockchain-timestamp-verification"
            }
        };

        if (!featuresByPlan.TryGetValue(planKey, out var featuresToRelease))
        {
            _logger.LogWarning("No features mapped for plan key {PlanKey}. Skipping auto-release.", planKey);
            return;
        }

        try
        {
            foreach (var featureKey in featuresToRelease)
            {
                await _featureAccessPolicyService.SetFeatureStateAsync(
                    featureKey: featureKey,
                    scope: FeatureScope.User,
                    scopeValue: userId.ToString(),
                    state: FeatureState.Enabled,
                    reason: $"Auto-released via subscription tier '{planKey}'",
                    actorUserId: userId);

                _logger.LogInformation(
                    "Auto-released feature {FeatureKey} for user {UserId} via subscription tier {PlanKey}.",
                    featureKey, userId, planKey);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex,
                "Error auto-releasing features for user {UserId} with plan {PlanKey}.",
                userId, planKey);
        }
    }
}

