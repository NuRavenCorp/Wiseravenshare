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

    [HttpGet("feed/bluesky")]
    [OutputCache(PolicyName = "PublicFeedShort")]
    [ProducesResponseType(typeof(IReadOnlyList<SocialFeedItemDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetBlueskyFeed([FromQuery] string? handle = null, [FromQuery] int limit = 15)
    {
        var result = await _socialPlatformService.GetBlueskyFeedAsync(handle, limit);
        return Ok(result);
    }

    [HttpGet("feed/reddit")]
    [OutputCache(PolicyName = "PublicFeedShort")]
    [ProducesResponseType(typeof(IReadOnlyList<SocialFeedItemDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetRedditFeed([FromQuery] string? subreddit = null, [FromQuery] int limit = 15)
    {
        var result = await _socialPlatformService.GetRedditFeedAsync(subreddit, limit);
        return Ok(result);
    }

    [HttpGet("feed/youtube")]
    [OutputCache(PolicyName = "PublicFeedShort")]
    [ProducesResponseType(typeof(IReadOnlyList<SocialFeedItemDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetYouTubeFeed([FromQuery] string? channel = null, [FromQuery] int limit = 15)
    {
        var result = await _socialPlatformService.GetYouTubeFeedAsync(channel, limit);
        return Ok(result);
    }

    [HttpGet("feed/rss")]
    [OutputCache(PolicyName = "PublicFeedShort")]
    [ProducesResponseType(typeof(IReadOnlyList<SocialFeedItemDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetRssFeed([FromQuery] string feedUrl, [FromQuery] int limit = 20)
    {
        if (string.IsNullOrWhiteSpace(feedUrl))
        {
            return BadRequest(new ErrorResponse { Message = "feedUrl is required." });
        }

        var result = await _socialPlatformService.GetRssFeedAsync(feedUrl, limit);
        return Ok(result);
    }

    [HttpGet("feed")]
    [HttpGet("feed/all")]
    [OutputCache(PolicyName = "PublicFeedShort")]
    [ProducesResponseType(typeof(IReadOnlyList<SocialFeedItemDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetCombinedFeed(
        [FromQuery] string? pageId = null,
        [FromQuery] string? username = null,
        [FromQuery] string? blueskyHandle = null,
        [FromQuery] string? subreddit = null,
        [FromQuery] string? youtubeChannel = null,
        [FromQuery] string? rssFeedUrl = null,
        [FromQuery] string? query = null,
        [FromQuery] int limit = 20)
    {
        var unified = await _socialPlatformService.GetUnifiedFeedAsync(
            pageId,
            username,
            blueskyHandle,
            subreddit,
            youtubeChannel,
            rssFeedUrl,
            query,
            limit);

        return Ok(unified);
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

        if (!request.PublishToFacebook && !request.PublishToTikTok && !request.PublishToYouTube && !request.PublishToBluesky)
        {
            return BadRequest(new ErrorResponse
            {
                Message = "Select at least one destination platform."
            });
        }

        var resolvedMediaType = (request.MediaType ?? "auto").Trim().ToLowerInvariant();
        var isVideoShare = resolvedMediaType == "video"
            || (resolvedMediaType == "auto" && !string.IsNullOrWhiteSpace(request.VideoUrl));

        if (isVideoShare && request.PublishToTikTok && string.IsNullOrWhiteSpace(request.VideoUrl))
        {
            return BadRequest(new ErrorResponse
            {
                Message = "TikTok sharing requires a public videoUrl."
            });
        }

        var userId = User.GetUserId();
        var result = await _socialPlatformService.PublishAsync(userId, request);
        await _cacheInvalidation.InvalidateFeedAsync(HttpContext.RequestAborted);
        return Ok(result);
    }
}
