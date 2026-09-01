using Twilio;
using Twilio.Rest.Api.V2010.Account;
using Twilio.Types;
using Wiseravenshare.Server.Entities.Communique;

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

public class TwilioMessagingService : ITwilioMessagingService
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
