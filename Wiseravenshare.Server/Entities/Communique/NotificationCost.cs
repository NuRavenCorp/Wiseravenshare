// Wiseravenshare.Server/Entities/Communique/NotificationCost.cs
namespace Wiseravenshare.Server.Entities.Communique;

/// <summary>
/// Tracks SMS, WhatsApp, and 2FA costs for billing/monitoring purposes
/// </summary>
public class NotificationCost : BaseEntity
{
    /// <summary>
    /// User ID who sent the notification
    /// </summary>
    public string UserId { get; set; } = string.Empty;

    /// <summary>
    /// Type of notification: SMS | WhatsApp | Verify
    /// </summary>
    public string NotificationType { get; set; } = string.Empty; // "SMS" | "WhatsApp" | "Verify"

    /// <summary>
    /// Recipient phone number (E.164 format)
    /// </summary>
    public string PhoneNumber { get; set; } = string.Empty;

    /// <summary>
    /// Message length (for SMS calculations)
    /// </summary>
    public int MessageLength { get; set; }

    /// <summary>
    /// Cost in USD
    /// </summary>
    public decimal CostUsd { get; set; }

    /// <summary>
    /// Twilio SID for tracking
    /// </summary>
    public string? TwilioSid { get; set; }

    /// <summary>
    /// Delivery status: Pending | Sent | Failed
    /// </summary>
    public string DeliveryStatus { get; set; } = "Sent";

    /// <summary>
    /// When the notification was sent
    /// </summary>
    public DateTime SentAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Navigation property to User
    /// </summary>
    public virtual User? User { get; set; }

    /// <summary>
    /// Constructor with default pricing
    /// </summary>
    public NotificationCost()
    {
    }

    /// <summary>
    /// Factory method for SMS costs
    /// </summary>
    public static NotificationCost CreateSms(string userId, string phoneNumber, int messageLength)
    {
        return new NotificationCost
        {
            UserId = userId,
            NotificationType = "SMS",
            PhoneNumber = phoneNumber,
            MessageLength = messageLength,
            CostUsd = CalculateSmsPrice(messageLength),
            DeliveryStatus = "Sent"
        };
    }

    /// <summary>
    /// Factory method for WhatsApp costs
    /// </summary>
    public static NotificationCost CreateWhatsApp(string userId, string phoneNumber)
    {
        return new NotificationCost
        {
            UserId = userId,
            NotificationType = "WhatsApp",
            PhoneNumber = phoneNumber,
            MessageLength = 0,
            CostUsd = 0.0041m, // Twilio WhatsApp pricing ~$0.0041 per message
            DeliveryStatus = "Sent"
        };
    }

    /// <summary>
    /// Factory method for verification costs
    /// </summary>
    public static NotificationCost CreateVerification(string userId, string phoneNumber, string channel)
    {
        return new NotificationCost
        {
            UserId = userId,
            NotificationType = "Verify",
            PhoneNumber = phoneNumber,
            MessageLength = 0,
            CostUsd = 0.01m, // Twilio Verify ~$0.01 per verification
            DeliveryStatus = "Sent"
        };
    }

    /// <summary>
    /// Calculate SMS price based on message length
    /// SMS pricing: ~$0.0075 per message (standard US rate)
    /// Long messages may be split into multiple parts
    /// </summary>
    private static decimal CalculateSmsPrice(int messageLength)
    {
        const decimal pricePerSms = 0.0075m;
        
        // SMS character limits:
        // 160 chars for single part
        // 153 chars per part for multipart (7 chars used for concatenation header)
        const int singlePartLimit = 160;
        const int multiPartLimit = 153;

        if (messageLength <= singlePartLimit)
            return pricePerSms;

        var parts = (messageLength - 1) / multiPartLimit + 1;
        return pricePerSms * parts;
    }
}
