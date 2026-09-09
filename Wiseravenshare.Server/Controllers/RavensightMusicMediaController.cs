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
    private readonly IMusicPlaybackStateStore _musicPlaybackStateStore;

    public RavensightMusicMediaController(
        IMusicLibraryStore musicLibraryStore,
        IMusicPlaybackStateStore musicPlaybackStateStore)
    {
        _musicLibraryStore = musicLibraryStore;
        _musicPlaybackStateStore = musicPlaybackStateStore;
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

    [HttpGet("player-state")]
    [ProducesResponseType(typeof(MusicPlayerStateDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetPlayerState(CancellationToken cancellationToken)
    {
        if (!TryResolveUserId(out var userId))
        {
            return Unauthorized(new { message = "Unable to determine current user." });
        }

        var state = await _musicPlaybackStateStore.GetStateAsync(userId, cancellationToken);
        return Ok(state);
    }

    [HttpPut("player-state")]
    [ProducesResponseType(typeof(MusicPlayerStateDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> UpsertPlayerState(
        [FromBody] MusicPlayerStateUpsertRequest request,
        CancellationToken cancellationToken)
    {
        if (!TryResolveUserId(out var userId))
        {
            return Unauthorized(new { message = "Unable to determine current user." });
        }

        var state = await _musicPlaybackStateStore.UpsertStateAsync(userId, request, cancellationToken);
        return Ok(state);
    }

    [HttpPost("favorites/{trackId}")]
    [ProducesResponseType(typeof(MusicPlayerStateDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> AddFavorite(string trackId, CancellationToken cancellationToken)
    {
        if (!TryResolveUserId(out var userId))
        {
            return Unauthorized(new { message = "Unable to determine current user." });
        }

        var state = await _musicPlaybackStateStore.ToggleFavoriteAsync(userId, trackId, true, cancellationToken);
        return Ok(state);
    }

    [HttpDelete("favorites/{trackId}")]
    [ProducesResponseType(typeof(MusicPlayerStateDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> RemoveFavorite(string trackId, CancellationToken cancellationToken)
    {
        if (!TryResolveUserId(out var userId))
        {
            return Unauthorized(new { message = "Unable to determine current user." });
        }

        var state = await _musicPlaybackStateStore.ToggleFavoriteAsync(userId, trackId, false, cancellationToken);
        return Ok(state);
    }

    [HttpPost("history/{trackId}")]
    [ProducesResponseType(typeof(MusicPlayerStateDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> RecordHistory(
        string trackId,
        [FromQuery] double positionSeconds = 0,
        [FromQuery] bool completed = false,
        CancellationToken cancellationToken = default)
    {
        if (!TryResolveUserId(out var userId))
        {
            return Unauthorized(new { message = "Unable to determine current user." });
        }

        var state = await _musicPlaybackStateStore.AppendHistoryAsync(
            userId,
            trackId,
            positionSeconds,
            completed,
            cancellationToken);

        return Ok(state);
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
