using System.ComponentModel.DataAnnotations;
using System.Collections.Concurrent;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.Entities.Communique;
using Wiseravenshare.Server.Services.Communique;
using Wiseravenshare.Server.Shared;

namespace Wiseravenshare.Server.Controllers.Communique;

[ApiController]
[Route("api/communique")]
[Authorize]
public class RavenCommuniqueController : ControllerBase
{
    private const int MaxDispatchLogEntries = 300;
    private static readonly ConcurrentQueue<CommuniqueDispatchLogEntry> DispatchLog = new();

    private readonly ICommuniqueMessagingService _messagingService;
    private readonly ICommuniqueCallService _callService;
    private readonly ILogger<RavenCommuniqueController> _logger;

    public RavenCommuniqueController(
        ICommuniqueMessagingService messagingService,
        ICommuniqueCallService callService,
        ILogger<RavenCommuniqueController> logger)
    {
        _messagingService = messagingService;
        _callService = callService;
        _logger = logger;
    }

    /// <summary>Send an SMS message via configured communique provider.</summary>
    [HttpPost("sms")]
    public async Task<IActionResult> SendSms([FromBody] SmsRequest request)
    {
        if (!ModelState.IsValid)
            return BadRequest(new { error = "Invalid request." });

        var result = await _messagingService.SendSmsAsync(request.To, request.Message);
        AppendDispatchLog("sms", request.To, request.Message, result);
        if (!result.Success)
            return BadRequest(new { error = result.ErrorMessage ?? "Failed to send SMS." });

        return Ok(new { messageSid = result.MessageSid, channel = result.Channel });
    }

    /// <summary>Send a WhatsApp message via configured communique provider.</summary>
    [HttpPost("whatsapp")]
    public async Task<IActionResult> SendWhatsApp([FromBody] SmsRequest request)
    {
        if (!ModelState.IsValid)
            return BadRequest(new { error = "Invalid request." });

        var result = await _messagingService.SendWhatsAppAsync(request.To, request.Message);
        AppendDispatchLog("whatsapp", request.To, request.Message, result);
        if (!result.Success)
            return BadRequest(new { error = result.ErrorMessage ?? "Failed to send WhatsApp message." });

        return Ok(new { messageSid = result.MessageSid, channel = result.Channel });
    }

    /// <summary>Send a message on any supported channel (sms | whatsapp | voice).</summary>
    [HttpPost("send")]
    public async Task<IActionResult> Send([FromBody] CommuniqueRequest request)
    {
        if (!ModelState.IsValid)
            return BadRequest(new { error = "Invalid request." });

        var callerId = User.GetUserId().ToString();

        switch (request.Channel.Trim().ToLowerInvariant())
        {
            case "sms":
            {
                var result = await _messagingService.SendSmsAsync(request.To, request.Message);
                AppendDispatchLog("sms", request.To, request.Message, result);
                if (!result.Success)
                    return BadRequest(new { error = result.ErrorMessage ?? "SMS failed." });
                return Ok(new { messageSid = result.MessageSid, channel = "sms" });
            }

            case "whatsapp":
            {
                var result = await _messagingService.SendWhatsAppAsync(request.To, request.Message);
                AppendDispatchLog("whatsapp", request.To, request.Message, result);
                if (!result.Success)
                    return BadRequest(new { error = result.ErrorMessage ?? "WhatsApp failed." });
                return Ok(new { messageSid = result.MessageSid, channel = "whatsapp" });
            }

            case "voice":
            {
                ActiveCallState call;
                try
                {
                    call = await _callService.InitiateCall(callerId, request.To, CallType.VOIP);
                }
                catch (InvalidOperationException ex)
                {
                    AppendDispatchLog("voice", request.To, request.Message, MessageSendResult.Fail(ex.Message, "voice"));
                    return BadRequest(new { error = ex.Message });
                }

                AppendDispatchLog("voice", request.To, request.Message, MessageSendResult.Ok(call.ProviderCallId ?? call.CallId, "voice"));

                return Ok(new
                {
                    callId         = call.CallId,
                    providerCallId = call.ProviderCallId,
                    status         = call.Status.ToString(),
                    channel        = "voice"
                });
            }

            default:
                return BadRequest(new { error = $"Unsupported channel '{request.Channel}'. Use: sms, whatsapp, voice." });
        }
    }

    /// <summary>Get SMS/WhatsApp delivery status for a Twilio MessageSid (stub — wire to DB once message logs table exists).</summary>
    [HttpGet("status/{messageSid}")]
    public IActionResult GetStatus(string messageSid)
    {
        return Ok(new { messageSid, status = "pending" });
    }

    /// <summary>Aggregated outbound dispatch log across sms / whatsapp / voice channels.</summary>
    [HttpGet("messages")]
    public IActionResult GetMessages([FromQuery] string? channel = null, [FromQuery] int limit = 25)
    {
        var safeLimit = Math.Clamp(limit, 1, 100);
        var normalizedChannel = string.IsNullOrWhiteSpace(channel)
            ? string.Empty
            : channel.Trim().ToLowerInvariant();
        var callerId = User.GetUserId().ToString();

        var items = DispatchLog
            .Where(entry => string.Equals(entry.UserId, callerId, StringComparison.OrdinalIgnoreCase))
            .Where(entry => string.IsNullOrWhiteSpace(normalizedChannel)
                || string.Equals(entry.Channel, normalizedChannel, StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(entry => entry.RequestedAtUtc)
            .Take(safeLimit)
            .ToArray();

        return Ok(items);
    }

    private void AppendDispatchLog(string channel, string to, string message, MessageSendResult result)
    {
        var callerId = User.GetUserId().ToString();
        var trimmedMessage = string.IsNullOrWhiteSpace(message) ? string.Empty : message.Trim();
        var preview = trimmedMessage.Length <= 160 ? trimmedMessage : $"{trimmedMessage[..160]}…";

        DispatchLog.Enqueue(new CommuniqueDispatchLogEntry
        {
            Id = Guid.NewGuid().ToString("N"),
            UserId = callerId,
            Channel = string.IsNullOrWhiteSpace(channel) ? "sms" : channel.Trim().ToLowerInvariant(),
            To = to.Trim(),
            MessagePreview = preview,
            Success = result.Success,
            MessageSid = result.MessageSid ?? string.Empty,
            ErrorMessage = result.ErrorMessage ?? string.Empty,
            RequestedAtUtc = DateTime.UtcNow
        });

        while (DispatchLog.Count > MaxDispatchLogEntries && DispatchLog.TryDequeue(out _))
        {
        }
    }
}

public sealed class CommuniqueDispatchLogEntry
{
    public string Id { get; set; } = string.Empty;
    public string UserId { get; set; } = string.Empty;
    public string Channel { get; set; } = "sms";
    public string To { get; set; } = string.Empty;
    public string MessagePreview { get; set; } = string.Empty;
    public bool Success { get; set; }
    public string MessageSid { get; set; } = string.Empty;
    public string ErrorMessage { get; set; } = string.Empty;
    public DateTime RequestedAtUtc { get; set; }
}

public class SmsRequest
{
    [Required]
    public string To { get; set; } = string.Empty;

    [Required]
    [MaxLength(1600)]
    public string Message { get; set; } = string.Empty;
}

public class CommuniqueRequest
{
    /// <summary>sms | whatsapp | voice</summary>
    [Required]
    public string Channel { get; set; } = "sms";

    [Required]
    public string To { get; set; } = string.Empty;

    [MaxLength(1600)]
    public string Message { get; set; } = string.Empty;
}
