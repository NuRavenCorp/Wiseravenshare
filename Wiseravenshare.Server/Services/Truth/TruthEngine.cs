using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using System.Text.Json;
using System.Text.RegularExpressions;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Interfaces.Repositories;
using Wiseravenshare.Server.Services.External.DeepSeekService;
using Wiseravenshare.Server.Services.Truth;

namespace Wiseravenshare.Server.Services.Truth;

public interface ITruthEngineService
{
    Task<TruthVerificationResult> VerifyClaimAsync(string claim, VerificationDepth depth = VerificationDepth.Deep);
    Task<BatchVerificationResult> VerifyBatchAsync(IEnumerable<string> claims);
    Task<TruthScore> GetTruthScoreAsync(string content);
    Task<IEnumerable<Source>> FindSourcesAsync(string claim);
    Task<ConsensusResult> GetCommunityConsensusAsync(Guid claimId);
    Task AddToKnowledgeBaseAsync(TruthFact fact);
    Task<TemporalAnalysisResult> AnalyzeTemporalEvolutionAsync(string claim);
    Task<ContradictionResult> DetectContradictionsAsync(string claim);
}

public class TruthEngineService : ITruthEngineService
{
    private readonly ITruthRepository _truthRepository;
    private readonly IDeepSeekService _deepSeekService;
    private readonly IKnowledgeBaseService _knowledgeBaseService;
    private readonly IConsensusService _consensusService;
    private readonly IMemoryCache _cache;
    private readonly ILogger<TruthEngineService> _logger;

    private const decimal HIGH_CONFIDENCE_THRESHOLD = 0.85m;
    private const decimal MEDIUM_CONFIDENCE_THRESHOLD = 0.60m;
    private const decimal LOW_CONFIDENCE_THRESHOLD = 0.40m;
    private const decimal KNOWLEDGE_BASE_WEIGHT = 0.35m;
    private const decimal AI_REASONING_WEIGHT = 0.25m;
    private const decimal CONSENSUS_WEIGHT = 0.20m;
    private const decimal SOURCE_VERIFICATION_WEIGHT = 0.15m;
    private const decimal TEMPORAL_WEIGHT = 0.05m;

    public TruthEngineService(ITruthRepository truthRepository, IDeepSeekService deepSeekService, IKnowledgeBaseService knowledgeBaseService, IConsensusService consensusService, IMemoryCache cache, ILogger<TruthEngineService> logger)
    {
        _truthRepository = truthRepository;
        _deepSeekService = deepSeekService;
        _knowledgeBaseService = knowledgeBaseService;
        _consensusService = consensusService;
        _cache = cache;
        _logger = logger;
    }

    public async Task<TruthVerificationResult> VerifyClaimAsync(string claim, VerificationDepth depth = VerificationDepth.Deep)
    {
        var normalizedClaim = NormalizeClaim(claim);
        var cacheKey = $"truth_verify_{normalizedClaim.GetHashCode()}";
        if (_cache.TryGetValue(cacheKey, out TruthVerificationResult cachedResult))
        {
            return cachedResult;
        }

        var knowledgeBaseResult = await CheckKnowledgeBaseAsync(normalizedClaim);
        var aiReasoningResult = await PerformAIReasoningAsync(claim, normalizedClaim);
        var sourceVerificationResult = await VerifySourcesAsync(claim);
        var temporalAnalysisResult = await AnalyzeTemporalAsync(normalizedClaim);
        var consensusResult = await GetConsensusAsync(normalizedClaim);

        var result = CombineVerificationResults(knowledgeBaseResult, aiReasoningResult, sourceVerificationResult, temporalAnalysisResult, consensusResult);
        result.Claim = claim;
        result.NormalizedClaim = normalizedClaim;
        result.Timestamp = DateTime.UtcNow;
        result.VerificationDepth = depth;
        result.Explanation = await GenerateExplanationAsync(result);

        _cache.Set(cacheKey, result, TimeSpan.FromHours(6));
        return result;
    }

    public async Task<BatchVerificationResult> VerifyBatchAsync(IEnumerable<string> claims)
    {
        var results = new List<TruthVerificationResult>();
        foreach (var claim in claims)
        {
            results.Add(await VerifyClaimAsync(claim));
        }

        return new BatchVerificationResult
        {
            Results = results,
            TotalClaims = results.Count,
            AverageConfidence = results.Count == 0 ? 0m : results.Average(r => r.ConfidenceScore),
            VerifiedCount = results.Count(r => r.ConfidenceScore >= HIGH_CONFIDENCE_THRESHOLD),
            DisputedCount = results.Count(r => r.ConfidenceScore >= MEDIUM_CONFIDENCE_THRESHOLD && r.ConfidenceScore < HIGH_CONFIDENCE_THRESHOLD),
            FalseCount = results.Count(r => r.ConfidenceScore < MEDIUM_CONFIDENCE_THRESHOLD)
        };
    }

    public async Task<TruthScore> GetTruthScoreAsync(string content)
    {
        var claims = ExtractClaims(content);
        if (!claims.Any())
        {
            return new TruthScore { Score = 0.50m, Confidence = 0.50m, Accuracy = 0.50m };
        }

        var results = new List<TruthVerificationResult>();
        foreach (var claim in claims)
        {
            results.Add(await VerifyClaimAsync(claim, VerificationDepth.Quick));
        }

        var weightedScore = results.Count == 0 ? 0.50m : results.Average(r => r.ConfidenceScore);
        return new TruthScore
        {
            Score = weightedScore,
            Confidence = weightedScore,
            Accuracy = results.Count == 0 ? 0.50m : results.Count(r => r.IsTrue == true) / (decimal)results.Count,
            Claims = results.Select(r => new ClaimScore { Claim = r.Claim, Score = r.ConfidenceScore, IsTrue = r.IsTrue, Evidence = r.Sources.Select(s => s.Url).ToList() }).ToList()
        };
    }

    public async Task<IEnumerable<Source>> FindSourcesAsync(string claim)
    {
        return new List<Source>
        {
            new() { Url = "https://www.example.org", Title = $"Reference for: {claim}", SourceType = "General", ReliabilityScore = 0.75m, Verdict = SourceVerdict.Supports, IsVerified = true }
        };
    }

    public async Task<ConsensusResult> GetCommunityConsensusAsync(Guid claimId)
    {
        return await _consensusService.GetConsensusAsync(claimId);
    }

    public async Task AddToKnowledgeBaseAsync(TruthFact fact)
    {
        if (fact.Confidence < HIGH_CONFIDENCE_THRESHOLD)
        {
            throw new InvalidOperationException("Fact must have high confidence to be added to knowledge base");
        }

        await _knowledgeBaseService.AddFactAsync(fact);
    }

    public async Task<TemporalAnalysisResult> AnalyzeTemporalEvolutionAsync(string claim)
    {
        var historicalData = await GetHistoricalClaimsAsync(NormalizeClaim(claim));
        return new TemporalAnalysisResult
        {
            Claim = claim,
            FirstAppearance = historicalData.FirstOrDefault()?.CreatedAt,
            Evolution = historicalData.Select(h => new EvolutionPoint { Timestamp = h.CreatedAt, Verdict = h.IsTrue, Confidence = h.Confidence }).ToList(),
            Trend = historicalData.Count == 0 ? TrendType.Stable : AnalyzeTrend(historicalData)
        };
    }

    public async Task<ContradictionResult> DetectContradictionsAsync(string claim)
    {
        var normalizedClaim = NormalizeClaim(claim);
        var similarClaims = await _knowledgeBaseService.FindSimilarClaimsAsync(normalizedClaim);
        var contradictions = similarClaims
            .Where(f => IsContradictory(normalizedClaim, f.NormalizedClaim))
            .Select(f => new Contradiction { ExistingClaim = f.Claim, ExistingVerdict = f.IsTrue, Confidence = f.Confidence })
            .ToList();

        return new ContradictionResult
        {
            Claim = claim,
            HasContradictions = contradictions.Any(),
            Contradictions = contradictions
        };
    }

    private async Task<KnowledgeBaseResult> CheckKnowledgeBaseAsync(string normalizedClaim)
    {
        var fact = await _knowledgeBaseService.FindFactAsync(normalizedClaim);
        return fact == null ? new KnowledgeBaseResult { Found = false } : new KnowledgeBaseResult
        {
            Found = true,
            IsTrue = fact.IsTrue,
            Confidence = fact.Confidence,
            Sources = fact.Sources.Select(s => new Source { Url = s, Title = s, SourceType = "General", ReliabilityScore = 0.75m, Verdict = SourceVerdict.Supports }).ToList(),
            Explanation = fact.Explanation ?? string.Empty
        };
    }

    private async Task<AIReasoningResult> PerformAIReasoningAsync(string claim, string normalizedClaim)
    {
        var prompt = $"Analyze the following claim with clear reasoning and evidence: {claim}";
        var response = await _deepSeekService.GenerateAsync(prompt);
        var parsed = ParseAIResponse(response);

        return new AIReasoningResult
        {
            IsTrue = parsed.Verdict,
            Confidence = parsed.Confidence,
            Reasoning = parsed.Reasoning,
            CounterArguments = parsed.CounterArguments,
            NeededEvidence = parsed.NeededEvidence
        };
    }

    private async Task<SourceVerificationResult> VerifySourcesAsync(string claim)
    {
        var sources = (await FindSourcesAsync(claim)).ToList();
        var credible = sources.Where(s => s.ReliabilityScore >= 0.70m).ToList();
        var supporting = credible.Count(s => s.Verdict == SourceVerdict.Supports);
        var contradicting = credible.Count(s => s.Verdict == SourceVerdict.Contradicts);

        return new SourceVerificationResult
        {
            TotalSources = sources.Count,
            CredibleSources = credible.Count,
            SupportingSources = supporting,
            ContradictingSources = contradicting,
            Consensus = supporting > contradicting ? SourceConsensus.Supports : contradicting > supporting ? SourceConsensus.Contradicts : SourceConsensus.Uncertain,
            Sources = sources.Take(10).ToList()
        };
    }

    private async Task<TemporalAnalysisResult> AnalyzeTemporalAsync(string normalizedClaim)
    {
        return await AnalyzeTemporalEvolutionAsync(normalizedClaim);
    }

    private async Task<ConsensusResult> GetConsensusAsync(string normalizedClaim)
    {
        var claim = await _truthRepository.GetClaimByTextAsync(normalizedClaim);
        if (claim == null)
        {
            return new ConsensusResult { Claim = normalizedClaim, Confidence = 0.50m, ConsensusStatus = ConsensusStatus.InsufficientData };
        }

        return await _consensusService.GetConsensusAsync(claim.Id);
    }

    private TruthVerificationResult CombineVerificationResults(KnowledgeBaseResult knowledgeBase, AIReasoningResult aiReasoning, SourceVerificationResult sources, TemporalAnalysisResult temporal, ConsensusResult consensus)
    {
        var knowledgeScore = knowledgeBase.Found ? knowledgeBase.Confidence : 0.50m;
        var aiScore = aiReasoning.Confidence;
        var sourceScore = CalculateSourceScore(sources);
        var temporalScore = CalculateTemporalScore(temporal);
        var consensusScore = consensus.Confidence;

        var confidenceScore = (knowledgeScore * KNOWLEDGE_BASE_WEIGHT) + (aiScore * AI_REASONING_WEIGHT) + (sourceScore * SOURCE_VERIFICATION_WEIGHT) + (temporalScore * TEMPORAL_WEIGHT) + (consensusScore * CONSENSUS_WEIGHT);

        return new TruthVerificationResult
        {
            ConfidenceScore = confidenceScore,
            IsTrue = confidenceScore >= HIGH_CONFIDENCE_THRESHOLD ? true : confidenceScore <= LOW_CONFIDENCE_THRESHOLD ? false : null,
            Sources = (knowledgeBase.Sources ?? new List<Source>()).Concat(sources.Sources ?? new List<Source>()).DistinctBy(s => s.Url).ToList(),
            Breakdown = new VerificationBreakdown { KnowledgeBaseScore = knowledgeScore, AIScore = aiScore, SourceScore = sourceScore, TemporalScore = temporalScore, ConsensusScore = consensusScore }
        };
    }

    private static decimal CalculateSourceScore(SourceVerificationResult sources)
    {
        if (sources.TotalSources == 0) return 0.50m;
        var supportRatio = (decimal)sources.SupportingSources / sources.TotalSources;
        var credibilityRatio = (decimal)sources.CredibleSources / sources.TotalSources;
        return (supportRatio * 0.60m) + (credibilityRatio * 0.40m);
    }

    private static decimal CalculateTemporalScore(TemporalAnalysisResult temporal)
    {
        if (!temporal.Evolution.Any()) return 0.50m;
        var firstVerdict = temporal.Evolution.First().Verdict;
        var consistent = temporal.Evolution.All(p => p.Verdict == firstVerdict);
        var recent = temporal.Evolution.OrderByDescending(e => e.Timestamp).Take(3).Average(e => e.Verdict == true ? 1m : 0m);
        return (consistent ? 0.80m : 0.20m) * 0.50m + recent * 0.50m;
    }

    private static string NormalizeClaim(string claim)
    {
        claim = claim.ToLowerInvariant();
        claim = Regex.Replace(claim, @"\s+", " ");
        claim = Regex.Replace(claim, @"[^a-z0-9\s]", "");
        return claim.Trim();
    }

    private static List<string> ExtractClaims(string content)
    {
        if (string.IsNullOrWhiteSpace(content)) return new List<string>();
        var sentences = content.Split(['.', '!', '?'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        return sentences.Where(s => s.Length > 20).Take(10).ToList();
    }

    private static AIResponse ParseAIResponse(string response)
    {
        try
        {
            using var json = JsonDocument.Parse(response);
            var root = json.RootElement;
            return new AIResponse
            {
                Verdict = root.TryGetProperty("verdict", out var verdict) ? verdict.GetBoolean() : response.Contains("true", StringComparison.OrdinalIgnoreCase),
                Confidence = root.TryGetProperty("confidence", out var confidence) ? confidence.GetDecimal() : 0.50m,
                Reasoning = root.TryGetProperty("reasoning", out var reasoning) ? reasoning.GetString() ?? string.Empty : response,
                CounterArguments = root.TryGetProperty("counterarguments", out var counter) ? counter.EnumerateArray().Select(e => e.GetString() ?? string.Empty).ToList() : new List<string>(),
                NeededEvidence = root.TryGetProperty("needed_evidence", out var evidence) ? evidence.EnumerateArray().Select(e => e.GetString() ?? string.Empty).ToList() : new List<string>()
            };
        }
        catch
        {
            return new AIResponse { Verdict = response.Contains("true", StringComparison.OrdinalIgnoreCase), Confidence = 0.50m, Reasoning = response, CounterArguments = new List<string>(), NeededEvidence = new List<string>() };
        }
    }

    private static bool IsContradictory(string claim1, string claim2)
    {
        return !string.Equals(claim1, claim2, StringComparison.Ordinal) && (claim1.Contains("not", StringComparison.Ordinal) != claim2.Contains("not", StringComparison.Ordinal));
    }

    private static TrendType AnalyzeTrend(List<TruthFact> historicalData)
    {
        if (historicalData.Count == 0) return TrendType.Stable;
        var recent = historicalData.Take(5).Average(h => h.IsTrue ? 1m : 0m);
        var older = historicalData.Skip(5).Take(5).Average(h => h.IsTrue ? 1m : 0m);
        if (recent > older + 0.2m) return TrendType.Increasing;
        if (recent < older - 0.2m) return TrendType.Decreasing;
        return TrendType.Stable;
    }

    private async Task<List<TruthFact>> GetHistoricalClaimsAsync(string normalizedClaim)
    {
        return await _truthRepository.GetHistoricalClaimsAsync(normalizedClaim);
    }

    private async Task<string> GenerateExplanationAsync(TruthVerificationResult result)
    {
        var evidence = result.Sources.Take(3).Select(s => s.Title).ToList();
        var verdict = result.IsTrue == true ? "TRUE" : result.IsTrue == false ? "FALSE" : "UNCERTAIN";
        var prompt = $"Explain this fact-check result: claim={result.Claim}; verdict={verdict}; confidence={result.ConfidenceScore}; evidence={string.Join(", ", evidence)}";
        return await _deepSeekService.GenerateAsync(prompt);
    }
}

public enum VerificationDepth { Quick, Deep }

public class TruthVerificationResult
{
    public string Claim { get; set; } = string.Empty;
    public string NormalizedClaim { get; set; } = string.Empty;
    public bool? IsTrue { get; set; }
    public decimal ConfidenceScore { get; set; }
    public string Explanation { get; set; } = string.Empty;
    public List<Source> Sources { get; set; } = new();
    public VerificationBreakdown? Breakdown { get; set; }
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    public VerificationDepth VerificationDepth { get; set; } = VerificationDepth.Deep;
}

public class BatchVerificationResult
{
    public List<TruthVerificationResult> Results { get; set; } = new();
    public int TotalClaims { get; set; }
    public decimal AverageConfidence { get; set; }
    public int VerifiedCount { get; set; }
    public int DisputedCount { get; set; }
    public int FalseCount { get; set; }
}

public class TruthScore
{
    public decimal Score { get; set; }
    public decimal Confidence { get; set; }
    public decimal Accuracy { get; set; }
    public List<ClaimScore> Claims { get; set; } = new();
}

public class ClaimScore
{
    public string Claim { get; set; } = string.Empty;
    public decimal Score { get; set; }
    public bool? IsTrue { get; set; }
    public List<string> Evidence { get; set; } = new();
}

public class Source
{
    public string Url { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string SourceType { get; set; } = string.Empty;
    public decimal ReliabilityScore { get; set; }
    public SourceVerdict Verdict { get; set; } = SourceVerdict.Supports;
    public DateTime? PublishedDate { get; set; }
    public bool IsVerified { get; set; }
}

public enum SourceVerdict { Supports, Contradicts, Neutral }

public enum SourceConsensus { Supports, Contradicts, Uncertain }

public class KnowledgeBaseResult
{
    public bool Found { get; set; }
    public bool IsTrue { get; set; }
    public decimal Confidence { get; set; }
    public List<Source>? Sources { get; set; }
    public string Explanation { get; set; } = string.Empty;
}

public class AIReasoningResult
{
    public bool IsTrue { get; set; }
    public decimal Confidence { get; set; }
    public string Reasoning { get; set; } = string.Empty;
    public List<string> CounterArguments { get; set; } = new();
    public List<string> NeededEvidence { get; set; } = new();
}

public class SourceVerificationResult
{
    public int TotalSources { get; set; }
    public int CredibleSources { get; set; }
    public int SupportingSources { get; set; }
    public int ContradictingSources { get; set; }
    public SourceConsensus Consensus { get; set; } = SourceConsensus.Uncertain;
    public List<Source> Sources { get; set; } = new();
}

public class TemporalAnalysisResult
{
    public string Claim { get; set; } = string.Empty;
    public DateTime? FirstAppearance { get; set; }
    public List<EvolutionPoint> Evolution { get; set; } = new();
    public TrendType Trend { get; set; } = TrendType.Stable;
}

public class EvolutionPoint
{
    public DateTime? Timestamp { get; set; }
    public bool? Verdict { get; set; }
    public decimal Confidence { get; set; }
}

public enum TrendType { Stable, Increasing, Decreasing }

public class ContradictionResult
{
    public string Claim { get; set; } = string.Empty;
    public bool HasContradictions { get; set; }
    public List<Contradiction> Contradictions { get; set; } = new();
}

public class Contradiction
{
    public string ExistingClaim { get; set; } = string.Empty;
    public bool ExistingVerdict { get; set; }
    public decimal Confidence { get; set; }
}

public class VerificationBreakdown
{
    public decimal KnowledgeBaseScore { get; set; }
    public decimal AIScore { get; set; }
    public decimal SourceScore { get; set; }
    public decimal TemporalScore { get; set; }
    public decimal ConsensusScore { get; set; }
}

public class AIResponse
{
    public bool Verdict { get; set; }
    public decimal Confidence { get; set; }
    public string Reasoning { get; set; } = string.Empty;
    public List<string> CounterArguments { get; set; } = new();
    public List<string> NeededEvidence { get; set; } = new();
}

public class TruthEngineException : Exception
{
    public TruthEngineException(string message, Exception? inner = null) : base(message, inner) { }
}