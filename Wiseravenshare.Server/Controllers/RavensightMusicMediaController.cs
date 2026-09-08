using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.DTOs;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Authorize]
[Route("api/ravensight/media/music")]
public sealed class RavensightMusicMediaController : ControllerBase
{
    private readonly IMusicLibraryStore _musicLibraryStore;
    private readonly ISubscriptionService _subscriptionService;

    public RavensightMusicMediaController(IMusicLibraryStore musicLibraryStore, ISubscriptionService subscriptionService)
    {
        _musicLibraryStore = musicLibraryStore;
        _subscriptionService = subscriptionService;
    }

    [HttpGet]
    [ProducesResponseType(typeof(IReadOnlyList<UserMusicTrackDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetUserMusic(CancellationToken cancellationToken)
    {
        if (!TryResolveUserId(out var userId))
        {
            return Unauthorized(new { message = "Unable to determine current user." });
        }

        var tracks = await _musicLibraryStore.GetUserMusicAsync(userId, cancellationToken);
        return Ok(tracks);
    }

    [HttpPost("save")]
    [RequestSizeLimit(200_000_000)]
    [ProducesResponseType(typeof(RavensightSavedMediaDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> SaveMusic([FromForm] SaveRavensightMusicDto dto, CancellationToken cancellationToken)
    {
        if (dto.File is null || dto.File.Length == 0)
        {
            return BadRequest(new { message = "No music file uploaded." });
        }

        if (!TryResolveUserId(out var userId))
        {
            return Unauthorized(new { message = "Unable to determine current user." });
        }

        var userStorageIdentity = ResolveUserStorageIdentity(userId);

        var subscription = await _subscriptionService.GetSubscriptionStatusAsync(userId);
        if (!subscription.HasActiveSubscription)
        {
            return StatusCode(StatusCodes.Status402PaymentRequired, new
            {
                message = "A paid subscription is required to save music to the marketplace. Free uploads can still be previewed locally."
            });
        }

        var track = await _musicLibraryStore.SaveMusicAsync(userId, dto.File, dto, userStorageIdentity, cancellationToken);
        var mediaUrl = string.IsNullOrWhiteSpace(track.MediaUrl)
            ? StreamingUrlHelper.StreamByFileName(track.FileName)
            : track.MediaUrl;

        return Ok(new
        {
            track,
            file = new RavensightSavedMediaDto
            {
                FileName = track.FileName,
                RelativePath = string.Empty,
                DestinationFolder = dto.DestinationFolder ?? string.Empty,
                ContentType = dto.File.ContentType,
                SizeBytes = track.SizeBytes,
                SavedAtUtc = DateTime.TryParse(track.UploadedAt, out var uploadedAt)
                    ? uploadedAt.ToUniversalTime()
                    : DateTime.UtcNow,
                MediaUrl = mediaUrl
            },
            fileName = track.FileName,
            filePath = mediaUrl,
            mediaUrl
        });
    }

    private bool TryResolveUserId(out Guid userId)
    {
        var userIdRaw = User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? User.FindFirstValue("sub")
            ?? User.FindFirstValue("id");

        return Guid.TryParse(userIdRaw, out userId) && userId != Guid.Empty;
    }

    private string ResolveUserStorageIdentity(Guid userId)
    {
        var displayName = User.FindFirstValue(ClaimTypes.Name);
        var email = User.FindFirstValue(ClaimTypes.Email) ?? User.FindFirstValue("email");
        return StoragePathResolver.ResolveUserStorageIdentity(displayName, email, userId.ToString("N"));
    }
}
