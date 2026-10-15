using System.ComponentModel.DataAnnotations;

namespace Wiseravenshare.Server.Entities;

public class UserSubscription : BaseEntity
{
    public Guid UserId { get; set; }

    [MaxLength(100)]
    public string StripeCustomerId { get; set; } = string.Empty;

    [MaxLength(100)]
    public string? StripeSubscriptionId { get; set; }

    [MaxLength(100)]
    public string? StripePriceId { get; set; }

    [MaxLength(50)]
    public string Status { get; set; } = "inactive";

    public DateTime? CurrentPeriodEnd { get; set; }
    public bool CancelAtPeriodEnd { get; set; }

    [MaxLength(100)]
    public string? LastWebhookEventId { get; set; }

    /// <summary>
    /// Resolved plan key derived from the Stripe price ID at webhook time.
    /// Values: growth_suite | studio_plus | podcast_pro | creator_pro | copy_pro | copy_standard | (empty)
    /// </summary>
    [MaxLength(50)]
    public string? PlanKey { get; set; }

    public virtual User User { get; set; } = null!;
}
