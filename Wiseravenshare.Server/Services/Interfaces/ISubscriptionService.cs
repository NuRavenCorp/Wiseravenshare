using Wiseravenshare.Server.DTOs;

namespace Wiseravenshare.Server.Services;

public interface ISubscriptionService
{
    Task<CheckoutSessionResponse> CreateCheckoutSessionAsync(Guid userId, CreateCheckoutSessionRequest request);
    Task<PortalSessionResponse> CreatePortalSessionAsync(Guid userId, CreatePortalSessionRequest request);
    Task<SubscriptionStatusDto> GetSubscriptionStatusAsync(Guid userId);
    Task HandleWebhookAsync(string payload, string signatureHeader);
}
