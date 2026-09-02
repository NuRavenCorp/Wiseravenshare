using Twilio;
using Twilio.Rest.Api.V2010.Account;
using Twilio.Types;
using Wiseravenshare.Server.Entities.Communique;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace Wiseravenshare.Server.Services.Communique;

// ── External call gateway (Twilio voice) ─────────────────────────────────────

public sealed class TwilioExternalCallGateway : IExternalCallGateway
{
    private readonly IConfiguration _configuration;
    private readonly ILogger<TwilioExternalCallGateway> _logger;

    public TwilioExternalCallGateway(
        IConfiguration configuration,
        ILogger<TwilioExternalCallGateway> logger)
    {
        _configuration = configuration;
        _logger = logger;
    }

    public async Task<ExternalCallStartResult> StartOutboundCallAsync(
        string internalCallId,
        string callerId,
        string destinationNumber,
        CancellationToken cancellationToken = default)
    {
        var enabled = _configuration.GetValue("Communique:Twilio:Enabled", false);
        if (!enabled)
            return ExternalCallStartResult.Failed("Twilio outbound calling is disabled.");

        var accountSid  = _configuration["Communique:Twilio:AccountSid"];
        var authToken   = _configuration["Communique:Twilio:AuthToken"];
        var fromNumber  = _configuration["Communique:Twilio:FromNumber"];
        var twimlUrl    = _configuration["Communique:Twilio:VoiceWebhookUrl"];

        if (string.IsNullOrWhiteSpace(accountSid) ||
            string.IsNullOrWhiteSpace(authToken)  ||
            string.IsNullOrWhiteSpace(fromNumber) ||
            string.IsNullOrWhiteSpace(twimlUrl))
        {
            return ExternalCallStartResult.Failed(
                "Twilio configuration is incomplete. Expected Communique:Twilio:AccountSid, AuthToken, FromNumber, and VoiceWebhookUrl.");
        }

        try
        {
            TwilioClient.Init(accountSid, authToken);

            var statusCallbackUrl = _configuration["Communique:Twilio:StatusCallbackUrl"];
            Uri? callbackUri = null;
            if (Uri.TryCreate(statusCallbackUrl, UriKind.Absolute, out var parsedCallback))
                callbackUri = AppendQuery(parsedCallback, "internalCallId", internalCallId);

            var call = await CallResource.CreateAsync(
                to:                   new PhoneNumber(destinationNumber),
                from:                 new PhoneNumber(fromNumber),
                url:                  new Uri(twimlUrl),
                statusCallback:       callbackUri,
                statusCallbackMethod: Twilio.Http.HttpMethod.Post,
                pathAccountSid:       accountSid);

            _logger.LogInformation(
                "Started external call via Twilio. InternalCallId={InternalCallId}, TwilioSid={TwilioSid}, Destination={Destination}, CallerId={CallerId}",
                internalCallId, call.Sid, destinationNumber, callerId);

            return ExternalCallStartResult.Success(
                call.Sid ?? string.Empty,
                call.Status?.ToString() ?? string.Empty);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex,
                "Failed to start Twilio external call. InternalCallId={InternalCallId}, Destination={Destination}, CallerId={CallerId}",
                internalCallId, destinationNumber, callerId);

            return ExternalCallStartResult.Failed("Twilio outbound call failed: " + ex.Message);
        }
    }

    private static Uri AppendQuery(Uri uri, string key, string value)
    {
        var parts = new List<string>();
        var rawQuery = uri.Query;
        if (!string.IsNullOrWhiteSpace(rawQuery))
        {
            var trimmed = rawQuery.TrimStart('?');
            if (!string.IsNullOrWhiteSpace(trimmed))
                parts.Add(trimmed);
        }
        parts.Add($"{Uri.EscapeDataString(key)}={Uri.EscapeDataString(value)}");

        return new UriBuilder(uri) { Query = string.Join("&", parts) }.Uri;
    }
}

// ── Twilio SMS / WhatsApp messaging ──────────────────────────────────────────

public interface ITwilioMessagingService
{
    Task<MessageSendResult> SendSmsAsync(string toNumber, string message);
    Task<MessageSendResult> SendWhatsAppAsync(string toNumber, string message);
}

public interface ICommuniqueMessagingService
{
    Task<MessageSendResult> SendSmsAsync(string toNumber, string message);
    Task<MessageSendResult> SendWhatsAppAsync(string toNumber, string message);
}

public class TwilioMessagingService : ITwilioMessagingService, ICommuniqueMessagingService
{
    private readonly IConfiguration _configuration;
    private readonly ILogger<TwilioMessagingService> _logger;

    public TwilioMessagingService(IConfiguration configuration, ILogger<TwilioMessagingService> logger)
    {
        _configuration = configuration;
        _logger = logger;
    }

    public Task<MessageSendResult> SendSmsAsync(string toNumber, string message) =>
        SendTwilioMessageAsync(toNumber, message, whatsApp: false);

    public Task<MessageSendResult> SendWhatsAppAsync(string toNumber, string message) =>
        SendTwilioMessageAsync(toNumber, message, whatsApp: true);

    private async Task<MessageSendResult> SendTwilioMessageAsync(string toNumber, string message, bool whatsApp)
    {
        var channel = whatsApp ? "whatsapp" : "sms";

        var accountSid = _configuration["Communique:Twilio:AccountSid"];
        var authToken  = _configuration["Communique:Twilio:AuthToken"];
        var fromNumber = whatsApp
            ? _configuration["Communique:Twilio:WhatsAppFrom"] ?? "whatsapp:+14155238886"
            : _configuration["Communique:Twilio:FromNumber"];

        if (string.IsNullOrWhiteSpace(accountSid) ||
            string.IsNullOrWhiteSpace(authToken)  ||
            string.IsNullOrWhiteSpace(fromNumber))
        {
            _logger.LogWarning("Twilio credentials not configured for channel {Channel}.", channel);
            return MessageSendResult.Fail("Twilio credentials are not configured.", channel);
        }

        if (!_configuration.GetValue("Communique:Twilio:Enabled", false))
        {
            _logger.LogDebug("Twilio disabled — skipping {Channel} to {To}.", channel, toNumber);
            return MessageSendResult.Fail("Twilio is disabled.", channel);
        }

        try
        {
            TwilioClient.Init(accountSid, authToken);

            var to   = whatsApp ? $"whatsapp:{toNumber}" : toNumber;
            var from = fromNumber;

            var msg = await MessageResource.CreateAsync(
                to:   new PhoneNumber(to),
                from: new PhoneNumber(from),
                body: message);

            _logger.LogInformation(
                "Twilio {Channel} sent. Sid={Sid} To={To} Status={Status}",
                channel, msg.Sid, toNumber, msg.Status);

            return MessageSendResult.Ok(msg.Sid ?? string.Empty, channel);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Twilio {Channel} failed for {To}.", channel, toNumber);
            return MessageSendResult.Fail(ex.Message, channel);
        }
    }
}

public sealed class ZernioMessagingService : ICommuniqueMessagingService
{
    private readonly IConfiguration _configuration;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<ZernioMessagingService> _logger;

    public ZernioMessagingService(
        IConfiguration configuration,
        IHttpClientFactory httpClientFactory,
        ILogger<ZernioMessagingService> logger)
    {
        _configuration = configuration;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    public Task<MessageSendResult> SendSmsAsync(string toNumber, string message) =>
        SendZernioMessageAsync(toNumber, message, whatsApp: false);

    public Task<MessageSendResult> SendWhatsAppAsync(string toNumber, string message) =>
        SendZernioMessageAsync(toNumber, message, whatsApp: true);

    private async Task<MessageSendResult> SendZernioMessageAsync(string toNumber, string message, bool whatsApp)
    {
        var channel = whatsApp ? "whatsapp" : "sms";
        if (!GetEnabled())
        {
            return MessageSendResult.Fail("Zernio is disabled.", channel);
        }

        var apiKey = GetSetting("ApiKey");
        var baseUrl = (GetSetting("BaseUrl") ?? string.Empty).TrimEnd('/');
        var path = whatsApp
            ? (GetSetting("WhatsAppPath") ?? "/v1/messages/whatsapp")
            : (GetSetting("SmsPath") ?? "/v1/messages/sms");
        var fromNumber = GetSetting("FromNumber");

        if (string.IsNullOrWhiteSpace(apiKey) || string.IsNullOrWhiteSpace(baseUrl))
        {
            _logger.LogWarning("Zernio configuration incomplete for {Channel}.", channel);
            return MessageSendResult.Fail("Zernio configuration is incomplete.", channel);
        }

        if (!Uri.TryCreate($"{baseUrl}{path}", UriKind.Absolute, out var endpoint))
        {
            return MessageSendResult.Fail("Zernio endpoint URL is invalid.", channel);
        }

        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(20);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
        client.DefaultRequestHeaders.TryAddWithoutValidation("X-Api-Key", apiKey);

        var payload = new
        {
            to = toNumber,
            message,
            from = fromNumber,
            channel
        };

        var requestBody = JsonSerializer.Serialize(payload);
        using var response = await client.PostAsync(
            endpoint,
            new StringContent(requestBody, Encoding.UTF8, "application/json"));

        var responseText = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning(
                "Zernio {Channel} failed ({StatusCode}). Response: {Response}",
                channel, (int)response.StatusCode, responseText);
            return MessageSendResult.Fail($"Zernio {channel} failed with HTTP {(int)response.StatusCode}.", channel);
        }

        var messageId = ExtractMessageId(responseText);
        return MessageSendResult.Ok(messageId, channel);
    }

    private bool GetEnabled()
    {
        return _configuration.GetValue("Communique:Zernio:Enabled", false);
    }

    private string? GetSetting(string key)
    {
        return _configuration[$"Communique:Zernio:{key}"];
    }

    private static string ExtractMessageId(string responseText)
    {
        if (string.IsNullOrWhiteSpace(responseText))
        {
            return string.Empty;
        }

        try
        {
            using var doc = JsonDocument.Parse(responseText);
            var root = doc.RootElement;
            if (TryGetString(root, "id", out var id)) return id;
            if (TryGetString(root, "messageId", out var messageId)) return messageId;
            if (TryGetString(root, "sid", out var sid)) return sid;
            if (root.TryGetProperty("data", out var data))
            {
                if (TryGetString(data, "id", out var dataId)) return dataId;
                if (TryGetString(data, "messageId", out var dataMessageId)) return dataMessageId;
            }
        }
        catch
        {
            // Return empty ID when provider response is non-JSON.
        }

        return string.Empty;
    }

    private static bool TryGetString(JsonElement element, string propertyName, out string value)
    {
        value = string.Empty;
        if (!element.TryGetProperty(propertyName, out var prop))
        {
            return false;
        }

        value = prop.ValueKind == JsonValueKind.String ? prop.GetString() ?? string.Empty : prop.ToString();
        return !string.IsNullOrWhiteSpace(value);
    }
}

public sealed class RoutedCommuniqueMessagingService : ICommuniqueMessagingService
{
    private readonly IConfiguration _configuration;
    private readonly ITwilioMessagingService _twilioMessagingService;
    private readonly ZernioMessagingService _zernioMessagingService;

    public RoutedCommuniqueMessagingService(
        IConfiguration configuration,
        ITwilioMessagingService twilioMessagingService,
    ZernioMessagingService zernioMessagingService)
    {
        _configuration = configuration;
        _twilioMessagingService = twilioMessagingService;
    _zernioMessagingService = zernioMessagingService;
    }

    public Task<MessageSendResult> SendSmsAsync(string toNumber, string message)
    {
        return UseZernio()
            ? _zernioMessagingService.SendSmsAsync(toNumber, message)
            : _twilioMessagingService.SendSmsAsync(toNumber, message);
    }

    public Task<MessageSendResult> SendWhatsAppAsync(string toNumber, string message)
    {
        return UseZernio()
            ? _zernioMessagingService.SendWhatsAppAsync(toNumber, message)
            : _twilioMessagingService.SendWhatsAppAsync(toNumber, message);
    }

    private bool UseZernio()
    {
        var provider = (_configuration["Communique:Messaging:Provider"] ?? "twilio")
            .Trim()
            .ToLowerInvariant();
        return provider == "zernio";
    }
}
