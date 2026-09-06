// Wiseravenshare.Server/Controllers/EnhancedTruthEngineController.cs
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.Services.Truth;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/truthengine")]
public class EnhancedTruthEngineController : ControllerBase
{
    private readonly IEnhancedTruthEngine _truthEngine;
    private readonly ILogger<EnhancedTruthEngineController> _logger;

    public EnhancedTruthEngineController(
        IEnhancedTruthEngine truthEngine,
        ILogger<EnhancedTruthEngineController> logger)
    {
        _truthEngine = truthEngine;
        _logger = logger;
    }

    /// <summary>
    /// Comprehensive assessment of a claim
    /// Detects misbeliefs, logical fallacies, cognitive biases, and provides truth score
    /// </summary>
    [HttpPost("assess-comprehensive")]
    public async Task<ActionResult<ComprehensiveTruthAssessment>> AssessClaimAsync([FromBody] AssessmentRequest request)
    {
        if (string.IsNullOrWhiteSpace(request?.Claim))
        {
            return BadRequest(new { error = "Claim cannot be empty" });
        }

        try
        {
            _logger.LogInformation("Assessing claim: {Claim}", request.Claim[..50]);
            var assessment = await _truthEngine.AssessClaimAsync(request.Claim);
            return Ok(assessment);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error assessing claim");
            return StatusCode(500, new { error = "Truth assessment failed" });
        }
    }

    /// <summary>
    /// Quick misbelief detection
    /// Identifies false claims, misbeliefs, and false premises
    /// </summary>
    [HttpPost("detect-misbeliefs")]
    public async Task<ActionResult<MisbeliefAnalysis>> DetectMisbeleifAsync([FromBody] TextRequest request)
    {
        if (string.IsNullOrWhiteSpace(request?.Text))
        {
            return BadRequest(new { error = "Text cannot be empty" });
        }

        try
        {
            _logger.LogInformation("Detecting misbeliefs");
            var analysis = await _truthEngine.DetectMisbeleifs(request.Text);
            return Ok(analysis);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error detecting misbeliefs");
            return StatusCode(500, new { error = "Misbelief detection failed" });
        }
    }

    /// <summary>
    /// Logical fallacy detection
    /// Identifies ad hominem, straw man, false dilemma, appeal to authority, etc.
    /// </summary>
    [HttpPost("detect-fallacies")]
    public async Task<ActionResult<LogicalFallacyDetection>> DetectFallaciesAsync([FromBody] TextRequest request)
    {
        if (string.IsNullOrWhiteSpace(request?.Text))
        {
            return BadRequest(new { error = "Text cannot be empty" });
        }

        try
        {
            _logger.LogInformation("Detecting logical fallacies");
            var detection = await _truthEngine.DetectFallaciesAsync(request.Text);
            return Ok(detection);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error detecting fallacies");
            return StatusCode(500, new { error = "Fallacy detection failed" });
        }
    }

    /// <summary>
    /// Cognitive bias detection
    /// Identifies confirmation bias, availability heuristic, appeal to fear, bandwagon, etc.
    /// </summary>
    [HttpPost("detect-biases")]
    public async Task<ActionResult<CognitiveBiasAnalysis>> DetectBiasesAsync([FromBody] TextRequest request)
    {
        if (string.IsNullOrWhiteSpace(request?.Text))
        {
            return BadRequest(new { error = "Text cannot be empty" });
        }

        try
        {
            _logger.LogInformation("Detecting cognitive biases");
            // Note: This is a placeholder - implement async bias detection in the engine
            var analysis = new CognitiveBiasAnalysis();
            return Ok(analysis);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error detecting biases");
            return StatusCode(500, new { error = "Bias detection failed" });
        }
    }

    /// <summary>
    /// Batch verification of multiple claims
    /// </summary>
    [HttpPost("verify-batch")]
    public async Task<ActionResult<List<ComprehensiveTruthAssessment>>> VerifyBatchAsync([FromBody] EnhancedBatchVerificationRequest request)
    {
        if (request?.Claims == null || request.Claims.Count == 0)
        {
            return BadRequest(new { error = "Claims list cannot be empty" });
        }

        try
        {
            _logger.LogInformation("Batch verifying {Count} claims", request.Claims.Count);
            var results = new List<ComprehensiveTruthAssessment>();

            // Limit batch size to prevent abuse
            var claimsToVerify = request.Claims.Take(50).ToList();

            foreach (var claim in claimsToVerify)
            {
                var assessment = await _truthEngine.AssessClaimAsync(claim);
                results.Add(assessment);
            }

            return Ok(results);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in batch verification");
            return StatusCode(500, new { error = "Batch verification failed" });
        }
    }

    /// <summary>
    /// Get truth score for a claim
    /// Simple endpoint for quick truth scoring
    /// </summary>
    [HttpPost("score")]
    public async Task<ActionResult<EnhancedTruthScore>> GetTruthScoreAsync([FromBody] AssessmentRequest request)
    {
        if (string.IsNullOrWhiteSpace(request?.Claim))
        {
            return BadRequest(new { error = "Claim cannot be empty" });
        }

        try
        {
            var score = await _truthEngine.VerifyClaimAsync(request.Claim);
            return Ok(score);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error calculating truth score");
            return StatusCode(500, new { error = "Truth score calculation failed" });
        }
    }
}

// Request/Response DTOs
public class AssessmentRequest
{
    public string? Claim { get; set; }
}

public class TextRequest
{
    public string? Text { get; set; }
}

public class EnhancedBatchVerificationRequest
{
    public List<string> Claims { get; set; } = new();
}
