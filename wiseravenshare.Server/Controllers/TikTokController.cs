using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.Models;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public class TikTokController : ControllerBase
{
    private readonly ITikTokAggregatorService _tikTokService;
    private readonly UserStore _userStore;
    private readonly ILogger<TikTokController> _logger;

    public TikTokController(ITikTokAggregatorService tikTokService, UserStore userStore, ILogger<TikTokController> logger)
    {
        _tikTokService = tikTokService;
        _userStore = userStore;
        _logger = logger;
    }

    [HttpGet("auth-url")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public IActionResult GetAuthUrl([FromQuery] string redirectUri, [FromQuery] string? state = null)
    {
        if (string.IsNullOrWhiteSpace(redirectUri))
        {
            return BadRequest(new ErrorResponse { Message = "redirectUri is required." });
        }

        var authUrl = _tikTokService.GetAuthorizeUrl(redirectUri, state);
        return Ok(new { authUrl, scopes = "user.info.basic,video.list,video.publish,video.upload" });
    }

    [Authorize]
    [HttpPost("oauth/callback")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> HandleOAuthCallback([FromBody] TikTokCallbackRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Code) || string.IsNullOrWhiteSpace(request.RedirectUri))
        {
            return BadRequest(new ErrorResponse { Message = "Code and RedirectUri are required." });
        }

        var tokenResponse = await _tikTokService.ExchangeCodeForTokenAsync(request.Code, request.RedirectUri);
        if (tokenResponse == null || string.IsNullOrWhiteSpace(tokenResponse.AccessToken))
        {
            return BadRequest(new ErrorResponse { Message = "Failed to exchange TikTok authorization code for tokens." });
        }

        var userId = User.GetUserId().ToString();
        var userInfo = await _tikTokService.GetUserProfileAsync(tokenResponse.AccessToken);

        var hasUser = _userStore.TryGetById(userId, out var userRecord);
        var currentFeeds = hasUser && userRecord?.SocialFeeds != null ? userRecord.SocialFeeds : new SocialFeedSettings();

        currentFeeds.TikTok = new SocialFeedConnection
        {
            Enabled = true,
            Username = userInfo?.DisplayName ?? tokenResponse.OpenId ?? "TikTok Creator",
            ProfileUrl = userInfo?.OpenId != null ? $"https://www.tiktok.com/@{userInfo.OpenId}" : string.Empty,
            AccessToken = tokenResponse.AccessToken,
            RefreshToken = tokenResponse.RefreshToken ?? string.Empty,
            TokenExpiresAt = DateTimeOffset.UtcNow.AddSeconds(tokenResponse.ExpiresIn)
        };

        _userStore.UpdateSocialFeeds(userId, new UpdateSocialFeedsRequest { TikTok = currentFeeds.TikTok });

        return Ok(new
        {
            success = true,
            openId = tokenResponse.OpenId,
            userInfo,
            tokenExpiresInSeconds = tokenResponse.ExpiresIn
        });
    }

    [Authorize]
    [HttpGet("user/info")]
    [ProducesResponseType(typeof(TikTokUserInfoResultDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetUserInfo()
    {
        var userId = User.GetUserId().ToString();
        var hasUser = _userStore.TryGetById(userId, out var user);
        var accessToken = user?.SocialFeeds?.TikTok?.AccessToken;

        if (string.IsNullOrWhiteSpace(accessToken))
        {
            return BadRequest(new ErrorResponse { Message = "No active TikTok OAuth connection found. Connect your TikTok account first." });
        }

        var profile = await _tikTokService.GetUserProfileAsync(accessToken);
        if (profile == null)
        {
            return NotFound(new ErrorResponse { Message = "Failed to fetch TikTok user profile." });
        }

        return Ok(profile);
    }

    [HttpGet("videos")]
    [ProducesResponseType(typeof(TikTokVideoListResultDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetVideos(
        [FromQuery] long cursor = 0,
        [FromQuery] int maxCount = 20)
    {
        string? accessToken = null;

        if (User.Identity?.IsAuthenticated == true)
        {
            var userId = User.GetUserId().ToString();
            if (_userStore.TryGetById(userId, out var user))
            {
                accessToken = user?.SocialFeeds?.TikTok?.AccessToken;
            }
        }

        if (string.IsNullOrWhiteSpace(accessToken))
        {
            accessToken = HttpContext.Request.Headers["X-TikTok-Access-Token"].FirstOrDefault();
        }

        if (string.IsNullOrWhiteSpace(accessToken))
        {
            return BadRequest(new ErrorResponse { Message = "TikTok access token is missing. Connect account via OAuth or provide X-TikTok-Access-Token header." });
        }

        var catalog = await _tikTokService.GetVideoCatalogAsync(accessToken, cursor, maxCount);
        if (catalog == null)
        {
            return Ok(new TikTokVideoListResultDto { Videos = [], Cursor = 0, HasMore = false });
        }

        return Ok(catalog);
    }
}

public class TikTokCallbackRequest
{
    [Required]
    public string Code { get; set; } = string.Empty;

    [Required]
    public string RedirectUri { get; set; } = string.Empty;
}
