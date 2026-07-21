using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.Models;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public sealed class UsersController : ControllerBase
{
    private readonly UserStore _userStore;

    public UsersController(UserStore userStore)
    {
        _userStore = userStore;
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
    public IActionResult UpdateProfile(string id, [FromBody] UpdateUserProfileRequest request)
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
            return Ok(UserStore.ToResponse(user));
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
    public IActionResult UpdateSocialFeeds(string id, [FromBody] UpdateSocialFeedsRequest request)
    {
        if (!CanAccessUser(id))
        {
            return Forbid();
        }

        try
        {
            var user = _userStore.UpdateSocialFeeds(id, request);
            return Ok(user.SocialFeeds);
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
}
