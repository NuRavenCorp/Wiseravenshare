using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using Wiseravenshare.Server.Interfaces.Repositories;

namespace Wiseravenshare.Server.Services.Truth;

public class TruthFact
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Claim { get; set; } = string.Empty;
    public string NormalizedClaim { get; set; } = string.Empty;
    public bool IsTrue { get; set; }
    public decimal Confidence { get; set; } = 0.50m;
    public string? Explanation { get; set; }
    public string Category { get; set; } = "General";
    public List<string> Sources { get; set; } = new();
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ExpiresAt { get; set; }
    public bool IsDeleted { get; set; }
}

public interface IKnowledgeBaseService
{
    Task<TruthFact?> FindFactAsync(string normalizedClaim);
    Task<IEnumerable<TruthFact>> FindSimilarClaimsAsync(string normalizedClaim);
    Task AddFactAsync(TruthFact fact);
    Task UpdateFactAsync(TruthFact fact);
    Task<IEnumerable<TruthFact>> GetRecentFactsAsync(int count);
    Task<IDictionary<string, decimal>> GetCategoryStatsAsync();
    Task<IEnumerable<TruthFact>> GetUnverifiedFactsAsync(int count);
    Task<bool> IsFactExpiredAsync(TruthFact fact);
}

public class KnowledgeBaseService : IKnowledgeBaseService
{
    private readonly ITruthRepository _truthRepository;
    private readonly IMemoryCache _cache;
    private readonly ILogger<KnowledgeBaseService> _logger;

    private readonly Dictionary<string, TimeSpan> _factExpirations = new()
    {
        ["Science"] = TimeSpan.FromDays(30),
        ["Health"] = TimeSpan.FromDays(14),
        ["Politics"] = TimeSpan.FromDays(7),
        ["Technology"] = TimeSpan.FromDays(21),
        ["History"] = TimeSpan.FromDays(365),
        ["General"] = TimeSpan.FromDays(60)
    };

    public KnowledgeBaseService(ITruthRepository truthRepository, IMemoryCache cache, ILogger<KnowledgeBaseService> logger)
    {
        _truthRepository = truthRepository;
        _cache = cache;
        _logger = logger;
    }

    public async Task<TruthFact?> FindFactAsync(string normalizedClaim)
    {
        var cacheKey = $"fact_{normalizedClaim.GetHashCode()}";
        if (_cache.TryGetValue(cacheKey, out TruthFact? cachedFact))
        {
            return cachedFact;
        }

        var fact = await _truthRepository.FindFactAsync(normalizedClaim);
        if (fact != null && !IsFactExpired(fact))
        {
            _cache.Set(cacheKey, fact, TimeSpan.FromHours(24));
            return fact;
        }

        return null;
    }

    public async Task<IEnumerable<TruthFact>> FindSimilarClaimsAsync(string normalizedClaim)
    {
        var cacheKey = $"similar_{normalizedClaim.GetHashCode()}";
        if (_cache.TryGetValue(cacheKey, out IEnumerable<TruthFact>? cachedFacts) && cachedFacts is not null)
        {
            return cachedFacts;
        }

        var facts = await _truthRepository.FindSimilarFactsAsync(normalizedClaim);
        _cache.Set(cacheKey, facts, TimeSpan.FromHours(6));
        return facts;
    }

    public async Task AddFactAsync(TruthFact fact)
    {
        if (fact.Confidence < 0.80m)
        {
            throw new InvalidOperationException("Fact must have at least 80% confidence to be added");
        }

        var existing = await FindFactAsync(fact.NormalizedClaim);
        if (existing != null)
        {
            if (fact.Confidence > existing.Confidence)
            {
                await UpdateFactAsync(fact);
            }
            return;
        }

        fact.ExpiresAt = DateTime.UtcNow.Add(_factExpirations.GetValueOrDefault(fact.Category, TimeSpan.FromDays(60)));
        await _truthRepository.AddFactAsync(fact);

        _cache.Remove($"fact_{fact.NormalizedClaim.GetHashCode()}");
        _cache.Remove($"similar_{fact.NormalizedClaim.GetHashCode()}");

        _logger.LogInformation("Added fact to knowledge base: {Claim}", fact.Claim);
    }

    public async Task UpdateFactAsync(TruthFact fact)
    {
        fact.UpdatedAt = DateTime.UtcNow;
        await _truthRepository.UpdateFactAsync(fact);

        _cache.Remove($"fact_{fact.NormalizedClaim.GetHashCode()}");
        _cache.Remove($"similar_{fact.NormalizedClaim.GetHashCode()}");

        _logger.LogInformation("Updated fact in knowledge base: {Claim}", fact.Claim);
    }

    public async Task<IEnumerable<TruthFact>> GetRecentFactsAsync(int count)
    {
        return await _truthRepository.GetRecentFactsAsync(count);
    }

    public async Task<IDictionary<string, decimal>> GetCategoryStatsAsync()
    {
        return await _truthRepository.GetCategoryStatsAsync();
    }

    public async Task<IEnumerable<TruthFact>> GetUnverifiedFactsAsync(int count)
    {
        return await _truthRepository.GetUnverifiedFactsAsync(count);
    }

    public async Task<bool> IsFactExpiredAsync(TruthFact fact)
    {
        return IsFactExpired(fact);
    }

    private static bool IsFactExpired(TruthFact fact)
    {
        return fact.ExpiresAt.HasValue && fact.ExpiresAt.Value < DateTime.UtcNow;
    }
}
