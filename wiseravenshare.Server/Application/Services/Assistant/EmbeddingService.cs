using WiseRavenShare.Server.Entities.Assistant;
using WiseRavenShare.Server.Core.Interfaces.Repositories.Assistant;
using WiseRavenShare.Server.Infrastructure.Vector;

namespace WiseRavenShare.Server.Application.Services.Assistant;

public interface IEmbeddingService
{
    Task<float[]> EmbedAsync(string text, CancellationToken ct = default);
    Task EmbedAndStoreAsync(Entities.Assistant.AssistantKnowledge item, CancellationToken ct = default);
}

public class EmbeddingService : IEmbeddingService
{
    private readonly ILlmGateway _llm;
    private readonly IPgVectorStore _store;
    private readonly IAssistantKnowledgeRepository _repo;
    private readonly ILogger<EmbeddingService> _logger;

    public EmbeddingService(
        ILlmGateway llm,
        IPgVectorStore store,
        IAssistantKnowledgeRepository repo,
        ILogger<EmbeddingService> logger)
    {
        _llm = llm;
        _store = store;
        _repo = repo;
        _logger = logger;
    }

    public Task<float[]> EmbedAsync(string text, CancellationToken ct = default)
        => _llm.EmbedAsync(text, ct);

    public async Task EmbedAndStoreAsync(Entities.Assistant.AssistantKnowledge item, CancellationToken ct = default)
    {
        var chunks = ChunkingStrategy.Chunk(item.Content, maxTokens: 400, overlap: 50);
        foreach (var chunk in chunks)
        {
            try
            {
                var embedding = await _llm.EmbedAsync(chunk, ct);
                var chunkItem = new Entities.Assistant.AssistantKnowledge
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
                    TokenCount = ChunkingStrategy.EstimateTokens(chunk),
                    IsPublic = item.IsPublic,
                    IsApproved = item.IsApproved
                };
                await _repo.AddAsync(chunkItem);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to embed chunk");
            }
        }
    }

    private static string Hash(string s)
    {
        using var sha = System.Security.Cryptography.SHA256.Create();
        return Convert.ToHexString(sha.ComputeHash(System.Text.Encoding.UTF8.GetBytes(s)));
    }
}

public static class ChunkingStrategy
{
    public static List<string> Chunk(string text, int maxTokens, int overlap)
    {
        if (string.IsNullOrWhiteSpace(text)) return new();
        var words = text.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var chunks = new List<string>();
        int stride = Math.Max(1, maxTokens - overlap);
        for (int i = 0; i < words.Length; i += stride)
        {
            var slice = words.Skip(i).Take(maxTokens).ToArray();
            if (slice.Length == 0) break;
            chunks.Add(string.Join(' ', slice));
        }
        return chunks;
    }

    public static int EstimateTokens(string text)
        => (int)Math.Ceiling(text.Length / 4.0);
}
