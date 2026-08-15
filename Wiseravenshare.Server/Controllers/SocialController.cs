using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OutputCaching;
using Wiseravenshare.Server.DTOs.Social;
using Wiseravenshare.Server.Models;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public class SocialController : ControllerBase
{
    private readonly ISocialPlatformService _socialPlatformService;
    private readonly OutputCacheInvalidationService _cacheInvalidation;

    public SocialController(ISocialPlatformService socialPlatformService, OutputCacheInvalidationService cacheInvalidation)
    {
        _socialPlatformService = socialPlatformService;
        _cacheInvalidation = cacheInvalidation;
    }

    [HttpGet("feed/facebook")]
    [OutputCache(PolicyName = "PublicFeedShort")]
    [ProducesResponseType(typeof(IReadOnlyList<SocialFeedItemDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetFacebookFeed([FromQuery] string? pageId = null, [FromQuery] int limit = 10)
    {
        var result = await _socialPlatformService.GetFacebookFeedAsync(pageId, limit);
        return Ok(result);
    }

    [HttpGet("feed/tiktok")]
    [OutputCache(PolicyName = "PublicFeedShort")]
    [ProducesResponseType(typeof(IReadOnlyList<SocialFeedItemDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetTikTokFeed([FromQuery] string? username = null, [FromQuery] int limit = 10)
    {
        var result = await _socialPlatformService.GetTikTokFeedAsync(username, limit);
        return Ok(result);
    }

    [HttpGet("feed")]
    [OutputCache(PolicyName = "PublicFeedShort")]
    [ProducesResponseType(typeof(IReadOnlyList<SocialFeedItemDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetCombinedFeed(
        [FromQuery] string? pageId = null,
        [FromQuery] string? username = null,
        [FromQuery] int limit = 10)
    {
        var facebook = await _socialPlatformService.GetFacebookFeedAsync(pageId, limit);
        var tiktok = await _socialPlatformService.GetTikTokFeedAsync(username, limit);

        var combined = facebook
            .Concat(tiktok)
            .OrderByDescending(item => item.CreatedAt)
            .Take(Math.Clamp(limit * 2, 1, 100))
            .ToList();

        return Ok(combined);
    }

    [Authorize]
    [HttpPost("publish")]
    [ProducesResponseType(typeof(PublishSocialContentResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Publish([FromBody] PublishSocialContentRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Message))
        {
            return BadRequest(new ErrorResponse
            {
                Message = "Message is required."
            });
        }

        if (!request.PublishToFacebook && !request.PublishToTikTok && !request.PublishToYouTube)
        {
            return BadRequest(new ErrorResponse
            {
                Message = "Select at least one platform."
            });
        }

        var userId = User.GetUserId();
        var result = await _socialPlatformService.PublishAsync(userId, request);
        await _cacheInvalidation.InvalidateFeedAsync(HttpContext.RequestAborted);
        return Ok(result);
    }
}
