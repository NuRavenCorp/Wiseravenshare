namespace Wiseravenshare.Server.DTOs;

public class CreateCheckoutSessionRequest
{
    public string PriceId { get; set; } = string.Empty;
    public string SuccessUrl { get; set; } = string.Empty;
    public string CancelUrl { get; set; } = string.Empty;
}

public class CheckoutSessionResponse
{
    public string SessionId { get; set; } = string.Empty;
    public string Url { get; set; } = string.Empty;
}

public class CreatePortalSessionRequest
{
    public string ReturnUrl { get; set; } = string.Empty;
}

public class PortalSessionResponse
{
    public string Url { get; set; } = string.Empty;
}

public class SubscriptionStatusDto
{
    public bool HasActiveSubscription { get; set; }
    public string Status { get; set; } = "inactive";
    public string? PriceId { get; set; }
    public DateTime? CurrentPeriodEnd { get; set; }
    public bool CancelAtPeriodEnd { get; set; }
    public string? StripeCustomerId { get; set; }
    public string? StripeSubscriptionId { get; set; }
}
