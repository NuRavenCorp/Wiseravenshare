using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.DTOs;
using Wiseravenshare.Server.Models;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Authorize]
[Route("api/ravensight/media/music")]
public sealed class RavensightMusicMediaController : ControllerBase
{
    private readonly IMusicLibraryStore _musicLibraryStore;
    private readonly IMusicPlaybackStateStore _musicPlaybackStateStore;
    private readonly RavensightMediaCatalogStore _mediaCatalogStore;

    public RavensightMusicMediaController(
        IMusicLibraryStore musicLibraryStore,
        IMusicPlaybackStateStore musicPlaybackStateStore,
        RavensightMediaCatalogStore mediaCatalogStore)
    {
        _musicLibraryStore = musicLibraryStore;
        _musicPlaybackStateStore = musicPlaybackStateStore;
        _mediaCatalogStore = mediaCatalogStore;
    }

    [HttpGet]
    [ProducesResponseType(typeof(IReadOnlyList<UserMusicTrackDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetUserMusic(CancellationToken cancellationToken)
    {
        if (!TryResolveUserId(out var userId))
        {
            return Unauthorized(new { message = "Unable to determine current user." });
        }

        var bucketTracks = await _musicLibraryStore.GetUserMusicAsync(userId, cancellationToken);
        var bucketFileNames = new HashSet<string>(bucketTracks.Select(t => t.FileName), StringComparer.OrdinalIgnoreCase);

        IEnumerable<UserMusicTrackDto> catalogTracks = [];
        try
        {
            var catalogAssets = await _mediaCatalogStore.GetUserAssetsAsync(userId, "music", 200, cancellationToken);
            catalogTracks = catalogAssets
                .Where(a => !bucketFileNames.Contains(a.FileName))
                .Select(a => new UserMusicTrackDto
                {
                    Id = a.Id,
                    Title = ReadMusicMeta(a.MetadataJson, "title") is { Length: > 0 } t
                        ? t
                        : System.IO.Path.GetFileNameWithoutExtension(a.FileName),
                    Artist = ReadMusicMeta(a.MetadataJson, "artist"),
                    Album = ReadMusicMeta(a.MetadataJson, "album"),
                    Genre = ReadMusicMeta(a.MetadataJson, "genre"),
                    MediaUrl = StreamingUrlHelper.ResolveMediaUrl(
                        a.PublicUrl,
                        StreamingUrlHelper.StreamByFileName(a.FileName)),
                    FileName = a.FileName,
                    UploadedAt = a.SavedAtUtc.ToString("O"),
                    SizeBytes = a.SizeBytes
                });
        }
        catch
        {
            // Catalog unavailable — serve what bucket has
        }

        return Ok(bucketTracks.Concat(catalogTracks).ToList());
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

        // Mirror to the unified media catalog so GetUserMusic can always find it.
        var savedAtUtc = DateTime.TryParse(track.UploadedAt, out var uploadedAt) ? uploadedAt.ToUniversalTime() : DateTime.UtcNow;
        try
        {
            await _mediaCatalogStore.CreateAssetAsync(new CreateRavensightMediaAssetRequest
            {
                UserId = userId,
                MediaType = RavensightMediaType.Music,
                FileName = track.FileName,
                RelativePath = track.FileName,
                PublicUrl = mediaUrl.StartsWith("/", StringComparison.Ordinal) ? null : mediaUrl,
                AbsolutePath = string.Empty,
                DestinationFolder = dto.DestinationFolder ?? string.Empty,
                ContentType = dto.File.ContentType,
                SizeBytes = track.SizeBytes,
                SavedAtUtc = savedAtUtc,
                MetadataJson = JsonSerializer.Serialize(new
                {
                    title = track.Title,
                    artist = track.Artist,
                    album = track.Album,
                    genre = track.Genre,
                    fingerprint = track.Fingerprint,
                    mediaUrl
                })
            }, cancellationToken);
        }
        catch (Exception ex)
        {
            // Catalog write is best-effort; bucket_objects already has the record.
            HttpContext.RequestServices
                .GetService<ILogger<RavensightMusicMediaController>>()
                ?.LogWarning(ex, "Music catalog entry failed for user {UserId}; track saved in bucket store.", userId);
        }

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
                SavedAtUtc = savedAtUtc,
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

    private static string ReadMusicMeta(string? metadataJson, string key)
    {
        if (string.IsNullOrWhiteSpace(metadataJson)) return string.Empty;
        try
        {
            using var doc = JsonDocument.Parse(metadataJson);
            if (doc.RootElement.TryGetProperty(key, out var val) && val.ValueKind == JsonValueKind.String)
                return val.GetString() ?? string.Empty;
        }
        catch { /* ignore */ }
        return string.Empty;
    }
}
