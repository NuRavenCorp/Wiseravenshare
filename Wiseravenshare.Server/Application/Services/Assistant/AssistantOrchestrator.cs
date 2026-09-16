using System.Diagnostics;
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using WiseRavenShare.Server.Entities.Assistant;
using WiseRavenShare.Server.Core.Interfaces.Repositories.Assistant;

namespace WiseRavenShare.Server.Application.Services.Assistant;

public interface IAssistantOrchestrator
{
    Task<AssistantConversation> CreateConversationAsync(
        Guid userId, string? title = null, AssistantPersona persona = AssistantPersona.Default);

    Task<AssistantMessage> SendAsync(
        Guid conversationId, Guid userId, string userText,
        bool isVoice = false, CancellationToken ct = default);

    IAsyncEnumerable<AssistantStreamEvent> StreamAsync(
        Guid conversationId, Guid userId, string userText,
        bool isVoice = false, CancellationToken ct = default);

    Task SubmitFeedbackAsync(Guid messageId, Guid userId, FeedbackVote vote,
        int? rating, string? comment, string? corrected);
}

public class AssistantOptions
{
    public string DefaultSystemPrompt { get; set; } = @"
You are WiseRaven, the in-app AI assistant for WiseRavenShare.

Core behavior:
- Be accurate, cite sources when using retrieved knowledge.
- Prefer concise answers; expand only if the user asks.
- Never invent facts. If unsure, say so and offer to search the web.
- Respect user privacy; never reveal other users' private data.
- Use the WiseRavenShare platform context when relevant.
";
    public int MaxHistoryMessages { get; set; } = 20;
    public int RagTopK { get; set; } = 6;
    public double RagMinScore { get; set; } = 0.35;
    public bool EnableWebGrounding { get; set; } = true;
    public bool EnableLearning { get; set; } = true;
}

public class AssistantOrchestrator : IAssistantOrchestrator
{
    private readonly IAssistantConversationRepository _convRepo;
    private readonly IAssistantMessageRepository _msgRepo;
    private readonly IAssistantFeedbackRepository _fbRepo;
    private readonly ILlmGateway _llm;
    private readonly IRagRetriever _rag;
    private readonly IWebGroundingService _web;
    private readonly IChatterLearningService _learning;
    private readonly IAssistantSafetyService _safety;
    private readonly IAssistantPersonaService _persona;
    private readonly PromptBuilder _promptBuilder;
    private readonly AssistantOptions _opts;
    private readonly ILogger<AssistantOrchestrator> _logger;

    public AssistantOrchestrator(
        IAssistantConversationRepository convRepo,
        IAssistantMessageRepository msgRepo,
        IAssistantFeedbackRepository fbRepo,
        ILlmGateway llm,
        IRagRetriever rag,
        IWebGroundingService web,
        IChatterLearningService learning,
        IAssistantSafetyService safety,
        IAssistantPersonaService persona,
        PromptBuilder promptBuilder,
        IOptions<AssistantOptions> opts,
        ILogger<AssistantOrchestrator> logger)
    {
        _convRepo = convRepo;
        _msgRepo = msgRepo;
        _fbRepo = fbRepo;
        _llm = llm;
        _rag = rag;
        _web = web;
        _learning = learning;
        _safety = safety;
        _persona = persona;
        _promptBuilder = promptBuilder;
        _opts = opts.Value;
        _logger = logger;
    }

    public async Task<AssistantConversation> CreateConversationAsync(
        Guid userId, string? title, AssistantPersona persona)
    {
        var conv = new AssistantConversation
        {
            UserId = userId,
            Title = title ?? "New conversation",
            Persona = persona,
            LastMessageAt = DateTime.UtcNow
        };
        await _convRepo.AddAsync(conv);
        return conv;
    }

    public async Task<AssistantMessage> SendAsync(
        Guid conversationId, Guid userId, string userText,
        bool isVoice = false, CancellationToken ct = default)
    {
        var conv = await _convRepo.GetWithMessagesAsync(conversationId)
                   ?? throw new Exception("Conversation not found");

        var userMsg = new AssistantMessage
        {
            ConversationId = conversationId,
            UserId = userId,
            Role = AssistantRole.User,
            Content = userText,
            Transcript = isVoice ? userText : null,
            Status = AssistantMessageStatus.Complete
        };
        await _msgRepo.AddAsync(userMsg);

        if (!await _safety.IsSafeAsync(userText, ct))
        {
            return await SaveBlockedAsync(conversationId, userId);
        }

        var ragHits = await _rag.RetrieveAsync(userText, _opts.RagTopK, _opts.RagMinScore, ct);
        var webSnippets = Array.Empty<WebSnippet>();
        if (_opts.EnableWebGrounding && _persona.RequiresWebGrounding(conv.Persona, userText))
        {
            webSnippets = await _web.SearchAsync(userText, 3, ct);
        }

        var history = conv.Messages
            .OrderByDescending(m => m.CreatedAt)
            .Take(_opts.MaxHistoryMessages)
            .Reverse()
            .Select(m => new LlmMessage(m.Role.ToString().ToLowerInvariant(), m.Content))
            .ToList();

        var systemPrompt = _persona.BuildSystemPrompt(conv.Persona, _opts.DefaultSystemPrompt);
        var groundedContext = _promptBuilder.BuildContext(ragHits, webSnippets);
        if (!string.IsNullOrEmpty(groundedContext))
        {
            systemPrompt += "\n\n" + groundedContext;
        }

        var request = new LlmRequest
        {
            SystemPrompt = systemPrompt,
            Messages = new[] { new LlmMessage("system", systemPrompt) }.Concat(history).ToList(),
            Temperature = _persona.GetTemperature(conv.Persona),
            MaxTokens = 1500
        };

        var sw = Stopwatch.StartNew();
        var response = await _llm.CompleteAsync(request, ct);
        sw.Stop();

        var assistantMsg = new AssistantMessage
        {
            ConversationId = conversationId,
            Role = AssistantRole.Assistant,
            Content = response.Content,
            LatencyMs = (int)sw.ElapsedMilliseconds,
            PromptTokens = response.PromptTokens,
            CompletionTokens = response.CompletionTokens,
            Citations = JsonSerializer.SerializeToDocument(new
            {
                rag = ragHits.Select(h => new { h.Id, h.Title, h.Source, h.SourceUrl, h.Score }),
                web = webSnippets.Select(s => new { s.Title, s.Url, s.Snippet })
            }),
            Status = AssistantMessageStatus.Complete
        };
        await _msgRepo.AddAsync(assistantMsg);

        conv.MessageCount += 2;
        conv.LastMessageAt = DateTime.UtcNow;
        conv.TokenUsage += response.PromptTokens + response.CompletionTokens;
        await _convRepo.UpdateAsync(conv);

        if (_opts.EnableLearning)
        {
            _ = Task.Run(() => _learning.ObserveAsync(conv, userMsg, assistantMsg, ragHits, webSnippets));
        }

        return assistantMsg;
    }

    public async IAsyncEnumerable<AssistantStreamEvent> StreamAsync(
        Guid conversationId, Guid userId, string userText,
        bool isVoice = false,
        [EnumeratorCancellation] CancellationToken ct = default)
    {
        var conv = await _convRepo.GetWithMessagesAsync(conversationId)
                   ?? throw new Exception("Conversation not found");

        var userMsg = new AssistantMessage
        {
            ConversationId = conversationId,
            UserId = userId,
            Role = AssistantRole.User,
            Content = userText,
            Status = AssistantMessageStatus.Complete
        };
        await _msgRepo.AddAsync(userMsg);

        if (!await _safety.IsSafeAsync(userText, ct))
        {
            yield return new AssistantStreamEvent("blocked", null, null, "Content blocked");
            yield break;
        }

        yield return new AssistantStreamEvent("user_ack", null, userMsg, null);

        var ragHits = await _rag.RetrieveAsync(userText, _opts.RagTopK, _opts.RagMinScore, ct);
        var webSnippets = _opts.EnableWebGrounding
            ? await _web.SearchAsync(userText, 3, ct)
            : Array.Empty<WebSnippet>();

        var history = conv.Messages
            .OrderByDescending(m => m.CreatedAt)
            .Take(_opts.MaxHistoryMessages)
            .Reverse()
            .Select(m => new LlmMessage(m.Role.ToString().ToLowerInvariant(), m.Content))
            .ToList();

        var systemPrompt = _persona.BuildSystemPrompt(conv.Persona, _opts.DefaultSystemPrompt);
        var groundedContext = _promptBuilder.BuildContext(ragHits, webSnippets);
        if (!string.IsNullOrEmpty(groundedContext))
            systemPrompt += "\n\n" + groundedContext;

        var request = new LlmRequest
        {
            SystemPrompt = systemPrompt,
            Messages = new[] { new LlmMessage("system", systemPrompt) }.Concat(history).ToList(),
            Temperature = _persona.GetTemperature(conv.Persona)
        };

        var sb = new StringBuilder();
        var sw = Stopwatch.StartNew();
        int promptTokens = 0, completionTokens = 0;

        await foreach (var chunk in _llm.StreamAsync(request, ct))
        {
            if (chunk.Done)
            {
                promptTokens = chunk.PromptTokens ?? 0;
                completionTokens = chunk.CompletionTokens ?? 0;
                break;
            }
            if (chunk.Delta != null)
            {
                sb.Append(chunk.Delta);
                yield return new AssistantStreamEvent("delta", chunk.Delta, null, null);
            }
        }
        sw.Stop();

        var assistantMsg = new AssistantMessage
        {
            ConversationId = conversationId,
            Role = AssistantRole.Assistant,
            Content = sb.ToString(),
            LatencyMs = (int)sw.ElapsedMilliseconds,
            PromptTokens = promptTokens,
            CompletionTokens = completionTokens,
            Citations = JsonSerializer.SerializeToDocument(new
            {
                rag = ragHits.Select(h => new { h.Id, h.Title, h.Source, h.SourceUrl, h.Score }),
                web = webSnippets.Select(s => new { s.Title, s.Url, s.Snippet })
            }),
            Status = AssistantMessageStatus.Complete
        };
        await _msgRepo.AddAsync(assistantMsg);

        conv.MessageCount += 2;
        conv.LastMessageAt = DateTime.UtcNow;
        conv.TokenUsage += promptTokens + completionTokens;
        await _convRepo.UpdateAsync(conv);

        if (_opts.EnableLearning)
        {
            _ = Task.Run(() => _learning.ObserveAsync(conv, userMsg, assistantMsg, ragHits, webSnippets));
        }

        yield return new AssistantStreamEvent("done", null, assistantMsg, null);
    }

    public async Task SubmitFeedbackAsync(Guid messageId, Guid userId,
        FeedbackVote vote, int? rating, string? comment, string? corrected)
    {
        var fb = new AssistantFeedback
        {
            MessageId = messageId,
            UserId = userId,
            Vote = vote,
            Rating = rating,
            Comment = comment,
            CorrectedResponse = corrected
        };
        await _fbRepo.AddAsync(fb);
    }

    private async Task<AssistantMessage> SaveBlockedAsync(Guid conversationId, Guid userId)
    {
        var msg = new AssistantMessage
        {
            ConversationId = conversationId,
            Role = AssistantRole.Assistant,
            Content = "I can't help with that request. Please ask something else.",
            Status = AssistantMessageStatus.Blocked
        };
        await _msgRepo.AddAsync(msg);
        return msg;
    }
}
