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
        await foreach (var evt in _orchestrator.StreamAsync(conversationId, Context.User!.GetUserId(), text))
        {
            await Clients.Caller.SendAsync("chunk", evt);
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
            await Clients.Caller.SendAsync("chunk", evt);
        }
    }

    private Task<AssistantMessage?> GetLastAssistantMessageAsync(Guid conversationId)
        => Task.FromResult<AssistantMessage?>(null); // wire to repo
}
