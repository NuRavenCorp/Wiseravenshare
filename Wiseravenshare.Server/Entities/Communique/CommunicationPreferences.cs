// Wiseravenshare.Server/Entities/Communique/CommunicationPreferences.cs
namespace Wiseravenshare.Server.Entities.Communique;

/// <summary>
/// User communication preferences for SMS, WhatsApp, and notification channels
/// </summary>
public class CommunicationPreferences : BaseEntity
{
    /// <summary>
    /// User ID associated with these preferences
    /// </summary>
    public string UserId { get; set; } = string.Empty;

    /// <summary>
    /// Enable SMS notifications
    /// </summary>
    public bool EnableSmsNotifications { get; set; } = true;

    /// <summary>
    /// Enable WhatsApp notifications
    /// </summary>
    public bool EnableWhatsAppNotifications { get; set; } = true;

    /// <summary>
    /// Enable engagement notifications (likes, comments, shares)
    /// </summary>
    public bool EnableEngagementNotifications { get; set; } = true;

    /// <summary>
    /// Enable alert notifications
    /// </summary>
    public bool EnableAlerts { get; set; } = true;

    /// <summary>
    /// Preferred communication channel: "sms" or "whatsapp"
    /// </summary>
    public string PreferredChannel { get; set; } = "sms";

    /// <summary>
    /// Whether the phone number has been verified
    /// </summary>
    public bool IsVerified { get; set; }

    /// <summary>
    /// The verified phone number (E.164 format: +1234567890)
    /// </summary>
    public string? VerifiedPhoneNumber { get; set; }

    /// <summary>
    /// Last time preferences were updated
    /// </summary>
    public DateTime? UpdatedAt { get; set; }

    /// <summary>
    /// Navigation property to User
    /// </summary>
    public virtual User? User { get; set; }
}
