using System.ComponentModel.DataAnnotations;
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
                if (!result.Success)
                    return BadRequest(new { error = result.ErrorMessage ?? "SMS failed." });
                return Ok(new { messageSid = result.MessageSid, channel = "sms" });
            }

            case "whatsapp":
            {
                var result = await _messagingService.SendWhatsAppAsync(request.To, request.Message);
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
                    return BadRequest(new { error = ex.Message });
                }

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
