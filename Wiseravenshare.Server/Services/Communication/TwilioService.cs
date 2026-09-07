// Wiseravenshare.Server/Services/Communication/TwilioService.cs
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Twilio;
using Twilio.Clients;
using Twilio.Exceptions;
using Twilio.Rest.Api.V2010.Account;
using Twilio.Rest.Verify.V2.Service;
using Twilio.Types;

namespace Wiseravenshare.Server.Services.Communication;

public interface ITwilioService
{
    Task<bool> SendSmsAsync(string toPhoneNumber, string message);
    Task<bool> SendWhatsAppAsync(string toPhoneNumber, string message);
    Task<string> SendVerificationCodeAsync(string toPhoneNumber, string channel = "sms");
    Task<bool> VerifyCodeAsync(string toPhoneNumber, string code);
    Task<List<MessageRecord>> GetMessageHistoryAsync(string phoneNumber, int limit = 10);
    bool IsEnabled { get; }
}

public class TwilioService : ITwilioService
{
    private readonly IConfiguration _configuration;
    private readonly ILogger<TwilioService> _logger;
    private readonly string _accountSid;
    private readonly string _authToken;
    private readonly string _fromPhoneNumber;
    private readonly string _whatsAppFromNumber;
    private readonly string _verifyServiceSid;
    private readonly bool _enabled;
    private readonly ITwilioRestClient _twilioClient;

    public bool IsEnabled => _enabled;

    public TwilioService(
        IConfiguration configuration,
        ILogger<TwilioService> logger)
    {
        _configuration = configuration;
        _logger = logger;

        // Try both hierarchical and flat env var naming conventions
        _enabled = GetConfigValue(configuration, "COMMUNIQUE_TWILIO_ENABLED", "Communique:Twilio:Enabled") == "true";
        _accountSid = GetConfigValue(configuration, "TWILIO_ACCOUNT_SID", "Communique:Twilio:AccountSid") ?? string.Empty;
        _authToken = GetConfigValue(configuration, "TWILIO_AUTH_TOKEN", "Communique:Twilio:AuthToken") ?? string.Empty;
        _fromPhoneNumber = GetConfigValue(configuration, "TWILIO_FROM_NUMBER", "Communique:Twilio:FromNumber") ?? string.Empty;
        _whatsAppFromNumber = GetConfigValue(configuration, "COMMUNIQUE_TWILIO_WHATSAPP_FROM", "Communique:Twilio:WhatsAppFrom") ?? string.Empty;
        _verifyServiceSid = GetConfigValue(configuration, "TWILIO_VERIFY_SERVICE_SID", "Communique:Twilio:VerifyServiceSid") ?? string.Empty;

        if (_enabled && (!string.IsNullOrEmpty(_accountSid) && !string.IsNullOrEmpty(_authToken)))
        {
            TwilioClient.Init(_accountSid, _authToken);
            _twilioClient = new TwilioRestClient(_accountSid, _authToken);
            _logger.LogInformation("Twilio service initialized successfully with credentials from {ConfigSource}", 
                !string.IsNullOrEmpty(configuration["Communique:Twilio:Enabled"]) ? "hierarchical config" : "flat env vars");
        }
        else if (_enabled)
        {
            _logger.LogError("Twilio is enabled but credentials are missing. " +
                "Expected: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER or " +
                "Communique:Twilio:AccountSid, Communique:Twilio:AuthToken, Communique:Twilio:FromNumber");
        }
    }

    private static string? GetConfigValue(IConfiguration config, string flatKey, string hierarchicalKey)
    {
        // Try hierarchical key first (from .do/app.yaml)
        var value = config[hierarchicalKey];
        if (!string.IsNullOrEmpty(value))
            return value;

        // Fall back to flat env var key (for local dev)
        return config[flatKey];
    }

    /// <summary>
    /// Send SMS message to phone number
    /// </summary>
    public async Task<bool> SendSmsAsync(string toPhoneNumber, string message)
    {
        if (!_enabled)
        {
            _logger.LogWarning("Twilio is not enabled");
            return false;
        }

        if (string.IsNullOrWhiteSpace(toPhoneNumber) || string.IsNullOrWhiteSpace(message))
        {
            _logger.LogWarning("Phone number or message is empty");
            return false;
        }

        try
        {
            _logger.LogInformation("Sending SMS to {PhoneNumber}", toPhoneNumber);

            var messageResource = await MessageResource.CreateAsync(
                to: new PhoneNumber(toPhoneNumber),
                from: new PhoneNumber(_fromPhoneNumber),
                body: message,
                client: _twilioClient
            );

            _logger.LogInformation(
                "SMS sent successfully. SID: {Sid}, Status: {Status}",
                messageResource.Sid,
                messageResource.Status
            );

            return messageResource.Status != MessageResource.StatusEnum.Failed;
        }
        catch (ApiException ex)
        {
            _logger.LogError(ex, "Failed to send SMS to {PhoneNumber}: {Error}", toPhoneNumber, ex.Message);
            return false;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error sending SMS to {PhoneNumber}", toPhoneNumber);
            return false;
        }
    }

    /// <summary>
    /// Send WhatsApp message to phone number
    /// </summary>
    public async Task<bool> SendWhatsAppAsync(string toPhoneNumber, string message)
    {
        if (!_enabled)
        {
            _logger.LogWarning("Twilio is not enabled");
            return false;
        }

        if (string.IsNullOrWhiteSpace(toPhoneNumber) || string.IsNullOrWhiteSpace(message))
        {
            _logger.LogWarning("Phone number or message is empty");
            return false;
        }

        try
        {
            _logger.LogInformation("Sending WhatsApp message to {PhoneNumber}", toPhoneNumber);

            // Format: whatsapp:+1234567890
            var whatsAppToNumber = toPhoneNumber.StartsWith("whatsapp:")
                ? toPhoneNumber
                : $"whatsapp:{toPhoneNumber}";

            var messageResource = await MessageResource.CreateAsync(
                to: new PhoneNumber(whatsAppToNumber),
                from: new PhoneNumber(_whatsAppFromNumber),
                body: message,
                client: _twilioClient
            );

            _logger.LogInformation(
                "WhatsApp message sent successfully. SID: {Sid}, Status: {Status}",
                messageResource.Sid,
                messageResource.Status
            );

            return messageResource.Status != MessageResource.StatusEnum.Failed;
        }
        catch (ApiException ex)
        {
            _logger.LogError(ex, "Failed to send WhatsApp to {PhoneNumber}: {Error}", toPhoneNumber, ex.Message);
            return false;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error sending WhatsApp to {PhoneNumber}", toPhoneNumber);
            return false;
        }
    }

    /// <summary>
    /// Send verification code via SMS or WhatsApp
    /// </summary>
    public async Task<string> SendVerificationCodeAsync(string toPhoneNumber, string channel = "sms")
    {
        if (!_enabled)
        {
            _logger.LogWarning("Twilio Verify is not enabled");
            return string.Empty;
        }

        if (string.IsNullOrWhiteSpace(_verifyServiceSid))
        {
            _logger.LogError("Twilio Verify Service SID is not configured");
            return string.Empty;
        }

        try
        {
            _logger.LogInformation(
                "Sending verification code to {PhoneNumber} via {Channel}",
                toPhoneNumber,
                channel
            );

            var verification = await VerificationResource.CreateAsync(
                to: toPhoneNumber,
                channel: channel,
                pathServiceSid: _verifyServiceSid,
                client: _twilioClient
            );

            _logger.LogInformation(
                "Verification code sent. SID: {Sid}, Status: {Status}",
                verification.Sid,
                verification.Status
            );

            return verification.Sid;
        }
        catch (ApiException ex)
        {
            _logger.LogError(
                ex,
                "Failed to send verification code to {PhoneNumber}: {Error}",
                toPhoneNumber,
                ex.Message
            );
            return string.Empty;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error sending verification code to {PhoneNumber}", toPhoneNumber);
            return string.Empty;
        }
    }

    /// <summary>
    /// Verify code sent to phone number
    /// </summary>
    public async Task<bool> VerifyCodeAsync(string toPhoneNumber, string code)
    {
        if (!_enabled)
        {
            _logger.LogWarning("Twilio Verify is not enabled");
            return false;
        }

        if (string.IsNullOrWhiteSpace(_verifyServiceSid))
        {
            _logger.LogError("Twilio Verify Service SID is not configured");
            return false;
        }

        if (string.IsNullOrWhiteSpace(code))
        {
            _logger.LogWarning("Verification code is empty");
            return false;
        }

        try
        {
            _logger.LogInformation(
                "Verifying code for {PhoneNumber}",
                toPhoneNumber
            );

            var verification = await VerificationCheckResource.CreateAsync(
                to: toPhoneNumber,
                code: code,
                pathServiceSid: _verifyServiceSid,
                client: _twilioClient
            );

            var isValid = verification.Status == "approved";

            _logger.LogInformation(
                "Verification check completed for {PhoneNumber}. Status: {Status}",
                toPhoneNumber,
                verification.Status
            );

            return isValid;
        }
        catch (ApiException ex)
        {
            _logger.LogWarning(ex, "Verification failed for {PhoneNumber}: {Error}", toPhoneNumber, ex.Message);
            return false;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error verifying code for {PhoneNumber}", toPhoneNumber);
            return false;
        }
    }

    /// <summary>
    /// Get message history for a phone number
    /// </summary>
    public async Task<List<MessageRecord>> GetMessageHistoryAsync(string phoneNumber, int limit = 10)
    {
        if (!_enabled)
        {
            return new List<MessageRecord>();
        }

        try
        {
            var messages = await MessageResource.ReadAsync(
                to: new PhoneNumber(phoneNumber),
                limit: limit,
                client: _twilioClient
            );

            return messages
                .Select(m => new MessageRecord
                {
                    MessageSid = m.Sid,
                    To = m.To?.ToString() ?? string.Empty,
                    From = m.From?.ToString() ?? string.Empty,
                    Body = m.Body,
                    Status = m.Status.ToString(),
                    DateSent = m.DateSent,
                    Direction = m.Direction.ToString()
                })
                .ToList();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to retrieve message history for {PhoneNumber}", phoneNumber);
            return new List<MessageRecord>();
        }
    }
}

public class MessageRecord
{
    public string MessageSid { get; set; } = string.Empty;
    public string To { get; set; } = string.Empty;
    public string From { get; set; } = string.Empty;
    public string Body { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public DateTime? DateSent { get; set; }
    public string Direction { get; set; } = string.Empty;
}
