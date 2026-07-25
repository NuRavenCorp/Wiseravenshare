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

        var timeoutSeconds = 4;
        var timeoutFromConfig = _configuration["Persistence:DiagnosticsTimeoutSeconds"];
        if (int.TryParse(timeoutFromConfig, out var parsedTimeout) && parsedTimeout > 0)
        {
            timeoutSeconds = Math.Min(parsedTimeout, 15);
        }

        var userCheck = await TryGetUserStatusWithTimeoutAsync(timeoutSeconds);
        var videoCheck = await TryGetVideoStatusWithTimeoutAsync(timeoutSeconds, HttpContext.RequestAborted);

        var userStatus = userCheck.Status;
        var userLastError = string.IsNullOrWhiteSpace(userStatus.LastError) ? string.Empty : userStatus.LastError;
        if (userCheck.TimedOut)
        {
            userLastError = string.IsNullOrWhiteSpace(userLastError)
                ? $"User persistence check timed out after {timeoutSeconds}s."
                : $"{userLastError} (timed out after {timeoutSeconds}s)";
        }

        var payload = new
        {
            users = new
            {
                userStatus.DatabaseConfigured,
                userStatus.DatabaseAvailable,
                userStatus.RequiresDatabase,
                userStatus.ActiveTable,
                LastError = userLastError,
                TimedOut = userCheck.TimedOut
            },
            videos = new
            {
                DatabaseAvailable = videoCheck.DatabaseAvailable,
                LastError = videoCheck.LastError,
                TimedOut = videoCheck.TimedOut
            }
        };

        if (userStatus.RequiresDatabase && !userStatus.DatabaseAvailable)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, payload);
        }

        return Ok(payload);
    }

    private async Task<(UserPersistenceStatus Status, bool TimedOut)> TryGetUserStatusWithTimeoutAsync(int timeoutSeconds)
    {
        var statusTask = Task.Run(() => _userStore.GetPersistenceStatus());
        var completedTask = await Task.WhenAny(statusTask, Task.Delay(TimeSpan.FromSeconds(timeoutSeconds)));
        if (completedTask == statusTask)
        {
            return (await statusTask, false);
        }

        var fallback = new UserPersistenceStatus
        {
            DatabaseConfigured = true,
            DatabaseAvailable = false,
            RequiresDatabase = true,
            ActiveTable = "unknown",
            LastError = string.Empty
        };

        return (fallback, true);
    }

    private async Task<(bool DatabaseAvailable, string LastError, bool TimedOut)> TryGetVideoStatusWithTimeoutAsync(int timeoutSeconds, CancellationToken requestAborted)
    {
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(requestAborted);
        cts.CancelAfter(TimeSpan.FromSeconds(timeoutSeconds));

        try
        {
            var available = await _videoLibraryStore.IsDatabasePersistenceAvailableAsync(cts.Token);
            return (available, string.Empty, false);
        }
        catch (OperationCanceledException)
        {
            return (false, $"Video persistence check timed out after {timeoutSeconds}s.", true);
        }
        catch (Exception ex)
        {
            return (false, ex.Message, false);
        }
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
