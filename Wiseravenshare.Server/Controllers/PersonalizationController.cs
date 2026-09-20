using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.DTOs.Personalization;
using Wiseravenshare.Server.Interfaces.Services.External;
using Wiseravenshare.Server.Interfaces.Services.Personalization;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class PersonalizationController : ControllerBase
{
    private readonly IPersonalizationService _personalizationService;
    private readonly IWebCrawlerService _webCrawlerService;

    public PersonalizationController(IPersonalizationService personalizationService, IWebCrawlerService webCrawlerService)
    {
        _personalizationService = personalizationService;
        _webCrawlerService = webCrawlerService;
    }

    [HttpGet("profile")]
    public async Task<ActionResult<UserProfileDto>> GetProfile()
    {
        var userId = GetUserId();
        return Ok(await _personalizationService.GetUserProfileAsync(userId));
    }

    [HttpPut("profile")]
    public async Task<ActionResult<UserProfileDto>> UpdateProfile([FromBody] UpdateUserProfileDto dto)
    {
        var userId = GetUserId();
        return Ok(await _personalizationService.UpdateUserProfileAsync(userId, dto));
    }

    [HttpPost("interaction")]
    public async Task<IActionResult> TrackInteraction([FromBody] TrackInteractionDto dto)
    {
        var userId = GetUserId();
        await _personalizationService.TrackInteractionAsync(userId, dto);
        return Ok(new { status = "tracked" });
    }

    [HttpGet("interactions")]
    public async Task<ActionResult<IEnumerable<UserInteractionDto>>> GetInteractions([FromQuery] DateTime? fromDate = null)
    {
        var userId = GetUserId();
        return Ok(await _personalizationService.GetUserInteractionsAsync(userId, fromDate));
    }

    [HttpGet("recommendations")]
    public async Task<ActionResult<IEnumerable<RecommendationDto>>> GetRecommendations([FromQuery] int count = 20)
    {
        var userId = GetUserId();
        return Ok(await _personalizationService.GetPersonalizedRecommendationsAsync(userId, count));
    }

    [HttpPost("contextual-recommendations")]
    public async Task<ActionResult<IEnumerable<RecommendationDto>>> GetContextualRecommendations([FromBody] ContextDto context)
    {
        var userId = GetUserId();
        return Ok(await _personalizationService.GetContextualRecommendationsAsync(userId, context));
    }

    [HttpGet("trending-intelligence")]
    public async Task<ActionResult<IEnumerable<ContentDiscoveryDto>>> GetTrendingIntelligence()
    {
        var userId = GetUserId();
        return Ok(await _personalizationService.GetDiscoveredContentForUserAsync(userId));
    }

    [HttpPost("trigger-crawl")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> TriggerWebCrawler()
    {
        await _webCrawlerService.CrawlAndProcessLatestTrendsAsync();
        return Ok(new { status = "crawler_completed" });
    }

    [HttpPost("feedback")]
    public async Task<IActionResult> SubmitFeedback([FromBody] FeedbackDto dto)
    {
        var userId = GetUserId();
        await _personalizationService.ProcessFeedbackAsync(userId, dto);
        return Ok(new { status = "feedback_processed" });
    }

    private Guid GetUserId()
    {
        var claim = User.FindFirstValue(ClaimTypes.NameIdentifier);
        return Guid.TryParse(claim, out var id) ? id : Guid.Empty;
    }
}
