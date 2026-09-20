// Wiseravenshare.Server/Controllers/CommunicationController.cs
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.Entities.Communique;
using Wiseravenshare.Server.Services.Communication;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/communication")]
[Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
public class CommunicationController : ControllerBase
{
    private readonly ICommunicationService _communicationService;
    private readonly ITwilioService _twilioService;
    private readonly ILogger<CommunicationController> _logger;

    public CommunicationController(
        ICommunicationService communicationService,
        ITwilioService twilioService,
        ILogger<CommunicationController> logger)
    {
        _communicationService = communicationService;
        _twilioService = twilioService;
        _logger = logger;
    }

    /// <summary>
    /// Check if Twilio is enabled
    /// </summary>
    [HttpGet("status")]
    public ActionResult<CommunicationStatus> GetStatus()
    {
        return Ok(new CommunicationStatus
        {
            TwilioEnabled = _twilioService.IsEnabled,
            Timestamp = DateTime.UtcNow
        });
    }

    /// <summary>
    /// Send SMS notification to user
    /// </summary>
    [HttpPost("sms/send")]
    public async Task<ActionResult<SendMessageResponse>> SendSmsAsync([FromBody] SendSmsRequest request)
    {
        if (string.IsNullOrWhiteSpace(request?.Message))
        {
            return BadRequest(new { error = "Message cannot be empty" });
        }

        if (string.IsNullOrWhiteSpace(request.PhoneNumber) && string.IsNullOrWhiteSpace(request.UserId))
        {
            return BadRequest(new { error = "Either PhoneNumber or UserId must be provided" });
        }

        try
        {
            var phoneNumber = request.PhoneNumber;
            var userId = request.UserId ?? GetCurrentUserId();

            bool result = await _communicationService.SendNotificationAsync(
                userId,
                request.Message,
                phoneNumber,
                "sms"
            );

            return Ok(new SendMessageResponse
            {
                Success = result,
                Message = result ? "SMS sent successfully" : "Failed to send SMS",
                Channel = "sms",
                Timestamp = DateTime.UtcNow
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error sending SMS");
            return StatusCode(500, new { error = "Failed to send SMS", details = ex.Message });
        }
    }

    /// <summary>
    /// Send WhatsApp message to user
    /// </summary>
    [HttpPost("whatsapp/send")]
    public async Task<ActionResult<SendMessageResponse>> SendWhatsAppAsync([FromBody] SendWhatsAppRequest request)
    {
        if (string.IsNullOrWhiteSpace(request?.Message))
        {
            return BadRequest(new { error = "Message cannot be empty" });
        }

        if (string.IsNullOrWhiteSpace(request.PhoneNumber) && string.IsNullOrWhiteSpace(request.UserId))
        {
            return BadRequest(new { error = "Either PhoneNumber or UserId must be provided" });
        }

        try
        {
            var phoneNumber = request.PhoneNumber;
            var userId = request.UserId ?? GetCurrentUserId();

            bool result = await _communicationService.SendNotificationAsync(
                userId,
                request.Message,
                phoneNumber,
                "whatsapp"
            );

            return Ok(new SendMessageResponse
            {
                Success = result,
                Message = result ? "WhatsApp message sent successfully" : "Failed to send WhatsApp message",
                Channel = "whatsapp",
                Timestamp = DateTime.UtcNow
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error sending WhatsApp message");
            return StatusCode(500, new { error = "Failed to send WhatsApp message", details = ex.Message });
        }
    }

    /// <summary>
    /// Request verification code for 2FA
    /// </summary>
    [HttpPost("verify/request")]
    public async Task<ActionResult<VerificationResponse>> RequestVerificationAsync([FromBody] VerificationRequest request)
    {
        if (string.IsNullOrWhiteSpace(request?.PhoneNumber))
        {
            return BadRequest(new { error = "Phone number is required" });
        }

        try
        {
            var verificationResult = await _communicationService.SendVerificationAsync(
                request.PhoneNumber,
                request.Channel ?? "sms");

            return Ok(new VerificationResponse
            {
                Success = verificationResult.Success,
                VerificationSid = verificationResult.VerificationSid,
                Message = verificationResult.Success ? "Verification code sent" : "Failed to send verification code",
                Timestamp = DateTime.UtcNow
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error requesting verification");
            return StatusCode(500, new { error = "Failed to request verification", details = ex.Message });
        }
    }

    /// <summary>
    /// Verify code for 2FA
    /// </summary>
    [HttpPost("verify/confirm")]
    public async Task<ActionResult<VerificationConfirmResponse>> ConfirmVerificationAsync([FromBody] VerificationConfirmRequest request)
    {
        if (string.IsNullOrWhiteSpace(request?.PhoneNumber) || string.IsNullOrWhiteSpace(request?.Code))
        {
            return BadRequest(new { error = "Phone number and code are required" });
        }

        try
        {
            bool result = await _communicationService.VerifyPhoneNumberAsync(request.PhoneNumber, request.Code);

            if (result)
            {
                // Update user preferences to mark phone as verified
                var userId = GetCurrentUserId();
                var preferences = await _communicationService.GetUserPreferencesAsync(userId);
                if (preferences != null)
                {
                    preferences.IsVerified = true;
                    preferences.VerifiedPhoneNumber = request.PhoneNumber;
                    await _communicationService.UpdateUserPreferencesAsync(userId, preferences);
                }
            }

            return Ok(new VerificationConfirmResponse
            {
                Success = result,
                Message = result ? "Phone number verified successfully" : "Verification failed",
                IsVerified = result,
                Timestamp = DateTime.UtcNow
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error confirming verification");
            return StatusCode(500, new { error = "Failed to confirm verification", details = ex.Message });
        }
    }

    /// <summary>
    /// Get current user's communication preferences
    /// </summary>
    [HttpGet("preferences")]
    public async Task<ActionResult<CommunicationPreferences>> GetPreferencesAsync()
    {
        try
        {
            var userId = GetCurrentUserId();
            var preferences = await _communicationService.GetUserPreferencesAsync(userId);

            if (preferences == null)
            {
                return NotFound(new { error = "Preferences not found" });
            }

            return Ok(preferences);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving preferences");
            return StatusCode(500, new { error = "Failed to retrieve preferences", details = ex.Message });
        }
    }

    /// <summary>
    /// Update communication preferences
    /// </summary>
    [HttpPut("preferences")]
    public async Task<ActionResult<UpdatePreferencesResponse>> UpdatePreferencesAsync([FromBody] UpdatePreferencesRequest request)
    {
        try
        {
            var userId = GetCurrentUserId();
            if (!Guid.TryParse(userId, out var userIdGuid))
            {
                return BadRequest(new { error = "Invalid authenticated user ID" });
            }

            var preferences = new CommunicationPreferences
            {
                UserId = userIdGuid,
                EnableSmsNotifications = request.EnableSmsNotifications,
                EnableWhatsAppNotifications = request.EnableWhatsAppNotifications,
                EnableEngagementNotifications = request.EnableEngagementNotifications,
                EnableAlerts = request.EnableAlerts,
                PreferredChannel = request.PreferredChannel ?? "sms"
            };

            bool result = await _communicationService.UpdateUserPreferencesAsync(userId, preferences);

            return Ok(new UpdatePreferencesResponse
            {
                Success = result,
                Message = result ? "Preferences updated successfully" : "Failed to update preferences",
                Timestamp = DateTime.UtcNow
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating preferences");
            return StatusCode(500, new { error = "Failed to update preferences", details = ex.Message });
        }
    }

    /// <summary>
    /// Send bulk notification to multiple users
    /// </summary>
    [HttpPost("bulk/send")]
    public async Task<ActionResult<BulkNotificationResponse>> SendBulkNotificationAsync([FromBody] BulkNotificationRequest request)
    {
        if (string.IsNullOrWhiteSpace(request?.Message) || request.UserIds == null || request.UserIds.Count == 0)
        {
            return BadRequest(new { error = "Message and user list are required" });
        }

        try
        {
            bool result = await _communicationService.SendBulkNotificationAsync(request.UserIds, request.Message);

            return Ok(new BulkNotificationResponse
            {
                Success = result,
                Message = result ? "Bulk notification sent" : "Some notifications failed",
                UserCount = request.UserIds.Count,
                Timestamp = DateTime.UtcNow
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error sending bulk notification");
            return StatusCode(500, new { error = "Failed to send bulk notification", details = ex.Message });
        }
    }

    /// <summary>
    /// Notify engagement activity
    /// </summary>
    [HttpPost("engagement/notify")]
    public async Task<ActionResult<NotifyEngagementResponse>> NotifyEngagementAsync([FromBody] NotifyEngagementRequest request)
    {
        if (string.IsNullOrWhiteSpace(request?.UserId) || 
            string.IsNullOrWhiteSpace(request?.ContentTitle) ||
            string.IsNullOrWhiteSpace(request?.ActivityType))
        {
            return BadRequest(new { error = "UserId, ContentTitle, and ActivityType are required" });
        }

        try
        {
            bool result = await _communicationService.NotifyEngagementAsync(
                request.UserId,
                request.ContentTitle,
                request.ActivityType
            );

            return Ok(new NotifyEngagementResponse
            {
                Success = result,
                Message = result ? "Engagement notification sent" : "Failed to send notification",
                ActivityType = request.ActivityType,
                Timestamp = DateTime.UtcNow
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error notifying engagement");
            return StatusCode(500, new { error = "Failed to send engagement notification", details = ex.Message });
        }
    }

    private string GetCurrentUserId()
    {
        return User.FindFirst("sub")?.Value ?? User.FindFirst("user_id")?.Value ?? "unknown";
    }
}

// Request/Response DTOs
public class CommunicationStatus
{
    public bool TwilioEnabled { get; set; }
    public DateTime Timestamp { get; set; }
}

public class SendSmsRequest
{
    public string Message { get; set; } = string.Empty;
    public string? PhoneNumber { get; set; }
    public string? UserId { get; set; }
}

public class SendWhatsAppRequest
{
    public string Message { get; set; } = string.Empty;
    public string? PhoneNumber { get; set; }
    public string? UserId { get; set; }
}

public class SendMessageResponse
{
    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
    public string Channel { get; set; } = string.Empty;
    public DateTime Timestamp { get; set; }
}

public class VerificationRequest
{
    public string PhoneNumber { get; set; } = string.Empty;
    public string? Channel { get; set; } = "sms";
}

public class VerificationResponse
{
    public bool Success { get; set; }
    public string VerificationSid { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public DateTime Timestamp { get; set; }
}

public class VerificationConfirmRequest
{
    public string PhoneNumber { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
}

public class VerificationConfirmResponse
{
    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
    public bool IsVerified { get; set; }
    public DateTime Timestamp { get; set; }
}

public class UpdatePreferencesRequest
{
    public bool EnableSmsNotifications { get; set; } = true;
    public bool EnableWhatsAppNotifications { get; set; } = true;
    public bool EnableEngagementNotifications { get; set; } = true;
    public bool EnableAlerts { get; set; } = true;
    public string? PreferredChannel { get; set; } = "sms";
}

public class UpdatePreferencesResponse
{
    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
    public DateTime Timestamp { get; set; }
}

public class BulkNotificationRequest
{
    public string Message { get; set; } = string.Empty;
    public List<string> UserIds { get; set; } = new();
}

public class BulkNotificationResponse
{
    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
    public int UserCount { get; set; }
    public DateTime Timestamp { get; set; }
}

public class NotifyEngagementRequest
{
    public string UserId { get; set; } = string.Empty;
    public string ContentTitle { get; set; } = string.Empty;
    public string ActivityType { get; set; } = string.Empty; // like, comment, share, collaborate, mention
}

public class NotifyEngagementResponse
{
    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
    public string ActivityType { get; set; } = string.Empty;
    public DateTime Timestamp { get; set; }
}
