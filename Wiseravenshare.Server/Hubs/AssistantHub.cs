using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using WiseRavenShare.Server.Application.Services.Assistant;

namespace WiseRavenShare.Server.API.Hubs;

[Authorize]
public class AssistantHub : Hub
{
    private readonly IAssistantOrchestrator _orchestrator;
    private readonly ISpeechToTextService _stt;
    private readonly ITextToSpeechService _tts;
    private readonly ILogger<AssistantHub> _logger;

    public AssistantHub(
        IAssistantOrchestrator orchestrator,
        ISpeechToTextService stt,
        ITextToSpeechService tts,
        ILogger<AssistantHub> logger)
    {
        _orchestrator = orchestrator;
        _stt = stt;
        _tts = tts;
        _logger = logger;
    }

    public async Task SendText(Guid conversationId, string text, bool voiceReply, CancellationToken ct = default)
    {
        try
        {
            var userId = Context.User!.GetUserId();
            await foreach (var evt in _orchestrator.StreamAsync(conversationId, userId, text, false, ct))
            {
                await Clients.Caller.SendAsync("chunk", evt, cancellationToken: ct);
            }

            if (voiceReply)
            {
                var msg = await _orchestrator.SendAsync(conversationId, userId, text, false, ct);
                if (msg != null && !string.IsNullOrEmpty(msg.Content))
                {
                    try
                    {
                        var ttsResult = await _tts.SynthesizeAsync(msg.Content, "alloy", ct);
                        var b64 = Convert.ToBase64String(ttsResult.Audio);
                        await Clients.Caller.SendAsync("audio", b64, ttsResult.MimeType, cancellationToken: ct);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "TTS failed");
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "SendText failed");
            await Clients.Caller.SendAsync("error", ex.Message);
        }
    }

    public async Task SendAudio(Guid conversationId, string base64Audio, string mimeType, CancellationToken ct = default)
    {
        try
        {
            using var ms = new MemoryStream(Convert.FromBase64String(base64Audio));
            var sttResult = await _stt.TranscribeAsync(ms, mimeType, ct);
            
            var userId = Context.User!.GetUserId();
            await Clients.Caller.SendAsync("transcript", sttResult.Text, cancellationToken: ct);

            await foreach (var evt in _orchestrator.StreamAsync(conversationId, userId, sttResult.Text, true, ct))
            {
                await Clients.Caller.SendAsync("chunk", evt, cancellationToken: ct);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "SendAudio failed");
            await Clients.Caller.SendAsync("error", ex.Message);
        }
    }
}
