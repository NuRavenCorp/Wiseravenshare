// API/Hubs/AssistantHub.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using NuRavenCorpLLM.Application.Services;
using NuRavenCorpLLM.Application.Services.Assistant;
using NuRavenCorpLLM.Entities;
using NuRavenCorpLLM.Infrastructure.Security;

namespace NuRavenCorpLLM.Hubs;

[Authorize]
public class AssistantHub : Hub
{
    private readonly NuRavenCorpLLM.Application.Services.IAssistantOrchestrator _orchestrator;
    private readonly ISpeechToTextService _stt;
    private readonly ITextToSpeechService _tts;
    private readonly ILogger<AssistantHub> _logger;

    public AssistantHub(
        NuRavenCorpLLM.Application.Services.IAssistantOrchestrator orchestrator,
        ISpeechToTextService stt,
        ITextToSpeechService tts,
        ILogger<AssistantHub> logger)
    {
        _orchestrator = orchestrator;
        _stt = stt;
        _tts = tts;
        _logger = logger;
    }

    public async Task SendText(Guid conversationId, string text, bool voiceReply)
    {
        try
        {
            await foreach (var evt in _orchestrator.StreamAsync(conversationId, Context.User!.GetUserId(), text))
            {
                await Clients.Caller.SendAsync("chunk", ToHubEvent(evt));
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Assistant stream failed for conversation {ConversationId}", conversationId);
            await Clients.Caller.SendAsync("chunk", new { type = "error", error = ex.Message });
            return;
        }

        if (voiceReply)
        {
            var last = await GetLastAssistantMessageAsync(conversationId);
            if (last != null)
            {
                var ttsResult = await _tts.SynthesizeAsync(last.Content, "alloy");
                await Clients.Caller.SendAsync("audio", Convert.ToBase64String(ttsResult.Audio), ttsResult.MimeType);
            }
        }
    }

    public async Task SendAudio(Guid conversationId, string base64Audio, string mimeType)
    {
        using var ms = new MemoryStream(Convert.FromBase64String(base64Audio));
        var stt = await _stt.TranscribeAsync(ms, mimeType);
        await Clients.Caller.SendAsync("transcript", stt.Text);

        await foreach (var evt in _orchestrator.StreamAsync(conversationId, Context.User!.GetUserId(), stt.Text, true))
        {
            await Clients.Caller.SendAsync("chunk", ToHubEvent(evt));
        }
    }

    private static object ToHubEvent(AssistantStreamEvent evt)
    {
        if (evt.Message is null)
        {
            return new { type = evt.Type, delta = evt.Delta, message = (object?)null, error = evt.Error };
        }

        return new
        {
            type = evt.Type,
            delta = evt.Delta,
            error = evt.Error,
            message = new
            {
                evt.Message.Id,
                evt.Message.ConversationId,
                evt.Message.UserId,
                role = evt.Message.Role.ToString(),
                evt.Message.Content,
                evt.Message.AudioUrl,
                evt.Message.AudioDurationMs,
                evt.Message.Transcript,
                evt.Message.PromptTokens,
                evt.Message.CompletionTokens,
                evt.Message.LatencyMs,
                evt.Message.Status,
                evt.Message.CreatedAt
            }
        };
    }

    private Task<AssistantMessage?> GetLastAssistantMessageAsync(Guid conversationId)
        => Task.FromResult<AssistantMessage?>(null); // wire to repo
}
