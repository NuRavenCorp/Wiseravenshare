// Application/Services/Assistant/RagRetriever.cs
using Microsoft.Extensions.Caching.Memory;
using NuRavenCorpLLM.Infrastructure.Vector;

namespace NuRavenCorpLLM.Application.Services.Assistant;

public interface IRagRetriever
{
    Task<IReadOnlyList<RagHit>> RetrieveAsync(string query, int topK, double minScore, CancellationToken ct = default);
}

public class RagRetriever : IRagRetriever
{
    private readonly IEmbeddingService _embeddings;
    private readonly IPgVectorStore _store;
    private readonly IMemoryCache _cache;

    public RagRetriever(IEmbeddingService embeddings, IPgVectorStore store, IMemoryCache cache)
    {
        _embeddings = embeddings; _store = store; _cache = cache;
    }

    public async Task<IReadOnlyList<RagHit>> RetrieveAsync(
        string query, int topK, double minScore, CancellationToken ct = default)
    {
        var key = $"rag:{query.GetHashCode()}:{topK}";
        if (_cache.TryGetValue(key, out IReadOnlyList<RagHit>? cached)) return cached!;

        var embedding = await _embeddings.EmbedAsync(query, ct);
        var hits = (await _store.SimilaritySearchAsync(embedding, topK, minScore, ct)).ToList();

        _cache.Set(key, hits, TimeSpan.FromMinutes(5));
        return hits;
    }
}