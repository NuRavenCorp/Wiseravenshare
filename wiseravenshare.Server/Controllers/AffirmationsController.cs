using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using Wiseravenshare.Server.DTOs.Affirmations;
using Wiseravenshare.Server.Services.Affirmations;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public sealed class AffirmationsController : ControllerBase
{
    private readonly IAffirmationsAlgorithmService _affirmationsService;
    private readonly ILogger<AffirmationsController> _logger;

    public AffirmationsController(
        IAffirmationsAlgorithmService affirmationsService,
        ILogger<AffirmationsController> logger)
    {
        _affirmationsService = affirmationsService;
        _logger = logger;
    }

    /// <summary>
    /// Get the daily personalized affirmation aligned with current circadian phase and cognitive fatigue state.
    /// </summary>
    [HttpGet("daily")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(DailyAffirmationDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetDailyAffirmation([FromQuery] bool isFatigued = false)
    {
        var userId = ResolveEffectiveUserId();
        var affirmation = await _affirmationsService.GetDailyAffirmationAsync(userId, isFatigued, HttpContext.RequestAborted);
        return Ok(affirmation);
    }

    /// <summary>
    /// Stream affirmations across pillars and circadian phases, prioritizing soothing affirmations when fatigued.
    /// </summary>
    [HttpGet("stream")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(IEnumerable<DailyAffirmationDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAffirmationStream(
        [FromQuery] AffirmationPillar? pillar = null,
        [FromQuery] CircadianPhase? phase = null,
        [FromQuery] bool isFatigued = false,
        [FromQuery] int count = 20)
    {
        var userId = ResolveEffectiveUserId();
        var stream = await _affirmationsService.GetAffirmationStreamAsync(
            userId, pillar, phase, isFatigued, Math.Clamp(count, 1, 50), HttpContext.RequestAborted);
        return Ok(stream);
    }

    /// <summary>
    /// Record a mindful reflection on an affirmation, updating the user streak and earning effort-based WiseCoin rewards.
    /// </summary>
    [HttpPost("{id}/reflect")]
    [Authorize]
    [ProducesResponseType(typeof(AffirmationReflectionResultDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> ReflectOnAffirmation(Guid id, [FromBody] ReflectOnAffirmationRequestDto request)
    {
        var userId = ResolveEffectiveUserId();
        var result = await _affirmationsService.ReflectOnAffirmationAsync(userId, id, request, HttpContext.RequestAborted);
        return Ok(result);
    }

    /// <summary>
    /// Get user's current affirmation streak, total reflections, and unlocked milestone badges.
    /// </summary>
    [HttpGet("streak")]
    [Authorize]
    [ProducesResponseType(typeof(AffirmationStreakDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAffirmationStreak()
    {
        var userId = ResolveEffectiveUserId();
        var streak = await _affirmationsService.GetUserAffirmationStreakAsync(userId, HttpContext.RequestAborted);
        return Ok(streak);
    }

    /// <summary>
    /// Classify any text draft to determine its affirmation score, primary pillar, and restorative traits.
    /// </summary>
    [HttpPost("classify")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(AffirmationClassificationDto), StatusCodes.Status200OK)]
    public IActionResult ClassifyText([FromBody] ClassifyTextRequestDto request)
    {
        var result = _affirmationsService.ClassifyText(request?.Text ?? string.Empty);
        return Ok(result);
    }

    private Guid ResolveEffectiveUserId()
    {
        var subClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? User.FindFirst("sub")?.Value;

        if (Guid.TryParse(subClaim, out var parsedGuid))
        {
            return parsedGuid;
        }

        return Guid.Empty;
    }
}

public sealed class ClassifyTextRequestDto
{
    public string Text { get; set; } = string.Empty;
}
