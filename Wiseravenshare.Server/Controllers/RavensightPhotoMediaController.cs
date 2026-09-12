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
    private readonly IBlobStorageService _blobStorageService;
    private readonly ILogger<RavensightPhotoMediaController> _logger;

    public RavensightPhotoMediaController(
        IRavensightPhotoService photoService,
        RavensightMediaCatalogStore mediaCatalogStore,
        IBlobStorageService blobStorageService,
        ILogger<RavensightPhotoMediaController> logger)
    {
        _photoService = photoService;
        _mediaCatalogStore = mediaCatalogStore;
        _blobStorageService = blobStorageService;
        _logger = logger;
    }

    [HttpGet]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetUserPhotos(
        [FromQuery] int limit = 100,
        CancellationToken cancellationToken = default)
    {
        if (!TryResolveUserId(out var userId))
            return Unauthorized(new { message = "Unable to determine current user." });

        var assets = await _mediaCatalogStore.GetUserAssetsAsync(userId, "photo", limit, cancellationToken);

        var photos = assets.Select(a => new
        {
            id = a.Id,
            title = a.FileName,
            fileName = a.FileName,
            relativePath = a.RelativePath,
            objectKey = a.RelativePath,
            description = (string?)null,
            imageUrl = StreamingUrlHelper.ResolveMediaUrl(
                a.PublicUrl,
                StreamingUrlHelper.StreamByBlobPath(a.RelativePath)
                    ?? StreamingUrlHelper.StreamByFileName(a.FileName)),
            thumbnailUrl = StreamingUrlHelper.ResolveMediaUrl(
                a.PublicUrl,
                StreamingUrlHelper.StreamByBlobPath(a.RelativePath)
                    ?? StreamingUrlHelper.StreamByFileName(a.FileName)),
            mediaUrl = StreamingUrlHelper.ResolveMediaUrl(
                a.PublicUrl,
                StreamingUrlHelper.StreamByBlobPath(a.RelativePath)
                    ?? StreamingUrlHelper.StreamByFileName(a.FileName)),
            uploadedAt = a.SavedAtUtc.ToString("O"),
            createdAt = a.SavedAtUtc.ToString("O"),
            type = "photo"
        }).ToList();

        return Ok(new { data = photos, total = photos.Count });
    }

    [HttpDelete("{photoId}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DeletePhoto([FromRoute] string photoId, CancellationToken cancellationToken = default)
    {
        if (!TryResolveUserId(out var userId))
        {
            return Unauthorized(new { message = "Unable to determine current user." });
        }

        var normalizedPhotoId = string.IsNullOrWhiteSpace(photoId) ? string.Empty : photoId.Trim();
        if (string.IsNullOrWhiteSpace(normalizedPhotoId))
        {
            return BadRequest(new { message = "photoId is required." });
        }

        var asset = await _mediaCatalogStore.GetUserAssetByIdAsync(userId, normalizedPhotoId, cancellationToken);
        if (asset is null || !string.Equals(asset.MediaType, "photo", StringComparison.OrdinalIgnoreCase))
        {
            return NotFound(new { message = "Photo not found." });
        }

        var blobDeleted = false;
        var localDeleted = false;
        var objectKey = string.IsNullOrWhiteSpace(asset.RelativePath)
            ? _blobStorageService.ResolveObjectKey(asset.PublicUrl ?? string.Empty)
            : asset.RelativePath;

        if (!string.IsNullOrWhiteSpace(objectKey))
        {
            try
            {
                blobDeleted = await _blobStorageService.DeleteAsync(objectKey, cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to delete blob for photo asset {PhotoId}", normalizedPhotoId);
            }
        }

        if (!string.IsNullOrWhiteSpace(asset.AbsolutePath) && System.IO.File.Exists(asset.AbsolutePath))
        {
            try
            {
                System.IO.File.Delete(asset.AbsolutePath);
                localDeleted = true;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to delete local file for photo asset {PhotoId}", normalizedPhotoId);
            }
        }

        await _mediaCatalogStore.MarkAssetDeletedAsync(asset.Id, DateTime.UtcNow, cancellationToken);

        return Ok(new
        {
            success = true,
            id = asset.Id,
            blobDeleted,
            localDeleted,
            objectKey
        });
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

        var userStorageIdentity = ResolveUserStorageIdentity(userId);
        // Force user-scoped library path: users/{userStorageIdentity}/media/photos
        var libraryDestination = $"users/{userStorageIdentity}/media/photos";
        var resolved = string.IsNullOrWhiteSpace(dto.DestinationFolder)
            ? libraryDestination
            : StoragePathResolver.EnsureUserScopedDestination(dto.DestinationFolder, userStorageIdentity);
        var saved = await _photoService.SavePhotoAsync(dto.File, resolved, userStorageIdentity, cancellationToken);
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

        var blobStreamUrl = StreamingUrlHelper.StreamByBlobPath(saved.RelativePath);
        var mediaUrl = StreamingUrlHelper.ResolveMediaUrl(
            saved.PublicUrl,
            !string.IsNullOrWhiteSpace(blobStreamUrl)
                ? blobStreamUrl
                : StreamingUrlHelper.StreamByFileName(saved.FileName));

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
                days = (int?)null,
                expiresAtUtc = mediaRecord?.ExpiresAtUtc,
                warning = (string?)null,
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

    private string ResolveUserStorageIdentity(Guid userId)
    {
        var displayName = User.FindFirstValue(ClaimTypes.Name);
        var email = User.FindFirstValue(ClaimTypes.Email) ?? User.FindFirstValue("email");
        return StoragePathResolver.ResolveUserStorageIdentity(displayName, email, userId.ToString("N"));
    }
}
