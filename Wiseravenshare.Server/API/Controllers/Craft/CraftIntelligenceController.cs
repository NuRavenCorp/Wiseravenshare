using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using WiseRavenShare.Server.Application.DTOs.Craft;
using WiseRavenShare.Server.Application.Services.Craft;

namespace WiseRavenShare.Server.API.Controllers.Craft;

[ApiController]
[Route("api/craft")]
[Authorize]
public class CraftIntelligenceController : ControllerBase
{
    private readonly ICraftCoachingService _coachingService;
    private readonly ILogger<CraftIntelligenceController> _logger;

    public CraftIntelligenceController(
        ICraftCoachingService coachingService,
        ILogger<CraftIntelligenceController> logger)
    {
        _coachingService = coachingService;
        _logger = logger;
    }

    /// <summary>
    /// Review a draft using AI coaching for specified craft domain.
    /// Returns structured feedback with principles, strengths, improvements, and score.
    /// </summary>
    /// <param name="request">DraftReviewRequest with domain, content, contentType</param>
    /// <returns>DraftReviewResponse with coaching feedback and RAG context</returns>
    [HttpPost("draft/review")]
    public async Task<IActionResult> ReviewDraft(
        [FromBody] CraftDraftReviewRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            if (!ModelState.IsValid)
                return BadRequest(ModelState);

            var userId = new Guid(User.FindFirst("sub")?.Value ?? Guid.Empty.ToString());
            if (userId == Guid.Empty)
                return Unauthorized("User context not found");

            var response = await _coachingService.ReviewDraftAsync(
                userId,
                request,
                cancellationToken);

            return Ok(response);
        }
        catch (ArgumentException ex)
        {
            _logger.LogWarning(ex, "Invalid request: {Message}", ex.Message);
            return BadRequest(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error reviewing draft");
            return StatusCode(
                StatusCodes.Status500InternalServerError,
                new { error = "Draft review failed", details = ex.Message });
        }
    }

    /// <summary>
    /// Get all available craft domains.
    /// </summary>
    [HttpGet("domains")]
    public async Task<IActionResult> GetDomains(
        [FromServices] Wiseravenshare.Server.Infrastructure.Data.AppDbContext context,
        CancellationToken cancellationToken)
    {
        try
        {
            var domains = await context.CraftDomains
                .AsNoTracking()
                .Where(d => d.IsActive)
                .OrderBy(d => d.SortOrder)
                .Select(d => new
                {
                    d.Id,
                    d.Key,
                    d.Name,
                    d.Description,
                    d.IconEmoji,
                    SkillCount = d.Skills.Count,
                    PrincipleCount = d.Principles.Count
                })
                .ToListAsync(cancellationToken);

            return Ok(domains);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving domains");
            return StatusCode(StatusCodes.Status500InternalServerError, new { error = "Failed to retrieve domains" });
        }
    }

    /// <summary>
    /// Get principles for a specific craft domain.
    /// </summary>
    [HttpGet("domains/{domainKey}/principles")]
    public async Task<IActionResult> GetDomainPrinciples(
        string domainKey,
        [FromServices] Wiseravenshare.Server.Infrastructure.Data.AppDbContext context,
        CancellationToken cancellationToken)
    {
        try
        {
            var principles = await context.CraftPrinciples
                .AsNoTracking()
                .Where(p => p.Domain.Key == domainKey)
                .Select(p => new
                {
                    p.Id,
                    p.Title,
                    p.Description,
                    p.Example,
                    p.CounterExample,
                    p.Kind,
                    p.Importance,
                    p.Author
                })
                .ToListAsync(cancellationToken);

            if (principles.Count == 0)
                return NotFound(new { error = $"Domain '{domainKey}' not found or has no principles" });

            return Ok(principles);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving principles for domain {DomainKey}", domainKey);
            return StatusCode(StatusCodes.Status500InternalServerError, new { error = "Failed to retrieve principles" });
        }
    }

    /// <summary>
    /// Get user's draft review history.
    /// </summary>
    [HttpGet("drafts/history")]
    public async Task<IActionResult> GetDraftHistory(
        [FromServices] Wiseravenshare.Server.Infrastructure.Data.AppDbContext context,
        [FromQuery] int limit = 10,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var userId = new Guid(User.FindFirst("sub")?.Value ?? Guid.Empty.ToString());
            if (userId == Guid.Empty)
                return Unauthorized("User context not found");

            var reviews = await context.CraftDraftReviews
                .AsNoTracking()
                .Where(r => r.UserId == userId)
                .OrderByDescending(r => r.ReviewedAt)
                .Take(limit)
                .Select(r => new
                {
                    r.Id,
                    r.CraftDomainId,
                    r.DomainKey,
                    r.ContentType,
                    Score = r.OverallScore,
                    r.WordCount,
                    r.ReviewedAt,
                    DraftPreview = r.DraftContent.Substring(0, Math.Min(100, r.DraftContent.Length)) + "..."
                })
                .ToListAsync(cancellationToken);

            return Ok(reviews);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving draft history");
            return StatusCode(StatusCodes.Status500InternalServerError, new { error = "Failed to retrieve history" });
        }
    }

    /// <summary>
    /// Get a specific draft review details.
    /// </summary>
    [HttpGet("drafts/{reviewId}")]
    public async Task<IActionResult> GetDraftReview(
        Guid reviewId,
        [FromServices] Wiseravenshare.Server.Infrastructure.Data.AppDbContext context,
        CancellationToken cancellationToken)
    {
        try
        {
            var userId = new Guid(User.FindFirst("sub")?.Value ?? Guid.Empty.ToString());
            if (userId == Guid.Empty)
                return Unauthorized("User context not found");

            var review = await context.CraftDraftReviews
                .AsNoTracking()
                .FirstOrDefaultAsync(r => r.Id == reviewId && r.UserId == userId, cancellationToken);

            if (review == null)
                return NotFound(new { error = "Draft review not found" });

            return Ok(new
            {
                review.Id,
                review.DomainKey,
                review.ContentType,
                review.DraftContent,
                review.OverallScore,
                review.WordCount,
                review.ReviewedAt,
                Coaching = review.CoachingOutput?.RootElement
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving draft review {ReviewId}", reviewId);
            return StatusCode(StatusCodes.Status500InternalServerError, new { error = "Failed to retrieve review" });
        }
    }
}
