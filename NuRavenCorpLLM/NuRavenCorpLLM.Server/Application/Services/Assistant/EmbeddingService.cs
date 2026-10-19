// Application/Services/Assistant/EmbeddingService.cs
using NuRavenCorpLLM.Application.Algtorithms;
using NuRavenCorpLLM.Core.Interfaces.Repositories.Assistant;
using NuRavenCorpLLM.Entities;
using NuRavenCorpLLM.Infrastructure.Vector;
using NuRavenCorpLLM.Services;

namespace NuRavenCorpLLM.Application.Services.Assistant;

public interface IEmbeddingService
{
    Task<float[]> EmbedAsync(string text, CancellationToken ct = default);
    Task EmbedAndStoreAsync(AssistantKnowledge item, CancellationToken ct = default);
}

public class EmbeddingService : IEmbeddingService
{
    private readonly ILlmGateway _llm;
    private readonly IPgVectorStore _store;
    private readonly IAssistantKnowledgeRepository _repo;

    public EmbeddingService(ILlmGateway llm, IPgVectorStore store, IAssistantKnowledgeRepository repo)
    {
        _llm = llm; _store = store; _repo = repo;
    }

    public Task<float[]> EmbedAsync(string text, CancellationToken ct = default)
        => _llm.EmbedAsync(text, ct);

    public async Task EmbedAndStoreAsync(AssistantKnowledge item, CancellationToken ct = default)
    {
        var chunks = ChunkingStrategy.Chunk(item.Content, maxTokens: 400, overlap: 50);
        foreach (var chunk in chunks)
        {
            var embedding = await _llm.EmbedAsync(chunk, ct);
            var chunkItem = new AssistantKnowledge
            {
                Title = item.Title,
                Content = chunk,
                ContentHash = Hash(chunk),
                Source = item.Source,
                SourceUrl = item.SourceUrl,
                SourceId = item.SourceId,
                Category = item.Category,
                Tags = item.Tags,
                Embedding = embedding,
                TokenCount = ChunkingStrategy.EstimateTokens(chunk)
            };
            await _repo.AddAsync(chunkItem);
        }
    }

    private static string Hash(string s)
    {
        using var sha = System.Security.Cryptography.SHA256.Create();
        return Convert.ToHexString(sha.ComputeHash(System.Text.Encoding.UTF8.GetBytes(s)));
    }
}