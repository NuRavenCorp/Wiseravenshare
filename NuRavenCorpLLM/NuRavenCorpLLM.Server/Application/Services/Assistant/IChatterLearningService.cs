// Application/Services/Assistant/ChatterLearningService.cs
using System.Text.Json;
using NuRavenCorpLLM.Core.Interfaces.Repositories.Assistant;
using NuRavenCorpLLM.Entities;
using NuRavenCorpLLM.Infrastructure.Vector;

namespace NuRavenCorpLLM.Application.Services.Assistant;

public interface IChatterLearningService
{
    Task ObserveAsync(
        AssistantConversation conversation,
        AssistantMessage userMsg,
        AssistantMessage assistantMsg,
        IReadOnlyList<RagHit> ragHits,
        IReadOnlyList<WebSnippet> webSnippets);

    Task ObservePlatformChatterAsync(
        Guid userId, string text, string? context = null, Guid? sourceId = null);

    Task CurateAndPromoteAsync(int batchSize = 50);
}

public class ChatterLearningService : IChatterLearningService
{
    private readonly IAssistantLearningSampleRepository _samples;
    private readonly IAssistantKnowledgeRepository _knowledge;
    private readonly IEmbeddingService _embedding;
    private readonly IAssistantSafetyService _safety;
    private readonly ILogger<ChatterLearningService> _logger;

    private const int MaxSampleLength = 4000;

    public ChatterLearningService(
        IAssistantLearningSampleRepository samples,
        IAssistantKnowledgeRepository knowledge,
        IEmbeddingService embedding,
        IAssistantSafetyService safety,
        ILogger<ChatterLearningService> logger)
    {
        _samples = samples;
        _knowledge = knowledge;
        _embedding = embedding;
        _safety = safety;
        _logger = logger;
    }

    public async Task ObserveAsync(
        AssistantConversation conversation,
        AssistantMessage userMsg,
        AssistantMessage assistantMsg,
        IReadOnlyList<RagHit> ragHits,
        IReadOnlyList<WebSnippet> webSnippets)
    {
        try
        {
            if (userMsg.Content.Length > MaxSampleLength || assistantMsg.Content.Length > MaxSampleLength)
                return;

            if (!await _safety.IsSafeForTrainingAsync(userMsg.Content, assistantMsg.Content))
                return;

            var sample = new AssistantLearningSample
            {
                Source = LearningSampleSource.UserFeedback,
                Status = LearningSampleStatus.Pending,
                UserPrompt = userMsg.Content,
                AssistantResponse = assistantMsg.Content,
                Context = BuildContext(ragHits, webSnippets),
                ConversationId = conversation.Id,
                MessageId = assistantMsg.Id,
                SourceUserId = userMsg.UserId,
                ContentHash = Hash($"{userMsg.Content}|{assistantMsg.Content}"),
                Metadata = JsonSerializer.SerializeToDocument(new
                {
                    persona = conversation.Persona.ToString(),
                    ragUsed = ragHits.Count,
                    webUsed = webSnippets.Count,
                    latencyMs = assistantMsg.LatencyMs
                })
            };
            await _samples.AddAsync(sample);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to record learning sample");
        }
    }

    public async Task ObservePlatformChatterAsync(
        Guid userId, string text, string? context, Guid? sourceId)
    {
        if (string.IsNullOrWhiteSpace(text) || text.Length > MaxSampleLength) return;
        if (!await _safety.IsSafeForTrainingAsync(text)) return;

        var sample = new AssistantLearningSample
        {
            Source = LearningSampleSource.ChatterObservation,
            Status = LearningSampleStatus.Pending,
            UserPrompt = text,
            Context = context,
            SourceUserId = userId,
            ContentHash = Hash(text),
            Metadata = sourceId.HasValue
                ? JsonSerializer.SerializeToDocument(new { sourceId = sourceId.Value })
                : null
        };
        await _samples.AddAsync(sample);
    }

    public async Task CurateAndPromoteAsync(int batchSize = 50)
    {
        // Promote high-quality samples into the knowledge base for RAG
        var pending = await _samples.GetPendingAsync(batchSize);
        foreach (var s in pending)
        {
            if (await _safety.IsSafeForTrainingAsync(s.UserPrompt, s.AssistantResponse ?? ""))
            {
                var knowledge = new AssistantKnowledge
                {
                    Title = s.UserPrompt.Length > 80 ? s.UserPrompt[..80] : s.UserPrompt,
                    Content = s.IdealResponse ?? s.AssistantResponse ?? "",
                    Source = s.Source == LearningSampleSource.ChatterObservation ? "chatter" : "feedback",
                    SourceId = s.MessageId?.ToString() ?? s.Id.ToString(),
                    Category = "learned",
                    IsPublic = false,       // admin-approved items become public
                    IsApproved = false
                };
                await _embedding.EmbedAndStoreAsync(knowledge);
                s.Status = LearningSampleStatus.Approved;
                await _samples.UpdateAsync(s);
            }
            else
            {
                s.Status = LearningSampleStatus.Rejected;
                await _samples.UpdateAsync(s);
            }
        }
    }

    private static string? BuildContext(IReadOnlyList<RagHit> rag, IReadOnlyList<WebSnippet> web)
    {
        var parts = new List<string>();
        if (rag.Count > 0)
            parts.Add("[RAG]\n" + string.Join("\n---\n", rag.Select(r => $"{r.Title}: {r.Content}")));
        if (web.Count > 0)
            parts.Add("[WEB]\n" + string.Join("\n---\n", web.Select(w => $"{w.Title} ({w.Url}): {w.Snippet}")));
        return parts.Count > 0 ? string.Join("\n\n", parts) : null;
    }

    private static string Hash(string s)
    {
        using var sha = System.Security.Cryptography.SHA256.Create();
        return Convert.ToHexString(sha.ComputeHash(System.Text.Encoding.UTF8.GetBytes(s)));
    }
}