// Application/Services/Craft/CraftRetriever.cs
using Microsoft.Extensions.Caching.Memory;
using NuRavenCorpLLM.Application.Services.Assistant;
using NuRavenCorpLLM.Infrastructure.Vector;

namespace NuRavenCorpLLM.Application.Services.Craft;

public interface ICraftRetriever
{
    Task<IReadOnlyList<CraftPrincipleHit>> RetrievePrinciplesAsync(
        string domain, string query, int topK = 5, CancellationToken ct = default);

    Task<IReadOnlyList<CraftInsightHit>> RetrieveInsightsAsync(
        string query, int topK = 5, CancellationToken ct = default);
}

public record CraftPrincipleHit(Guid Id, string Title, string Body, string Kind, int Importance, double Score);
public record CraftInsightHit(Guid Id, string Title, string Content, string Source, double Score);

public class CraftRetriever : ICraftRetriever
{
    private readonly IEmbeddingService _embed;
    private readonly IPgVectorStore _vector;
    private readonly IMemoryCache _cache;

    public CraftRetriever(IEmbeddingService embed, IPgVectorStore vector, IMemoryCache cache)
    {
        _embed = embed; _vector = vector; _cache = cache;
    }

    public async Task<IReadOnlyList<CraftPrincipleHit>> RetrievePrinciplesAsync(
        string domain, string query, int topK = 5, CancellationToken ct = default)
    {
        var key = $"craft_principles:{domain}:{query.GetHashCode()}:{topK}";
        if (_cache.TryGetValue(key, out IReadOnlyList<CraftPrincipleHit>? cached)) return cached!;

        var embedding = await _embed.EmbedAsync(query, ct);
        var hits = await _vector.SearchCraftPrinciplesAsync(embedding, domain, topK, ct);
        _cache.Set(key, hits, TimeSpan.FromMinutes(10));
        return (IReadOnlyList<CraftPrincipleHit>)hits;
    }

    public async Task<IReadOnlyList<CraftInsightHit>> RetrieveInsightsAsync(
        string query, int topK = 5, CancellationToken ct = default)
    {
        var embedding = await _embed.EmbedAsync(query, ct);
        return (IReadOnlyList<CraftInsightHit>)await _vector.SearchCraftInsightsAsync(embedding, topK, ct);
    }
}