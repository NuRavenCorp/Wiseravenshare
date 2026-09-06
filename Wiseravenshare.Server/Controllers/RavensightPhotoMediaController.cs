using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using Wiseravenshare.Server.DTOs;
using Wiseravenshare.Server.Models;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Authorize]
[Route("api/ravensight/media/photos")]
public sealed class RavensightPhotoMediaController : ControllerBase
{
    private readonly IRavensightPhotoService _photoService;
    private readonly RavensightMediaCatalogStore _mediaCatalogStore;
    private readonly ILogger<RavensightPhotoMediaController> _logger;

    public RavensightPhotoMediaController(
        IRavensightPhotoService photoService,
        RavensightMediaCatalogStore mediaCatalogStore,
        ILogger<RavensightPhotoMediaController> logger)
    {
        _photoService = photoService;
        _mediaCatalogStore = mediaCatalogStore;
        _logger = logger;
    }

    [HttpPost("save")]
    [RequestSizeLimit(100_000_000)]
    [ProducesResponseType(typeof(RavensightSavedMediaDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> SavePhoto([FromForm] SaveRavensightPhotoDto dto, CancellationToken cancellationToken)
    {
        if (dto.File is null || dto.File.Length == 0)
        {
            return BadRequest(new { message = "No photo file uploaded." });
        }

        if (!TryResolveUserId(out var userId))
        {
            return Unauthorized(new { message = "Unable to determine current user." });
        }

        var saved = await _photoService.SavePhotoAsync(dto.File, dto.DestinationFolder, cancellationToken);
        RavensightMediaUserPreference? preference = null;
        RavensightMediaAssetRecord? mediaRecord = null;
        var persistenceStatus = "ready";

        try
        {
            preference = await _mediaCatalogStore.GetUserPreferenceAsync(userId, cancellationToken);
            mediaRecord = await _mediaCatalogStore.CreateAssetAsync(new CreateRavensightMediaAssetRequest
            {
                UserId = userId,
                MediaType = RavensightMediaType.Photo,
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
                    caption = dto.Caption
                })
            }, cancellationToken);
        }
        catch (PostgresException ex)
        {
            persistenceStatus = "degraded";
            _logger.LogError(ex, "Photo catalog save failed at DB layer for user {UserId}; returning file response without catalog metadata.", userId);
        }
        catch (Exception ex)
        {
            persistenceStatus = "degraded";
            _logger.LogError(ex, "Photo catalog save failed unexpectedly for user {UserId}; returning file response without catalog metadata.", userId);
        }

        var blobStreamUrl = BuildBlobStreamUrl(saved.RelativePath);
        var mediaUrl = !string.IsNullOrWhiteSpace(saved.PublicUrl)
            ? saved.PublicUrl
            : !string.IsNullOrWhiteSpace(blobStreamUrl)
                ? blobStreamUrl
                : $"{Request.Scheme}://{Request.Host}/api/videostreaming/stream?fileName={Uri.EscapeDataString(saved.FileName)}";

        var response = new RavensightSavedMediaDto
        {
            FileName = saved.FileName,
            RelativePath = saved.RelativePath,
            DestinationFolder = saved.DestinationFolder,
            ContentType = saved.ContentType,
            SizeBytes = saved.SizeBytes,
            SavedAtUtc = saved.SavedAtUtc,
            MediaUrl = mediaUrl
        };

        return Ok(new
        {
            file = response,
            fileName = response.FileName,
            filePath = response.MediaUrl,
            mediaUrl = response.MediaUrl,
            caption = dto.Caption,
            persistenceStatus,
            mediaAssetId = mediaRecord?.Id,
            retention = new
            {
                days = VideoRetentionPolicy.TemporaryRetentionDays,
                expiresAtUtc = mediaRecord?.ExpiresAtUtc,
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

    private string BuildBlobStreamUrl(string? relativePath)
    {
        var normalized = string.IsNullOrWhiteSpace(relativePath)
            ? string.Empty
            : relativePath.Replace('\\', '/').Trim('/');
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return string.Empty;
        }

        var encodedPath = string.Join('/',
            normalized
                .Split('/', StringSplitOptions.RemoveEmptyEntries)
                .Select(Uri.EscapeDataString));
        return $"{Request.Scheme}://{Request.Host}/api/videostreaming/blob/{encodedPath}";
    }
}
