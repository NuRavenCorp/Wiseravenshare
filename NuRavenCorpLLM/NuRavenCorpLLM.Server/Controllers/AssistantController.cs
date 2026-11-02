// API/Controllers/Assistant/AssistantController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using NuRavenCorpLLM.Application.Services.Assistant;
using NuRavenCorpLLM.Core.Interfaces.Repositories.Assistant;
using NuRavenCorpLLM.Entities;
using NuRavenCorpLLM.Infrastructure.Security;
using NuRavenCorpLLM.Services;
using System.Net;
using System.Text;
using System.Text.Json;

namespace NuRavenCorpLLM.Controllers;

[ApiController]
[Route("api/assistant")]
[Authorize]
public class AssistantController : ControllerBase
{
    private readonly NuRavenCorpLLM.Application.Services.IAssistantOrchestrator _orchestrator;
    private readonly ISpeechToTextService _stt;
    private readonly ITextToSpeechService _tts;
    private readonly IEmbeddingService _embedding;
    private readonly Core.Interfaces.Repositories.Assistant.IAssistantConversationRepository _convRepo;
    private readonly Core.Interfaces.Repositories.Assistant.IAssistantMessageRepository _msgRepo;

    public AssistantController(
        NuRavenCorpLLM.Application.Services.IAssistantOrchestrator orchestrator,
        ISpeechToTextService stt,
        ITextToSpeechService tts,
        IEmbeddingService embedding,
        Core.Interfaces.Repositories.Assistant.IAssistantConversationRepository convRepo,
        Core.Interfaces.Repositories.Assistant.IAssistantMessageRepository msgRepo)
    {
        _orchestrator = orchestrator;
        _stt = stt;
        _tts = tts;
        _embedding = embedding;
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

    [HttpPost("knowledge/ingest")]
    public async Task<IActionResult> IngestKnowledge([FromBody] IngestKnowledgeDto dto, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(dto.Title) || string.IsNullOrWhiteSpace(dto.Content))
        {
            return BadRequest(new { message = "Title and content are required." });
        }

        var userId = User.GetUserId();
        var content = dto.Content.Trim();
        var knowledge = new AssistantKnowledge
        {
            Title = dto.Title.Trim(),
            Content = content,
            ContentHash = ComputeHash(content),
            Source = string.IsNullOrWhiteSpace(dto.Source) ? "ui_ingestion" : dto.Source.Trim(),
            SourceUrl = string.IsNullOrWhiteSpace(dto.SourceUrl) ? null : dto.SourceUrl.Trim(),
            SourceId = $"ui:{Guid.NewGuid():N}",
            Category = string.IsNullOrWhiteSpace(dto.Category) ? "document" : dto.Category.Trim(),
            Tags = dto.Tags?.Where(t => !string.IsNullOrWhiteSpace(t)).Select(t => t.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).ToArray(),
            IsPublic = true,
            IsApproved = true,
            ApprovedBy = userId == Guid.Empty ? null : userId,
            Metadata = JsonSerializer.SerializeToDocument(new
            {
                channel = "ui.ingestion",
                submittedBy = userId,
                submittedAtUtc = DateTime.UtcNow,
                note = dto.Note
            })
        };

        try
        {
            await _embedding.EmbedAndStoreAsync(knowledge, ct);
        }
        catch (HttpRequestException ex) when (ex.StatusCode == HttpStatusCode.TooManyRequests)
        {
            return StatusCode(StatusCodes.Status429TooManyRequests, new
            {
                message = "OpenAI quota/rate limit reached. Please retry with an active quota-enabled API key."
            });
        }

        return Ok(new
        {
            status = "ingested",
            title = knowledge.Title,
            source = knowledge.Source,
            category = knowledge.Category
        });
    }

    [HttpPost("training/commence")]
    public async Task<IActionResult> CommenceTraining(
        [FromBody] CommenceTrainingDto? dto,
        [FromServices] IFeedbackLearningService feedbackLearningService,
        [FromServices] IChatterLearningService chatterLearningService,
        CancellationToken ct)
    {
        var lookbackDays = Math.Clamp(dto?.LookbackDays ?? 30, 1, 3650);
        var curateBatchSize = Math.Clamp(dto?.CurateBatchSize ?? 100, 1, 5000);

        var feedbackApplied = await feedbackLearningService.ApplyFeedbackToSamplesAsync(ct);
        await chatterLearningService.CurateAndPromoteAsync(curateBatchSize);

        var sinceUtc = DateTime.UtcNow.AddDays(-lookbackDays);
        var dataset = await feedbackLearningService.BuildFineTuneDatasetAsync(sinceUtc, ct);
        var lineCount = CountJsonlRecords(dataset);

        var outputDirectory = ResolveOutputDirectory(dto?.OutputDirectory);
        Directory.CreateDirectory(outputDirectory);
        var fileName = $"nuravencorp-llm-finetune-{DateTime.UtcNow:yyyyMMdd-HHmmss}.jsonl";
        var outputPath = Path.Combine(outputDirectory, fileName);
        await System.IO.File.WriteAllBytesAsync(outputPath, dataset, ct);

        return Ok(new
        {
            status = "training_dataset_ready",
            lookbackDays,
            curateBatchSize,
            feedbackApplied,
            records = lineCount,
            bytes = dataset.Length,
            sinceUtc = sinceUtc.ToString("O"),
            outputPath
        });
    }

    private static int CountJsonlRecords(byte[] payload)
    {
        if (payload.Length == 0)
        {
            return 0;
        }

        var content = Encoding.UTF8.GetString(payload);
        return content
            .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Length;
    }

    private static string ResolveOutputDirectory(string? configured)
    {
        if (!string.IsNullOrWhiteSpace(configured))
        {
            return Path.IsPathRooted(configured)
                ? configured
                : Path.Combine(AppContext.BaseDirectory, configured);
        }

        return Path.Combine(AppContext.BaseDirectory, "App_Data", "training");
    }

    private static string ComputeHash(string value)
    {
        using var sha = System.Security.Cryptography.SHA256.Create();
        return Convert.ToHexString(sha.ComputeHash(Encoding.UTF8.GetBytes(value)));
    }

    public record CreateConversationDto(string? Title, string? Persona);
    public record SendMessageDto(string Text, bool IsVoice = false);
    public record SpeakDto(string Text, string? VoiceId);
    public record FeedbackDto(string Vote, int? Rating, string? Comment, string? CorrectedResponse);
    public record IngestKnowledgeDto(
        string Title,
        string Content,
        string? Source,
        string? SourceUrl,
        string? Category,
        string[]? Tags,
        string? Note);
    public record CommenceTrainingDto(int LookbackDays = 30, int CurateBatchSize = 100, string? OutputDirectory = null);
}