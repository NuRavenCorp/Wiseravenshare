using Wiseravenshare.Server.DTOs;

namespace Wiseravenshare.Server.Services;

public interface ISubscriptionService
{
    Task<CheckoutSessionResponse> CreateCheckoutSessionAsync(Guid userId, CreateCheckoutSessionRequest request);
    Task<PortalSessionResponse> CreatePortalSessionAsync(Guid userId, CreatePortalSessionRequest request);
    Task<SubscriptionStatusDto> GetSubscriptionStatusAsync(Guid userId);
    Task<StripeWebhookWorkflowStatusDto> GetWebhookWorkflowStatusAsync(bool includeAllSubscriptions, Guid? userId = null);
    Task HandleWebhookAsync(string payload, string signatureHeader);
}
