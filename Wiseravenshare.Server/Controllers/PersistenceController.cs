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
    private readonly PersistenceDiagnosticsCache _diagnosticsCache;
    private readonly IConfiguration _configuration;
    private static readonly SemaphoreSlim RefreshLock = new(1, 1);

    public PersistenceController(
        UserStore userStore,
        VideoLibraryStore videoLibraryStore,
        PersistenceDiagnosticsCache diagnosticsCache,
        IConfiguration configuration)
    {
        _userStore = userStore;
        _videoLibraryStore = videoLibraryStore;
        _diagnosticsCache = diagnosticsCache;
        _configuration = configuration;
    }

    [Authorize]
    [HttpGet("status")]
    public IActionResult GetStatus([FromQuery] bool refresh = false)
    {
        if (!IsAdminRequest())
        {
            return Forbid();
        }

        if (refresh)
        {
            _ = TriggerBackgroundRefreshAsync();
        }

        var snapshot = _diagnosticsCache.GetSnapshot();
        var payload = new
        {
            users = new
            {
                snapshot.Users.DatabaseConfigured,
                snapshot.Users.DatabaseAvailable,
                snapshot.Users.RequiresDatabase,
                snapshot.Users.ActiveTable,
                snapshot.Users.LastError,
                snapshot.Users.TimedOut
            },
            videos = new
            {
                snapshot.Videos.DatabaseConfigured,
                snapshot.Videos.DatabaseAvailable,
                snapshot.Videos.RequiresDatabase,
                snapshot.Videos.ActiveTable,
                snapshot.Videos.LastError,
                snapshot.Videos.TimedOut
            },
            lastCheckedAtUtc = snapshot.LastCheckedAtUtc,
            refreshTriggered = refresh
        };

        if (snapshot.Users.RequiresDatabase && !snapshot.Users.DatabaseAvailable)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, payload);
        }

        return Ok(payload);
    }

    private async Task TriggerBackgroundRefreshAsync()
    {
        if (!await RefreshLock.WaitAsync(0))
        {
            return;
        }

        try
        {
            var timeoutSeconds = 4;
            var timeoutFromConfig = _configuration["Persistence:DiagnosticsTimeoutSeconds"];
            if (int.TryParse(timeoutFromConfig, out var parsedTimeout) && parsedTimeout > 0)
            {
                timeoutSeconds = Math.Min(parsedTimeout, 15);
            }

            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(timeoutSeconds));

            var userStatus = await Task.Run(() => _userStore.GetPersistenceStatus(), cts.Token);

            var videoAvailable = false;
            var videoTimedOut = false;
            var videoError = string.Empty;
            try
            {
                videoAvailable = await _videoLibraryStore.IsDatabasePersistenceAvailableAsync(cts.Token);
            }
            catch (OperationCanceledException)
            {
                videoTimedOut = true;
                videoError = $"Video persistence check timed out after {timeoutSeconds}s.";
            }
            catch (Exception ex)
            {
                videoError = ex.Message;
            }

            _diagnosticsCache.SetSnapshot(new PersistenceDiagnosticsSnapshot
            {
                LastCheckedAtUtc = DateTime.UtcNow,
                Users = new PersistenceDiagnosticsEntry
                {
                    DatabaseConfigured = userStatus.DatabaseConfigured,
                    DatabaseAvailable = userStatus.DatabaseAvailable,
                    RequiresDatabase = userStatus.RequiresDatabase,
                    ActiveTable = userStatus.ActiveTable,
                    LastError = userStatus.LastError,
                    TimedOut = false
                },
                Videos = new PersistenceDiagnosticsEntry
                {
                    DatabaseConfigured = !string.IsNullOrWhiteSpace(_configuration.GetConnectionString("DefaultConnection")),
                    DatabaseAvailable = videoAvailable,
                    RequiresDatabase = false,
                    ActiveTable = "app_data.ravensight_videos",
                    LastError = videoError,
                    TimedOut = videoTimedOut
                }
            });
        }
        catch (OperationCanceledException)
        {
            var snapshot = _diagnosticsCache.GetSnapshot();
            _diagnosticsCache.SetSnapshot(snapshot with
            {
                LastCheckedAtUtc = DateTime.UtcNow,
                Users = snapshot.Users with
                {
                    DatabaseAvailable = false,
                    LastError = "User persistence refresh timed out.",
                    TimedOut = true
                }
            });
        }
        catch (Exception ex)
        {
            var snapshot = _diagnosticsCache.GetSnapshot();
            _diagnosticsCache.SetSnapshot(snapshot with
            {
                LastCheckedAtUtc = DateTime.UtcNow,
                Users = snapshot.Users with
                {
                    DatabaseAvailable = false,
                    LastError = ex.Message,
                    TimedOut = false
                }
            });
        }
        finally
        {
            RefreshLock.Release();
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
