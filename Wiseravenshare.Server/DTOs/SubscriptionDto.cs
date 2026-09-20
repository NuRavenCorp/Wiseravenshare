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

public class StripeWebhookWorkflowStatusDto
{
    public DateTime GeneratedAtUtc { get; set; } = DateTime.UtcNow;
    public List<StripeWebhookTriggerDto> Triggers { get; set; } = [];
    public List<StripeWebhookSubscriptionStateDto> Subscriptions { get; set; } = [];
}

public class StripeWebhookTriggerDto
{
    public string Trigger { get; set; } = string.Empty;
    public List<string> Steps { get; set; } = [];
}

public class StripeWebhookSubscriptionStateDto
{
    public Guid UserId { get; set; }
    public string StripeCustomerId { get; set; } = string.Empty;
    public string? StripeSubscriptionId { get; set; }
    public string? StripePriceId { get; set; }
    public string Status { get; set; } = "inactive";
    public bool CancelAtPeriodEnd { get; set; }
    public DateTime? CurrentPeriodEnd { get; set; }
    public string? LastWebhookEventId { get; set; }
    public DateTime UpdatedAtUtc { get; set; }
}
