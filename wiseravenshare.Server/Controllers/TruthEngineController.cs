using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.Services.Truth;
using Wiseravenshare.Server.Shared;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
[Produces("application/json")]
public class TruthEngineController : ControllerBase
{
    private readonly ITruthEngineService _truthEngine;
    private readonly IConsensusService _consensusService;
    private readonly IKnowledgeBaseService _knowledgeBaseService;

    public TruthEngineController(ITruthEngineService truthEngine, IConsensusService consensusService, IKnowledgeBaseService knowledgeBaseService)
    {
        _truthEngine = truthEngine;
        _consensusService = consensusService;
        _knowledgeBaseService = knowledgeBaseService;
    }

    [HttpPost("verify")]
    public async Task<IActionResult> VerifyClaim([FromBody] VerifyClaimRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Claim))
        {
            return BadRequest(new { error = "Claim cannot be empty" });
        }

        var depth = Enum.TryParse<VerificationDepth>(request.Depth, true, out var parsed) ? parsed : VerificationDepth.Deep;
        var result = await _truthEngine.VerifyClaimAsync(request.Claim, depth);
        return Ok(new TruthVerificationResponse
        {
            Claim = result.Claim,
            NormalizedClaim = result.NormalizedClaim,
            IsTrue = result.IsTrue,
            ConfidenceScore = result.ConfidenceScore,
            Explanation = result.Explanation,
            Sources = result.Sources.Select(s => new SourceDto { Url = s.Url, Title = s.Title, SourceType = s.SourceType, ReliabilityScore = s.ReliabilityScore, Verdict = s.Verdict.ToString(), PublishedDate = s.PublishedDate }).ToList(),
            Timestamp = result.Timestamp
        });
    }

    [HttpPost("verify-batch")]
    public async Task<IActionResult> VerifyBatch([FromBody] BatchVerificationRequest request)
    {
        var result = await _truthEngine.VerifyBatchAsync(request.Claims);
        return Ok(result);
    }

    [HttpPost("score")]
    public async Task<IActionResult> GetTruthScore([FromBody] ContentAnalysisRequest request)
    {
        var score = await _truthEngine.GetTruthScoreAsync(request.Content);
        return Ok(score);
    }

    [HttpPost("sources")]
    public async Task<IActionResult> FindSources([FromBody] ClaimRequest request)
    {
        var sources = await _truthEngine.FindSourcesAsync(request.Claim);
        return Ok(sources);
    }

    [HttpGet("consensus/{claimId:guid}")]
    public async Task<IActionResult> GetConsensus(Guid claimId)
    {
        var consensus = await _consensusService.GetConsensusAsync(claimId);
        return Ok(consensus);
    }

    [HttpPost("vote")]
    public async Task<IActionResult> Vote([FromBody] VoteRequest request)
    {
        var userId = User.GetUserId();
        var result = await _consensusService.AddVoteAsync(request.ClaimId, userId, request.Vote, request.Confidence);
        return Ok(result);
    }

    [HttpPost("contradictions")]
    public async Task<IActionResult> DetectContradictions([FromBody] ClaimRequest request)
    {
        var result = await _truthEngine.DetectContradictionsAsync(request.Claim);
        return Ok(result);
    }

    [HttpPost("temporal")]
    public async Task<IActionResult> AnalyzeTemporal([FromBody] ClaimRequest request)
    {
        var result = await _truthEngine.AnalyzeTemporalEvolutionAsync(request.Claim);
        return Ok(result);
    }

    [HttpPost("knowledge-base")]
    [Authorize(Roles = "Admin,Moderator,TruthGuardian")]
    public async Task<IActionResult> AddToKnowledgeBase([FromBody] AddFactRequest request)
    {
        var fact = new TruthFact
        {
            Claim = request.Claim,
            NormalizedClaim = request.Claim.ToLowerInvariant(),
            IsTrue = request.IsTrue,
            Confidence = request.Confidence,
            Sources = request.Sources,
            Explanation = request.Explanation,
            Category = request.Category
        };

        await _knowledgeBaseService.AddFactAsync(fact);
        return StatusCode(StatusCodes.Status201Created, fact);
    }

    [HttpGet("knowledge-base/{id:guid}")]
    public async Task<IActionResult> GetFact(Guid id)
    {
        var fact = await _knowledgeBaseService.FindFactAsync(id.ToString());
        if (fact == null)
        {
            return NotFound();
        }

        return Ok(fact);
    }

    [HttpGet("unverified")]
    public async Task<IActionResult> GetUnverified([FromQuery] int count = 10)
    {
        return Ok(await _knowledgeBaseService.GetUnverifiedFactsAsync(count));
    }

    [HttpGet("stats")]
    public async Task<IActionResult> GetStats()
    {
        return Ok(new
        {
            totalClaimsVerified = 0,
            averageConfidence = 0.75m,
            falseClaimRate = 0.15m,
            activeVerifiers = 0,
            categoryBreakdown = await _knowledgeBaseService.GetCategoryStatsAsync(),
            recentActivity = new List<object>()
        });
    }
}

public class VerifyClaimRequest
{
    public string Claim { get; set; } = string.Empty;
    public string? Depth { get; set; }
}

public class BatchVerificationRequest
{
    public List<string> Claims { get; set; } = new();
}

public class ContentAnalysisRequest
{
    public string Content { get; set; } = string.Empty;
}

public class ClaimRequest
{
    public string Claim { get; set; } = string.Empty;
}

public class VoteRequest
{
    public Guid ClaimId { get; set; }
    public bool Vote { get; set; }
    public int Confidence { get; set; } = 5;
}

public class AddFactRequest
{
    public string Claim { get; set; } = string.Empty;
    public bool IsTrue { get; set; }
    public decimal Confidence { get; set; }
    public List<string> Sources { get; set; } = new();
    public string? Explanation { get; set; }
    public string Category { get; set; } = "General";
}

public class TruthVerificationResponse
{
    public string Claim { get; set; } = string.Empty;
    public string NormalizedClaim { get; set; } = string.Empty;
    public bool? IsTrue { get; set; }
    public decimal ConfidenceScore { get; set; }
    public string Explanation { get; set; } = string.Empty;
    public List<SourceDto> Sources { get; set; } = new();
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}

public class SourceDto
{
    public string Url { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string SourceType { get; set; } = string.Empty;
    public decimal ReliabilityScore { get; set; }
    public string Verdict { get; set; } = string.Empty;
    public DateTime? PublishedDate { get; set; }
}
