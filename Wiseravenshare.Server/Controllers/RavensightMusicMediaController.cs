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
    private readonly IRavensightMusicService _musicService;
    private readonly RavensightMediaCatalogStore _mediaCatalogStore;

    public RavensightMusicMediaController(IRavensightMusicService musicService, RavensightMediaCatalogStore mediaCatalogStore)
    {
        _musicService = musicService;
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

        var assets = await _mediaCatalogStore.GetUserAssetsByTypeAsync(userId, "music", cancellationToken);
        
        var tracks = assets.Select(asset => 
        {
            var metadata = ParseMetadata(asset.MetadataJson);
            return new UserMusicTrackDto
            {
                Id = asset.Id,
                Title = metadata?.TryGetProperty("title", out var titleEl) == true ? titleEl.GetString() ?? "Untitled" : "Untitled",
                Artist = metadata?.TryGetProperty("artist", out var artistEl) == true ? artistEl.GetString() ?? "" : "",
                Album = metadata?.TryGetProperty("album", out var albumEl) == true ? albumEl.GetString() ?? "" : "",
                Genre = metadata?.TryGetProperty("genre", out var genreEl) == true ? genreEl.GetString() ?? "" : "",
                Fingerprint = metadata?.TryGetProperty("fingerprint", out var fpEl) == true ? fpEl.GetString() : null,
                MediaUrl = $"{Request.Scheme}://{Request.Host}/api/videostreaming/stream?fileName={Uri.EscapeDataString(asset.FileName)}",
                FileName = asset.FileName,
                UploadedAt = asset.SavedAtUtc.ToString("O"),
                SizeBytes = asset.SizeBytes
            };
        }).ToList();

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

        var saved = await _musicService.SaveMusicAsync(dto.File, dto.DestinationFolder, cancellationToken);
        var preference = await _mediaCatalogStore.GetUserPreferenceAsync(userId, cancellationToken);
        
        // Include fingerprint in metadata
        var metadataDict = new Dictionary<string, object?>
        {
            ["title"] = dto.Title,
            ["artist"] = dto.Artist,
            ["album"] = dto.Album,
            ["genre"] = dto.Genre
        };
        
        if (!string.IsNullOrWhiteSpace(dto.Fingerprint))
        {
            metadataDict["fingerprint"] = dto.Fingerprint;
        }

        var mediaRecord = await _mediaCatalogStore.CreateAssetAsync(new CreateRavensightMediaAssetRequest
        {
            UserId = userId,
            MediaType = RavensightMediaType.Music,
            FileName = saved.FileName,
            RelativePath = saved.RelativePath,
            PublicUrl = saved.PublicUrl,
            AbsolutePath = saved.AbsolutePath,
            DestinationFolder = saved.DestinationFolder,
            ContentType = saved.ContentType,
            SizeBytes = saved.SizeBytes,
            SavedAtUtc = saved.SavedAtUtc,
            MetadataJson = JsonSerializer.Serialize(metadataDict)
        }, cancellationToken);

        var response = new RavensightSavedMediaDto
        {
            FileName = saved.FileName,
            RelativePath = saved.RelativePath,
            DestinationFolder = saved.DestinationFolder,
            ContentType = saved.ContentType,
            SizeBytes = saved.SizeBytes,
            SavedAtUtc = saved.SavedAtUtc,
            MediaUrl = $"{Request.Scheme}://{Request.Host}/api/videostreaming/stream?fileName={Uri.EscapeDataString(saved.FileName)}"
        };

        return Ok(new
        {
            file = response,
            meta = new
            {
                title = dto.Title,
                artist = dto.Artist,
                album = dto.Album,
                genre = dto.Genre
            },
            mediaAssetId = mediaRecord.Id,
            retention = new
            {
                days = VideoRetentionPolicy.TemporaryRetentionDays,
                expiresAtUtc = mediaRecord.ExpiresAtUtc,
                warning = $"This Ravensight server copy will auto-delete in {VideoRetentionPolicy.TemporaryRetentionDays} days unless you save it to your local Ravensight folder.",
                localFolderPermissionGranted = preference?.LocalFolderPermissionGranted ?? false,
                localFolderIdentityKey = preference?.FolderIdentityKey
            }
        });
    }

    private bool TryResolveUserId(out Guid userId)
    {
        var userIdRaw = User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? User.FindFirstValue("sub")
            ?? User.FindFirstValue("id");

        return Guid.TryParse(userIdRaw, out userId) && userId != Guid.Empty;
    }

    private static JsonElement? ParseMetadata(string metadataJson)
    {
        if (string.IsNullOrWhiteSpace(metadataJson)) return null;
        try
        {
            var doc = JsonDocument.Parse(metadataJson);
            return doc.RootElement;
        }
        catch { return null; }
    }
}
