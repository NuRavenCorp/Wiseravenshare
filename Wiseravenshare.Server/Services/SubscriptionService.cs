using Microsoft.EntityFrameworkCore;
using Stripe;
using BillingPortalSessionService = Stripe.BillingPortal.SessionService;
using BillingPortalSessionCreateOptions = Stripe.BillingPortal.SessionCreateOptions;
using CheckoutSession = Stripe.Checkout.Session;
using CheckoutSessionCreateOptions = Stripe.Checkout.SessionCreateOptions;
using CheckoutSessionLineItemOptions = Stripe.Checkout.SessionLineItemOptions;
using CheckoutSessionService = Stripe.Checkout.SessionService;
using Wiseravenshare.Server.Exceptions;
using Wiseravenshare.Server.Infrastructure.Data;

namespace Wiseravenshare.Server.Services;

public class SubscriptionService : ISubscriptionService
{
    private readonly AppDbContext _dbContext;
    private readonly ILogger<SubscriptionService> _logger;
    private readonly GrowthService _growthService;
    private readonly string _secretKey;
    private readonly string _webhookSecret;

    public SubscriptionService(
        AppDbContext dbContext,
        IConfiguration configuration,
        ILogger<SubscriptionService> logger,
        GrowthService growthService)
    {
        _dbContext = dbContext;
        _logger = logger;
        _growthService = growthService;

        _secretKey = ResolveConfig(configuration, "Stripe:SecretKey", "STRIPE_SECRET_KEY");
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
                ["userId"] = userId.ToString()
            }
        };

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
            CurrentPeriodEnd = subscription.CurrentPeriodEnd,
            CancelAtPeriodEnd = subscription.CancelAtPeriodEnd,
            StripeCustomerId = subscription.StripeCustomerId,
            StripeSubscriptionId = subscription.StripeSubscriptionId
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

        if (stripeEvent.Type == "checkout.session.completed" && stripeEvent.Data.Object is CheckoutSession checkoutSession)
        {
            await HandleCheckoutCompletedAsync(checkoutSession, stripeEvent.Id);
            return;
        }

        if (stripeEvent.Data.Object is Stripe.Subscription stripeSubscription)
        {
            await UpsertFromStripeSubscriptionAsync(stripeSubscription, stripeEvent.Id);
            return;
        }

        if (stripeEvent.Type == "invoice.payment_succeeded" && stripeEvent.Data.Object is Invoice invoice && !string.IsNullOrWhiteSpace(invoice.SubscriptionId))
        {
            var subscriptionService = new Stripe.SubscriptionService();
            var refreshedSubscription = await subscriptionService.GetAsync(invoice.SubscriptionId);
            await UpsertFromStripeSubscriptionAsync(refreshedSubscription, stripeEvent.Id);
            return;
        }

        if (stripeEvent.Type == "invoice.payment_failed" && stripeEvent.Data.Object is Invoice failedInvoice && !string.IsNullOrWhiteSpace(failedInvoice.SubscriptionId))
        {
            var subscriptionService = new Stripe.SubscriptionService();
            var refreshedSubscription = await subscriptionService.GetAsync(failedInvoice.SubscriptionId);
            await UpsertFromStripeSubscriptionAsync(refreshedSubscription, stripeEvent.Id);
        }
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

    private static string ResolveConfig(IConfiguration configuration, string sectionKey, string envKey)
    {
        return (configuration[sectionKey] ?? configuration[envKey] ?? string.Empty).Trim();
    }
}
