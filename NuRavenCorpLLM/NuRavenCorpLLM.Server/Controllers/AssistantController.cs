// API/Controllers/Assistant/AssistantController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using NuRavenCorpLLM.Application.Services.Assistant;
using NuRavenCorpLLM.Core.Interfaces.Repositories.Assistant;
using NuRavenCorpLLM.Entities;
using NuRavenCorpLLM.Infrastructure.Security;

namespace NuRavenCorpLLM.Controllers;

[ApiController]
[Route("api/assistant")]
[Authorize]
public class AssistantController : ControllerBase
{
    private readonly NuRavenCorpLLM.Application.Services.IAssistantOrchestrator _orchestrator;
    private readonly ISpeechToTextService _stt;
    private readonly ITextToSpeechService _tts;
    private readonly Core.Interfaces.Repositories.Assistant.IAssistantConversationRepository _convRepo;
    private readonly Core.Interfaces.Repositories.Assistant.IAssistantMessageRepository _msgRepo;

    public AssistantController(
        NuRavenCorpLLM.Application.Services.IAssistantOrchestrator orchestrator,
        ISpeechToTextService stt,
        ITextToSpeechService tts,
        Core.Interfaces.Repositories.Assistant.IAssistantConversationRepository convRepo,
        Core.Interfaces.Repositories.Assistant.IAssistantMessageRepository msgRepo)
    {
        _orchestrator = orchestrator;
        _stt = stt;
        _tts = tts;
        _convRepo = convRepo;
        _msgRepo = msgRepo;
    }

    [HttpPost("conversations")]
    public async Task<IActionResult> Create([FromBody] CreateConversationDto dto)
    {
        var userId = User.GetUserId();
        var conv = await _orchestrator.CreateConversationAsync(
            userId,
            dto.Title,
            Enum.TryParse<AssistantPersona>(dto.Persona, true, out var p) ? p : AssistantPersona.Default);
        return Ok(conv);
    }

    [HttpGet("conversations")]
    public async Task<IActionResult> List() =>
        Ok(await _convRepo.GetByUserAsync(User.GetUserId()));

    [HttpGet("conversations/{id:guid}")]
    public async Task<IActionResult> Get(Guid id) =>
        Ok(await _convRepo.GetWithMessagesAsync(id));

    [HttpPost("conversations/{id:guid}/messages")]
    public async Task<IActionResult> Send(Guid id, [FromBody] SendMessageDto dto)
    {
        var userId = User.GetUserId();
        var msg = await _orchestrator.SendAsync(id, userId, dto.Text, dto.IsVoice);
        return Ok(msg);
    }

    [HttpPost("audio/transcribe")]
    [RequestSizeLimit(25_000_000)]
    public async Task<IActionResult> Transcribe(IFormFile audio)
    {
        using var s = audio.OpenReadStream();
        var result = await _stt.TranscribeAsync(s, audio.ContentType);
        return Ok(result);
    }

    [HttpPost("audio/speak")]
    public async Task<IActionResult> Speak([FromBody] SpeakDto dto)
    {
        var result = await _tts.SynthesizeAsync(dto.Text, dto.VoiceId ?? "alloy");
        return File(result.Audio, result.MimeType);
    }

    [HttpPost("messages/{messageId:guid}/feedback")]
    public async Task<IActionResult> Feedback(Guid messageId, [FromBody] FeedbackDto dto)
    {
        await _orchestrator.SubmitFeedbackAsync(
            messageId, User.GetUserId(),
            Enum.Parse<FeedbackVote>(dto.Vote),
            dto.Rating, dto.Comment, dto.CorrectedResponse);
        return NoContent();
    }

    [HttpGet("messages/{messageId:guid}")]
    public async Task<IActionResult> GetMessage(Guid messageId) =>
        Ok(await _msgRepo.GetByIdAsync(messageId));

    public record CreateConversationDto(string? Title, string? Persona);
    public record SendMessageDto(string Text, bool IsVoice = false);
    public record SpeakDto(string Text, string? VoiceId);
    public record FeedbackDto(string Vote, int? Rating, string? Comment, string? CorrectedResponse);
}