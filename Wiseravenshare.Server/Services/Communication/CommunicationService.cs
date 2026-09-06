// Wiseravenshare.Server/Services/Communication/CommunicationService.cs
using Microsoft.Extensions.Logging;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Entities.Communique;
using Wiseravenshare.Server.Interfaces.Repositories;

namespace Wiseravenshare.Server.Services.Communication;

public interface ICommunicationService
{
    Task<bool> SendNotificationAsync(string userId, string message, string? phoneNumber = null, string channel = "sms");
    Task<(bool Success, string VerificationSid)> SendVerificationAsync(string phoneNumber);
    Task<bool> VerifyPhoneNumberAsync(string phoneNumber, string code);
    Task<bool> NotifyEngagementAsync(string userId, string contentTitle, string activityType);
    Task<bool> SendBulkNotificationAsync(List<string> userIds, string message);
    Task<bool> SendWhatsAppNotificationAsync(string phoneNumber, string message);
    Task<CommunicationPreferences?> GetUserPreferencesAsync(string userId);
    Task<bool> UpdateUserPreferencesAsync(string userId, CommunicationPreferences preferences);
}

public class CommunicationService : ICommunicationService
{
    private readonly ITwilioService _twilioService;
    private readonly IRepository<User> _userRepository;
    private readonly ILogger<CommunicationService> _logger;
    private readonly IRepository<CommunicationPreferences> _preferencesRepository;

    public CommunicationService(
        ITwilioService twilioService,
        IRepository<User> userRepository,
        IRepository<CommunicationPreferences> preferencesRepository,
        ILogger<CommunicationService> logger)
    {
        _twilioService = twilioService;
        _userRepository = userRepository;
        _preferencesRepository = preferencesRepository;
        _logger = logger;
    }

    /// <summary>
    /// Send notification to user via SMS or WhatsApp
    /// </summary>
    public async Task<bool> SendNotificationAsync(
        string userId,
        string message,
        string? phoneNumber = null,
        string channel = "sms")
    {
        if (!_twilioService.IsEnabled)
        {
            _logger.LogWarning("Twilio is not enabled. Skipping notification to user {UserId}", userId);
            return false;
        }

        try
        {
            // Get phone number from user if not provided
            if (string.IsNullOrEmpty(phoneNumber))
            {
                var userIdGuid = ParseUserGuidOrThrow(userId);
                var user = await _userRepository.GetByIdAsync(userIdGuid);
                phoneNumber = user?.PhoneNumber;

                if (string.IsNullOrEmpty(phoneNumber))
                {
                    _logger.LogWarning("No phone number found for user {UserId}", userId);
                    return false;
                }
            }

            // Check user preferences
            var preferences = await GetUserPreferencesAsync(userId);
            if (preferences != null && !preferences.EnableSmsNotifications && channel == "sms")
            {
                _logger.LogInformation("SMS notifications disabled for user {UserId}", userId);
                return false;
            }

            if (preferences != null && !preferences.EnableWhatsAppNotifications && channel == "whatsapp")
            {
                _logger.LogInformation("WhatsApp notifications disabled for user {UserId}", userId);
                return false;
            }

            // Send via appropriate channel
            bool result = channel.ToLower() switch
            {
                "whatsapp" => await _twilioService.SendWhatsAppAsync(phoneNumber, message),
                _ => await _twilioService.SendSmsAsync(phoneNumber, message)
            };

            if (result)
            {
                _logger.LogInformation(
                    "Notification sent to user {UserId} via {Channel}",
                    userId,
                    channel
                );
            }

            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error sending notification to user {UserId}", userId);
            return false;
        }
    }

    /// <summary>
    /// Send verification code to phone number
    /// </summary>
    public async Task<(bool Success, string VerificationSid)> SendVerificationAsync(string phoneNumber)
    {
        if (!_twilioService.IsEnabled)
        {
            _logger.LogWarning("Twilio is not enabled");
            return (false, string.Empty);
        }

        try
        {
            var verificationSid = await _twilioService.SendVerificationCodeAsync(phoneNumber, "sms");
            return (!string.IsNullOrEmpty(verificationSid), verificationSid ?? string.Empty);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error sending verification code to {PhoneNumber}", phoneNumber);
            return (false, string.Empty);
        }
    }

    /// <summary>
    /// Verify phone number with code
    /// </summary>
    public async Task<bool> VerifyPhoneNumberAsync(string phoneNumber, string code)
    {
        if (!_twilioService.IsEnabled)
        {
            _logger.LogWarning("Twilio is not enabled");
            return false;
        }

        try
        {
            return await _twilioService.VerifyCodeAsync(phoneNumber, code);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error verifying phone number {PhoneNumber}", phoneNumber);
            return false;
        }
    }

    /// <summary>
    /// Send engagement notification (like, comment, share, etc.)
    /// </summary>
    public async Task<bool> NotifyEngagementAsync(string userId, string contentTitle, string activityType)
    {
        if (!_twilioService.IsEnabled)
        {
            return false;
        }

        try
        {
            var userIdGuid = ParseUserGuidOrThrow(userId);
            var user = await _userRepository.GetByIdAsync(userIdGuid);
            if (user?.PhoneNumber == null)
            {
                return false;
            }

            var preferences = await GetUserPreferencesAsync(userId);
            if (preferences != null && !preferences.EnableEngagementNotifications)
            {
                return false;
            }

            string message = activityType switch
            {
                "like" => $"Someone liked your post: {contentTitle}",
                "comment" => $"New comment on your post: {contentTitle}",
                "share" => $"Your post was shared: {contentTitle}",
                "collaborate" => $"New collaboration request on: {contentTitle}",
                "mention" => $"You were mentioned: {contentTitle}",
                _ => $"Activity on your content: {contentTitle}"
            };

            var channel = preferences?.PreferredChannel ?? "sms";
            return await SendNotificationAsync(userId, message, user.PhoneNumber, channel);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error sending engagement notification to user {UserId}", userId);
            return false;
        }
    }

    /// <summary>
    /// Send bulk notification to multiple users
    /// </summary>
    public async Task<bool> SendBulkNotificationAsync(List<string> userIds, string message)
    {
        if (!_twilioService.IsEnabled || userIds == null || userIds.Count == 0)
        {
            return false;
        }

        try
        {
            int successCount = 0;
            int failureCount = 0;

            foreach (var userId in userIds)
            {
                bool result = await SendNotificationAsync(userId, message);
                if (result)
                {
                    successCount++;
                }
                else
                {
                    failureCount++;
                }

                // Rate limiting: wait 100ms between sends to avoid overwhelming Twilio
                await Task.Delay(100);
            }

            _logger.LogInformation(
                "Bulk notification completed. Success: {Success}, Failures: {Failures}",
                successCount,
                failureCount
            );

            return failureCount == 0;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error sending bulk notification");
            return false;
        }
    }

    /// <summary>
    /// Send WhatsApp notification
    /// </summary>
    public async Task<bool> SendWhatsAppNotificationAsync(string phoneNumber, string message)
    {
        if (!_twilioService.IsEnabled)
        {
            return false;
        }

        try
        {
            return await _twilioService.SendWhatsAppAsync(phoneNumber, message);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error sending WhatsApp notification to {PhoneNumber}", phoneNumber);
            return false;
        }
    }

    /// <summary>
    /// Get user's communication preferences
    /// </summary>
    public async Task<CommunicationPreferences?> GetUserPreferencesAsync(string userId)
    {
        try
        {
            // Try to find existing preferences
            var userIdGuid = ParseUserGuidOrThrow(userId);
            var preferences = (await _preferencesRepository.GetAllAsync())
                .FirstOrDefault(p => p.UserId == userIdGuid);

            if (preferences == null)
            {
                // Create default preferences
                preferences = new CommunicationPreferences
                {
                    UserId = userIdGuid,
                    EnableSmsNotifications = true,
                    EnableWhatsAppNotifications = true,
                    EnableEngagementNotifications = true,
                    PreferredChannel = "sms",
                    CreatedAt = DateTime.UtcNow
                };

                preferences = await _preferencesRepository.AddAsync(preferences);
            }

            return preferences;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving communication preferences for user {UserId}", userId);
            return null;
        }
    }

    /// <summary>
    /// Update user's communication preferences
    /// </summary>
    public async Task<bool> UpdateUserPreferencesAsync(string userId, CommunicationPreferences preferences)
    {
        try
        {
            preferences.UserId = ParseUserGuidOrThrow(userId);
            preferences.UpdatedAt = DateTime.UtcNow;

            await _preferencesRepository.UpdateAsync(preferences);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating communication preferences for user {UserId}", userId);
            return false;
        }
    }

    private static Guid ParseUserGuidOrThrow(string userId)
    {
        if (Guid.TryParse(userId, out var parsed))
        {
            return parsed;
        }

        throw new ArgumentException("User ID must be a valid GUID.", nameof(userId));
    }
}
