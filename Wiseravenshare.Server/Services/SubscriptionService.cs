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

public interface ISubscriptionService
{
    Task<CheckoutSessionResponse> CreateCheckoutSessionAsync(Guid userId, CreateCheckoutSessionRequest request);
    Task<PortalSessionResponse> CreatePortalSessionAsync(Guid userId, CreatePortalSessionRequest request);
    Task<SubscriptionStatusDto> GetSubscriptionStatusAsync(Guid userId);
    Task<SubscriptionStatusDto> CancelSubscriptionAsync(Guid userId, CancelSubscriptionRequest request);
    Task HandleWebhookAsync(string payload, string signatureHeader);
}

public class SubscriptionService : ISubscriptionService
{
    private readonly AppDbContext _dbContext;
    private readonly ILogger<SubscriptionService> _logger;
    private readonly string _webhookSecret;

    public SubscriptionService(AppDbContext dbContext, IConfiguration configuration, ILogger<SubscriptionService> logger)
    {
        _dbContext = dbContext;
        _logger = logger;

        var secretKey = configuration["Stripe:SecretKey"];
        if (string.IsNullOrWhiteSpace(secretKey))
        {
            throw new InvalidOperationException("Stripe:SecretKey is not configured.");
        }

        StripeConfiguration.ApiKey = secretKey;
        _webhookSecret = configuration["Stripe:WebhookSecret"] ?? string.Empty;
    }

    public async Task<CheckoutSessionResponse> CreateCheckoutSessionAsync(Guid userId, CreateCheckoutSessionRequest request)
    {
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

    public async Task<SubscriptionStatusDto> CancelSubscriptionAsync(Guid userId, CancelSubscriptionRequest request)
    {
        var subscription = await _dbContext.Set<UserSubscription>()
            .AsTracking()
            .FirstOrDefaultAsync(s => s.UserId == userId && !s.IsDeleted);

        if (subscription == null || string.IsNullOrWhiteSpace(subscription.StripeSubscriptionId))
        {
            throw new NotFoundException("No active Stripe subscription found.");
        }

        var stripeSubscriptionService = new Stripe.SubscriptionService();

        var updated = await stripeSubscriptionService.UpdateAsync(
            subscription.StripeSubscriptionId,
            new SubscriptionUpdateOptions
            {
                CancelAtPeriodEnd = request.CancelAtPeriodEnd
            });

        subscription.Status = updated.Status ?? subscription.Status;
        subscription.CancelAtPeriodEnd = updated.CancelAtPeriodEnd;
        subscription.CurrentPeriodEnd = updated.CurrentPeriodEnd;
        subscription.UpdatedAt = DateTime.UtcNow;

        await _dbContext.SaveChangesAsync();

        return await GetSubscriptionStatusAsync(userId);
    }

    public async Task HandleWebhookAsync(string payload, string signatureHeader)
    {
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
}
