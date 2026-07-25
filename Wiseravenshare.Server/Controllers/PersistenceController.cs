using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using System.Security.Claims;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
public sealed class PersistenceController : ControllerBase
{
    private readonly UserStore _userStore;
    private readonly VideoLibraryStore _videoLibraryStore;
    private readonly IConfiguration _configuration;

    public PersistenceController(UserStore userStore, VideoLibraryStore videoLibraryStore, IConfiguration configuration)
    {
        _userStore = userStore;
        _videoLibraryStore = videoLibraryStore;
        _configuration = configuration;
    }

    [Authorize]
    [HttpGet("status")]
    public async Task<IActionResult> GetStatus()
    {
        if (!IsAdminRequest())
        {
            return Forbid();
        }

        var userStatus = _userStore.GetPersistenceStatus();
        var videoPersistenceAvailable = await _videoLibraryStore.IsDatabasePersistenceAvailableAsync();

        var payload = new
        {
            users = new
            {
                userStatus.DatabaseConfigured,
                userStatus.DatabaseAvailable,
                userStatus.RequiresDatabase,
                userStatus.ActiveTable,
                userStatus.LastError
            },
            videos = new
            {
                DatabaseAvailable = videoPersistenceAvailable
            }
        };

        if (userStatus.RequiresDatabase && !userStatus.DatabaseAvailable)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, payload);
        }

        return Ok(payload);
    }

    private bool IsAdminRequest()
    {
        var email = User.FindFirstValue(ClaimTypes.Email)
            ?? User.FindFirstValue("email")
            ?? string.Empty;

        if (string.IsNullOrWhiteSpace(email))
        {
            return false;
        }

        var configuredAdminEmails = _configuration.GetSection("Admin:Emails").Get<string[]>() ?? [];
        if (configuredAdminEmails.Any(value => string.Equals(value?.Trim(), email, StringComparison.OrdinalIgnoreCase)))
        {
            return true;
        }

        var configuredAuthUsers = _configuration.GetSection("Authentication:Users").GetChildren()
            .Select(section => section["Email"]?.Trim())
            .Where(value => !string.IsNullOrWhiteSpace(value));

        return configuredAuthUsers.Any(value => string.Equals(value, email, StringComparison.OrdinalIgnoreCase));
    }
}
