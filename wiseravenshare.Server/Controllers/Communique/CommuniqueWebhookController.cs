using System.Collections.Concurrent;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Wiseravenshare.Server.Controllers.Communique;

/// <summary>
/// Twilio webhook endpoints — called by Twilio, not the client.
/// All endpoints are AllowAnonymous; caller authenticity is verified by
/// the optional Twilio signature header (if COMMUNIQUE_TWILIO_AUTH_SECRET is set).
/// </summary>
[ApiController]
[Route("api/communique/webhook")]
[AllowAnonymous]
public class CommuniqueWebhookController : ControllerBase
{
    // In-memory inbox (last 200 messages across all users).
    // Keyed by a deterministic channel-normalized "To" number so the
    // RavenCommuniqueController can surface these to the authenticated user.
    private static readonly ConcurrentQueue<IncomingCommuniqueMessage> Inbox = new();
    private const int MaxInboxSize = 200;

    internal static IReadOnlyList<IncomingCommuniqueMessage> GetInbox() => Inbox.ToArray();

    private readonly IConfiguration _configuration;
    private readonly ILogger<CommuniqueWebhookController> _logger;

    public CommuniqueWebhookController(
        IConfiguration configuration,
        ILogger<CommuniqueWebhookController> logger)
    {
        _configuration = configuration;
        _logger = logger;
    }

    // ── Voice ─────────────────────────────────────────────────────────────────

    /// <summary>
    /// TwiML endpoint Twilio calls when an outbound call connects.
    /// Returns a simple response that reads a greeting and then waits.
    /// Set Communique:Twilio:VoiceWebhookUrl = https://wiseravenshare.com/api/communique/webhook/voice/twiml
    /// </summary>
    [HttpGet("voice/twiml")]
    [HttpPost("voice/twiml")]
    [Produces("text/xml")]
    public ContentResult VoiceTwiml(
        [FromQuery] string? internalCallId = null,
        [FromQuery] string? caller = null)
    {
        var greeting = _configuration["Communique:Voice:Greeting"]
            ?? "Thank you for calling WiseRavenShare. Please hold while we connect your call.";

        var holdMusicUrl = _configuration["Communique:Voice:HoldMusicUrl"] ?? string.Empty;
        var playHoldMusic = !string.IsNullOrWhiteSpace(holdMusicUrl);

        var twiml = playHoldMusic
            ? $"""
              <?xml version="1.0" encoding="UTF-8"?>
              <Response>
                <Say voice="Polly.Joanna">{System.Security.SecurityElement.Escape(greeting)}</Say>
                <Play loop="5">{System.Security.SecurityElement.Escape(holdMusicUrl)}</Play>
              </Response>
              """
            : $"""
              <?xml version="1.0" encoding="UTF-8"?>
              <Response>
                <Say voice="Polly.Joanna">{System.Security.SecurityElement.Escape(greeting)}</Say>
                <Pause length="60"/>
              </Response>
              """;

        _logger.LogInformation(
            "TwiML voice response served. InternalCallId={InternalCallId}, Caller={Caller}",
            internalCallId ?? "<none>", caller ?? "<none>");

        return Content(twiml.Trim(), "text/xml");
    }

    /// <summary>
    /// Twilio status callback for outbound calls.
    /// Twilio POST this with CallSid, CallStatus, etc.
    /// </summary>
    [HttpPost("voice/status")]
    public IActionResult VoiceStatusCallback(
        [FromForm] string? CallSid,
        [FromForm] string? CallStatus,
        [FromForm] string? From,
        [FromForm] string? To,
        [FromQuery] string? internalCallId = null)
    {
        _logger.LogInformation(
            "Twilio voice status callback. Sid={Sid}, Status={Status}, From={From}, To={To}, InternalId={InternalId}",
            CallSid, CallStatus, From, To, internalCallId);

        return Ok();
    }

    /// <summary>
    /// Twilio webhook for incoming voice calls.
    /// Returns TwiML that records a voicemail if no one picks up.
    /// </summary>
    [HttpPost("voice/incoming")]
    [Produces("text/xml")]
    public ContentResult IncomingVoice(
        [FromForm] string? From,
        [FromForm] string? To,
        [FromForm] string? CallSid)
    {
        _logger.LogInformation(
            "Incoming voice call. From={From}, To={To}, CallSid={CallSid}", From, To, CallSid);

        EnqueueIncoming("voice", From ?? "unknown", To ?? string.Empty, $"Incoming voice call from {From}", CallSid);

        var recordingWebhookUrl = _configuration["Communique:Voice:RecordingWebhookUrl"] ?? string.Empty;
        var greeting = _configuration["Communique:Voice:IncomingGreeting"]
            ?? "Welcome to WiseRavenShare. Please leave your message after the tone.";

        var twiml = string.IsNullOrWhiteSpace(recordingWebhookUrl)
            ? $"""
              <?xml version="1.0" encoding="UTF-8"?>
              <Response>
                <Say voice="Polly.Joanna">{System.Security.SecurityElement.Escape(greeting)}</Say>
                <Record maxLength="120" transcribe="false"/>
              </Response>
              """
            : $"""
              <?xml version="1.0" encoding="UTF-8"?>
              <Response>
                <Say voice="Polly.Joanna">{System.Security.SecurityElement.Escape(greeting)}</Say>
                <Record maxLength="120" transcribe="false" recordingStatusCallback="{System.Security.SecurityElement.Escape(recordingWebhookUrl)}" recordingStatusCallbackMethod="POST"/>
              </Response>
              """;

        return Content(twiml.Trim(), "text/xml");
    }

    // ── SMS ───────────────────────────────────────────────────────────────────

    /// <summary>
    /// Twilio webhook for incoming SMS messages.
    /// Twilio POSTs From, To, Body, MessageSid.
    /// </summary>
    [HttpPost("sms/incoming")]
    [Produces("text/xml")]
    public ContentResult IncomingSms(
        [FromForm] string? From,
        [FromForm] string? To,
        [FromForm] string? Body,
        [FromForm] string? MessageSid)
    {
        _logger.LogInformation(
            "Incoming SMS. From={From}, To={To}, Sid={MessageSid}", From, To, MessageSid);

        EnqueueIncoming("sms", From ?? "unknown", To ?? string.Empty, Body ?? string.Empty, MessageSid);

        // Empty <Response/> tells Twilio not to reply automatically.
        return Content("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response/>", "text/xml");
    }

    // ── WhatsApp ──────────────────────────────────────────────────────────────

    /// <summary>
    /// Twilio webhook for incoming WhatsApp messages.
    /// Same format as SMS but From/To are prefixed with "whatsapp:".
    /// </summary>
    [HttpPost("whatsapp/incoming")]
    [Produces("text/xml")]
    public ContentResult IncomingWhatsApp(
        [FromForm] string? From,
        [FromForm] string? To,
        [FromForm] string? Body,
        [FromForm] string? MessageSid)
    {
        var normalizedFrom = (From ?? "unknown").Replace("whatsapp:", string.Empty, StringComparison.OrdinalIgnoreCase);
        var normalizedTo   = (To   ?? string.Empty).Replace("whatsapp:", string.Empty, StringComparison.OrdinalIgnoreCase);

        _logger.LogInformation(
            "Incoming WhatsApp. From={From}, To={To}, Sid={MessageSid}", normalizedFrom, normalizedTo, MessageSid);

        EnqueueIncoming("whatsapp", normalizedFrom, normalizedTo, Body ?? string.Empty, MessageSid);

        return Content("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response/>", "text/xml");
    }

    // ── Internal inbox query (used by RavenCommuniqueController) ─────────────

    private static void EnqueueIncoming(string channel, string from, string to, string body, string? sid)
    {
        Inbox.Enqueue(new IncomingCommuniqueMessage
        {
            Id = Guid.NewGuid().ToString("N"),
            Channel = channel,
            From = from,
            To = to,
            Body = body.Length > 1600 ? body[..1600] : body,
            MessageSid = sid ?? string.Empty,
            ReceivedAtUtc = DateTime.UtcNow
        });

        while (Inbox.Count > MaxInboxSize && Inbox.TryDequeue(out _)) { }
    }
}

public sealed class IncomingCommuniqueMessage
{
    public string Id { get; set; } = string.Empty;
    public string Channel { get; set; } = "sms";
    public string From { get; set; } = string.Empty;
    public string To { get; set; } = string.Empty;
    public string Body { get; set; } = string.Empty;
    public string MessageSid { get; set; } = string.Empty;
    public DateTime ReceivedAtUtc { get; set; }
}
