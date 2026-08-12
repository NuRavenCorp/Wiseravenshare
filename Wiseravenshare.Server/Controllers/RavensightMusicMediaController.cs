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
            MetadataJson = JsonSerializer.Serialize(new
            {
                title = dto.Title,
                artist = dto.Artist,
                album = dto.Album,
                genre = dto.Genre
            })
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
}
