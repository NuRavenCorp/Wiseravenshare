using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using WiseRavenShare.Server.Application.Services.Assistant;
using WiseRavenShare.Server.Entities.Assistant;
using WiseRavenShare.Server.Core.Interfaces.Repositories.Assistant;

namespace WiseRavenShare.Server.API.Controllers.Assistant;

[ApiController]
[Route("api/assistant")]
[Authorize]
public class AssistantController : ControllerBase
{
    private readonly IAssistantOrchestrator _orchestrator;
    private readonly ISpeechToTextService _stt;
    private readonly ITextToSpeechService _tts;
    private readonly IAssistantConversationRepository _convRepo;
    private readonly IAssistantMessageRepository _msgRepo;
    private readonly ILogger<AssistantController> _logger;

    public AssistantController(
        IAssistantOrchestrator orchestrator,
        ISpeechToTextService stt,
        ITextToSpeechService tts,
        IAssistantConversationRepository convRepo,
        IAssistantMessageRepository msgRepo,
        ILogger<AssistantController> logger)
    {
        _orchestrator = orchestrator;
        _stt = stt;
        _tts = tts;
        _convRepo = convRepo;
        _msgRepo = msgRepo;
        _logger = logger;
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
    public async Task<IActionResult> List()
    {
        var userId = User.GetUserId();
        var list = await _convRepo.GetByUserAsync(userId);
        return Ok(list);
    }

    [HttpGet("conversations/{id:guid}")]
    public async Task<IActionResult> Get(Guid id)
    {
        var conv = await _convRepo.GetWithMessagesAsync(id);
        if (conv == null) return NotFound();
        return Ok(conv);
    }

    [HttpPost("conversations/{id:guid}/messages")]
    public async Task<IActionResult> Send(Guid id, [FromBody] SendMessageDto dto, CancellationToken ct)
    {
        var userId = User.GetUserId();
        try
        {
            var msg = await _orchestrator.SendAsync(id, userId, dto.Text, dto.IsVoice, ct);
            return Ok(msg);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send message");
            return BadRequest(ex.Message);
        }
    }

    [HttpPost("audio/transcribe")]
    [RequestSizeLimit(25_000_000)]
    public async Task<IActionResult> Transcribe(IFormFile audio, CancellationToken ct)
    {
        if (audio == null || audio.Length == 0)
            return BadRequest("Audio file required");

        using var s = audio.OpenReadStream();
        try
        {
            var result = await _stt.TranscribeAsync(s, audio.ContentType ?? "audio/webm", ct);
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Transcription failed");
            return BadRequest(ex.Message);
        }
    }

    [HttpPost("audio/speak")]
    public async Task<IActionResult> Speak([FromBody] SpeakDto dto, CancellationToken ct)
    {
        try
        {
            var result = await _tts.SynthesizeAsync(dto.Text, dto.VoiceId ?? "alloy", ct);
            return File(result.Audio, result.MimeType);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "TTS failed");
            return BadRequest(ex.Message);
        }
    }

    [HttpPost("messages/{messageId:guid}/feedback")]
    public async Task<IActionResult> Feedback(Guid messageId, [FromBody] FeedbackDto dto)
    {
        var userId = User.GetUserId();
        try
        {
            await _orchestrator.SubmitFeedbackAsync(
                messageId, userId,
                Enum.Parse<FeedbackVote>(dto.Vote),
                dto.Rating, dto.Comment, dto.CorrectedResponse);
            return NoContent();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Feedback submission failed");
            return BadRequest(ex.Message);
        }
    }

    [HttpGet("messages/{messageId:guid}")]
    public async Task<IActionResult> GetMessage(Guid messageId)
    {
        var msg = await _msgRepo.GetByIdAsync(messageId);
        if (msg == null) return NotFound();
        return Ok(msg);
    }
}
