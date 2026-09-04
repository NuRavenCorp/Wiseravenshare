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

    [HttpGet("providers/status")]
    [ProducesResponseType(typeof(IReadOnlyList<SocialProviderStatusDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetProviderStatus()
    {
        var status = await _socialPlatformService.GetProviderStatusesAsync();
        return Ok(status);
    }

    [HttpGet("feed/bluesky")]
    [OutputCache(PolicyName = "PublicFeedShort")]
    [ProducesResponseType(typeof(IReadOnlyList<SocialFeedItemDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetBlueskyFeed([FromQuery] string? handle = null, [FromQuery] int limit = 10)
    {
        var result = await _socialPlatformService.GetBlueskyFeedAsync(handle, limit);
        return Ok(result);
    }

    [HttpGet("feed")]
    [OutputCache(PolicyName = "PublicFeedShort")]
    [ProducesResponseType(typeof(IReadOnlyList<SocialFeedItemDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetCombinedFeed(
        [FromQuery] string? pageId = null,
        [FromQuery] string? username = null,
        [FromQuery] string? blueskyHandle = null,
        [FromQuery] int limit = 10)
    {
        var facebookTask = _socialPlatformService.GetFacebookFeedAsync(pageId, limit);
        var tiktokTask = _socialPlatformService.GetTikTokFeedAsync(username, limit);
        var blueskyTask = _socialPlatformService.GetBlueskyFeedAsync(blueskyHandle, limit);
        await Task.WhenAll(facebookTask, tiktokTask, blueskyTask);
        var facebook = facebookTask.Result;
        var tiktok = tiktokTask.Result;
        var bluesky = blueskyTask.Result;

        var combined = facebook
            .Concat(tiktok)
            .Concat(bluesky)
            .OrderByDescending(item => item.CreatedAt)
            .Take(Math.Clamp(limit * 3, 1, 150))
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

        var resolvedMediaType = (request.MediaType ?? "auto").Trim().ToLowerInvariant();
        var isVideoShare = resolvedMediaType == "video"
            || (resolvedMediaType == "auto" && !string.IsNullOrWhiteSpace(request.VideoUrl));

        // TikTok and YouTube only accept video payloads; keep the request valid when they are unchecked for photo/text shares.
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
