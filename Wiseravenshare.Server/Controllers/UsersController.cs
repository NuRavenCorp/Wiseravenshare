using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.Models;
using Wiseravenshare.Server.Services;
using Wiseravenshare.Server.Services.Currency;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public sealed class UsersController : ControllerBase
{
    private readonly UserStore _userStore;
    private readonly GrowthService _growthService;
    private readonly IWiseCoinService _wiseCoinService;
    private readonly ILogger<UsersController> _logger;

    public UsersController(UserStore userStore, GrowthService growthService, IWiseCoinService wiseCoinService, ILogger<UsersController> logger)
    {
        _userStore = userStore;
        _growthService = growthService;
        _wiseCoinService = wiseCoinService;
        _logger = logger;
    }

    [HttpGet("{id}")]
    public IActionResult GetById(string id)
    {
        if (!_userStore.TryGetById(id, out var user) || user is null)
        {
            return NotFound(new { message = "User not found." });
        }

        var response = UserStore.ToResponse(user);
        return Ok(new
        {
            id = response.Id,
            name = response.Name,
            handle = response.Handle,
            bio = response.Bio,
            location = response.Location,
            website = response.Website,
            avatar = response.Avatar,
            createdAt = response.CreatedAt,
            updatedAt = response.UpdatedAt,
            socialFeeds = response.SocialFeeds,
            followersCount = 0,
            followingCount = 0
        });
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateProfile(string id, [FromBody] UpdateUserProfileRequest request)
    {
        if (!CanAccessUser(id))
        {
            return Forbid();
        }

        if (request.Website is not null)
        {
            var trimmedWebsite = request.Website.Trim();
            if (trimmedWebsite.Length > 0)
            {
                var normalizedWebsite = trimmedWebsite;
                if (!normalizedWebsite.Contains("://", StringComparison.Ordinal))
                {
                    normalizedWebsite = $"https://{normalizedWebsite}";
                }

                if (!Uri.TryCreate(normalizedWebsite, UriKind.Absolute, out _))
                {
                    return BadRequest(new { message = "Website must be a valid URL." });
                }

                request.Website = normalizedWebsite;
            }
            else
            {
                request.Website = string.Empty;
            }
        }

        try
        {
            var user = _userStore.UpdateProfile(id, request);
            _growthService.TrackEvent(user.Id, user.Email, "profile_updated");
            await TryAwardProfileCompletionBadgeAsync(user);
            return Ok(UserStore.ToResponse(user));
        }
        catch (InvalidOperationException ex)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = ex.Message });
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { message = "User not found." });
        }
    }

    [HttpGet("{id}/feeds")]
    public IActionResult GetSocialFeeds(string id)
    {
        if (!CanAccessUser(id))
        {
            return Forbid();
        }

        if (!_userStore.TryGetById(id, out var user) || user is null)
        {
            return NotFound(new { message = "User not found." });
        }

        return Ok(user.SocialFeeds ?? new SocialFeedSettings());
    }

    [HttpPut("{id}/feeds")]
    public async Task<IActionResult> UpdateSocialFeeds(string id, [FromBody] UpdateSocialFeedsRequest request)
    {
        if (!CanAccessUser(id))
        {
            return Forbid();
        }

        try
        {
            var user = _userStore.UpdateSocialFeeds(id, request);
            _growthService.TrackEvent(user.Id, user.Email, "profile_updated");
            await TryAwardProfileCompletionBadgeAsync(user);
            return Ok(user.SocialFeeds);
        }
        catch (InvalidOperationException ex)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = ex.Message });
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { message = "User not found." });
        }
    }

    private bool CanAccessUser(string id)
    {
        var subjectId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        return string.Equals(subjectId, id, StringComparison.Ordinal);
    }

    private async Task TryAwardProfileCompletionBadgeAsync(UserRecord user)
    {
        try
        {
            if (!IsProfileComplete(user))
            {
                return;
            }

            if (Guid.TryParse(user.Id, out var userId))
            {
                await _wiseCoinService.AwardJobWellDoneBadgeAsync(userId, "profile_complete");
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to award profile completion badge for {UserId}", user.Id);
        }
    }

    private static bool IsProfileComplete(UserRecord user)
    {
        var socialFeeds = user.SocialFeeds;
        var hasConnectedFeed = socialFeeds is not null && (
            IsConnected(socialFeeds.TikTok) ||
            IsConnected(socialFeeds.Facebook) ||
            IsConnected(socialFeeds.Instagram) ||
            IsConnected(socialFeeds.YouTube) ||
            IsConnected(socialFeeds.Twitter) ||
            IsConnected(socialFeeds.LinkedIn) ||
            IsConnected(socialFeeds.Bluesky));

        return !string.IsNullOrWhiteSpace(user.Name)
            && !string.IsNullOrWhiteSpace(user.Bio)
            && !string.IsNullOrWhiteSpace(user.Avatar)
            && (hasConnectedFeed || !string.IsNullOrWhiteSpace(user.Location) || !string.IsNullOrWhiteSpace(user.Website));
    }

    private static bool IsConnected(SocialFeedConnection? connection)
    {
        if (connection is null)
        {
            return false;
        }

        return connection.Enabled
            || !string.IsNullOrWhiteSpace(connection.Username)
            || !string.IsNullOrWhiteSpace(connection.ProfileUrl)
            || !string.IsNullOrWhiteSpace(connection.FeedUrl);
    }
}
