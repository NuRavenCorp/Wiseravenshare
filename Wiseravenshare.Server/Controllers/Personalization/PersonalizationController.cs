using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.Services.Personalization;
using Wiseravenshare.Server.Shared;

namespace Wiseravenshare.Server.Controllers.Personalization;

[ApiController]
[Route("api/personalization")]
[Authorize]
[Produces("application/json")]
public sealed class PersonalizationController : ControllerBase
{
    private readonly IPersonalizationService _svc;
    private readonly ILogger<PersonalizationController> _log;

    public PersonalizationController(IPersonalizationService svc, ILogger<PersonalizationController> log)
    {
        _svc = svc;
        _log = log;
    }

    // ── POST /api/personalization/track ───────────────────────────────────────
    /// <summary>Record a user interaction event (view, like, play, skip, etc.).</summary>
    [HttpPost("track")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Track([FromBody] TrackInteractionRequest req, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty) return Unauthorized();
        await _svc.TrackInteractionAsync(userId, req, ct);
        return NoContent();
    }

    // ── GET /api/personalization/recommendations ───────────────────────────────
    /// <summary>Get personalized content recommendations for the authenticated user.</summary>
    [HttpGet("recommendations")]
    [ProducesResponseType(typeof(IReadOnlyList<PersonalizedRecommendation>), StatusCodes.Status200OK)]
    public async Task<IActionResult> Recommendations([FromQuery] int count = 20, CancellationToken ct = default)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty) return Unauthorized();
        var reco = await _svc.GetRecommendationsAsync(userId, count, ct);
        return Ok(reco);
    }

    // ── GET /api/personalization/trending ─────────────────────────────────────
    /// <summary>
    /// Get trending topics for a country/region.
    /// Pass countryCode=GLOBAL (default) for worldwide trending.
    /// Pass a valid ISO-3166-1 alpha-2 code (e.g. US, GB, NG) for regional trends.
    /// </summary>
    [HttpGet("trending")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(IReadOnlyList<RegionalTrendItem>), StatusCodes.Status200OK)]
    public async Task<IActionResult> Trending(
        [FromQuery] string countryCode = "GLOBAL",
        [FromQuery] string category    = "General",
        CancellationToken ct = default)
    {
        var trends = await _svc.GetRegionalTrendsAsync(countryCode, category, ct);
        return Ok(trends);
    }

    // ── POST /api/personalization/auto-tag ────────────────────────────────────
    /// <summary>AI-tag a piece of content using Gemini Flash (server-side, free tier).</summary>
    [HttpPost("auto-tag")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> AutoTag([FromBody] AutoTagRequest req, CancellationToken ct)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);
        await _svc.AutoTagContentAsync(req.TargetType, req.TargetId, req.Content, ct);
        return NoContent();
    }

    // ── POST /api/personalization/crawled ─────────────────────────────────────
    /// <summary>Feed crawler-discovered content into the personalization engine.</summary>
    [HttpPost("crawled")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> CrawledContent([FromBody] CrawledContentRequest req, CancellationToken ct)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);
        await _svc.ProcessCrawledContentAsync(
            req.ContentType, req.ContentId, req.Content,
            req.Tags ?? Array.Empty<string>(), req.CountryCode ?? "GLOBAL", ct);
        return NoContent();
    }

    // ── GET /api/personalization/embedding ────────────────────────────────────
    /// <summary>Return the current user's interest embedding vector (tag → weight map).</summary>
    [HttpGet("embedding")]
    [ProducesResponseType(typeof(Dictionary<string, float>), StatusCodes.Status200OK)]
    public async Task<IActionResult> Embedding(CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty) return Unauthorized();
        var vector = await _svc.GetUserEmbeddingAsync(userId, ct);
        return Ok(vector);
    }
}

// ─── Request models ───────────────────────────────────────────────────────────
public record AutoTagRequest(
    [property: System.ComponentModel.DataAnnotations.Required] string TargetType,
    [property: System.ComponentModel.DataAnnotations.Required] Guid   TargetId,
    [property: System.ComponentModel.DataAnnotations.Required] string Content
);

public record CrawledContentRequest(
    [property: System.ComponentModel.DataAnnotations.Required] string ContentType,
    [property: System.ComponentModel.DataAnnotations.Required] Guid   ContentId,
    [property: System.ComponentModel.DataAnnotations.Required] string Content,
    string[]? Tags,
    string?   CountryCode
);
