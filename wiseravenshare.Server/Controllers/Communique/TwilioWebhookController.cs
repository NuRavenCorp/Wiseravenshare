using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Wiseravenshare.Server.Entities.Communique;
using Wiseravenshare.Server.Hubs;
using Wiseravenshare.Server.Services.Communique;

namespace Wiseravenshare.Server.Controllers.Communique;

[ApiController]
[Route("api/webhooks/twilio")]
public class TwilioWebhookController : ControllerBase
{
    private readonly ICallStateManager _stateManager;
    private readonly IHubContext<CallHub> _hubContext;
    private readonly ILogger<TwilioWebhookController> _logger;

    public TwilioWebhookController(
        ICallStateManager stateManager,
        IHubContext<CallHub> hubContext,
        ILogger<TwilioWebhookController> logger)
    {
        _stateManager = stateManager;
        _hubContext = hubContext;
        _logger = logger;
    }

    [HttpPost("voice-status")]
    [AllowAnonymous]
    public async Task<IActionResult> VoiceStatus(
        [FromForm] TwilioVoiceStatusRequest request,
        [FromQuery] string? internalCallId)
    {
        if (string.IsNullOrWhiteSpace(internalCallId))
        {
            _logger.LogWarning(
                "Twilio voice status callback missing internalCallId. CallSid={CallSid}, Status={Status}",
                request.CallSid, request.CallStatus);
            return Ok();
        }

        var call = _stateManager.GetActiveCall(internalCallId);
        if (call == null)
        {
            _logger.LogInformation(
                "Twilio voice status callback for unknown/ended call. InternalCallId={InternalCallId}, CallSid={CallSid}, Status={Status}",
                internalCallId, request.CallSid, request.CallStatus);
            return Ok();
        }

        call.ProviderCallId = request.CallSid ?? call.ProviderCallId;
        call.ProviderStatus = request.CallStatus ?? call.ProviderStatus;
        call.Status = MapProviderStatus(request.CallStatus, call.Status);

        await _hubContext.Clients.Group($"user_{call.CallerId}").SendAsync("ExternalCallStatusUpdated", new
        {
            callId         = call.CallId,
            providerCallId = call.ProviderCallId,
            providerStatus = call.ProviderStatus,
            status         = call.Status.ToString()
        });

        if (call.Status is CallStatus.Ended or CallStatus.Rejected or CallStatus.Missed)
        {
            _stateManager.RemoveActiveCall(call.CallId);
            await _hubContext.Clients.Group($"user_{call.CallerId}").SendAsync("CallEnded", call.CallId);
        }

        return Ok();
    }

    private static CallStatus MapProviderStatus(string? providerStatus, CallStatus current) =>
        providerStatus?.ToLowerInvariant() switch
        {
            "queued"      => CallStatus.Initiating,
            "initiated"   => CallStatus.Initiating,
            "ringing"     => CallStatus.Ringing,
            "in-progress" => CallStatus.Connected,
            "completed"   => CallStatus.Ended,
            "busy"        => CallStatus.Rejected,
            "failed"      => CallStatus.Missed,
            "no-answer"   => CallStatus.Missed,
            "canceled"    => CallStatus.Ended,
            _             => current
        };
}

public class TwilioVoiceStatusRequest
{
    public string? CallSid { get; set; }
    public string? CallStatus { get; set; }
    public string? To { get; set; }
    public string? From { get; set; }
}
