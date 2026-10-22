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
    private readonly IMediaBlobSignatureService _signatureService;
    private readonly ILogger<RavensightPhotoMediaController> _logger;

    public RavensightPhotoMediaController(
        IRavensightPhotoService photoService,
        RavensightMediaCatalogStore mediaCatalogStore,
        IBlobStorageService blobStorageService,
        IMediaBlobSignatureService signatureService,
        ILogger<RavensightPhotoMediaController> logger)
    {
        _photoService = photoService;
        _mediaCatalogStore = mediaCatalogStore;
        _blobStorageService = blobStorageService;
        _signatureService = signatureService;
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
            title = ReadMetadataString(a.MetadataJson, "caption", a.FileName),
            fileName = a.FileName,
            relativePath = a.RelativePath,
            objectKey = a.RelativePath,
            caption = ReadMetadataString(a.MetadataJson, "caption", string.Empty),
            description = ReadMetadataString(a.MetadataJson, "caption", string.Empty),
            imageUrl = AppendBlobSignatureIfNeeded(
                StreamingUrlHelper.ResolveMediaUrl(
                    a.PublicUrl,
                    StreamingUrlHelper.StreamByBlobPath(a.RelativePath)
                        ?? StreamingUrlHelper.StreamByFileName(a.FileName)),
                a.RelativePath),
            thumbnailUrl = AppendBlobSignatureIfNeeded(
                StreamingUrlHelper.ResolveMediaUrl(
                    a.PublicUrl,
                    StreamingUrlHelper.StreamByBlobPath(a.RelativePath)
                        ?? StreamingUrlHelper.StreamByFileName(a.FileName)),
                a.RelativePath),
            mediaUrl = AppendBlobSignatureIfNeeded(
                StreamingUrlHelper.ResolveMediaUrl(
                    a.PublicUrl,
                    StreamingUrlHelper.StreamByBlobPath(a.RelativePath)
                        ?? StreamingUrlHelper.StreamByFileName(a.FileName)),
                a.RelativePath),
            archived = ReadMetadataBool(a.MetadataJson, "archived"),
            @protected = ReadMetadataBool(a.MetadataJson, "protected"),
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

    [HttpPatch("{photoId}/state")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> UpdatePhotoState(
        [FromRoute] string photoId,
        [FromBody] UpdateRavensightMediaStateRequest request,
        CancellationToken cancellationToken = default)
    {
        if (!TryResolveUserId(out var userId))
        {
            return Unauthorized(new { message = "Unable to determine current user." });
        }

        if (string.IsNullOrWhiteSpace(photoId))
        {
            return BadRequest(new { message = "photoId is required." });
        }

        var updated = await _mediaCatalogStore.UpdateAssetStateAsync(
            userId,
            photoId.Trim(),
            request.Archived ?? false,
            request.Protected ?? false,
            cancellationToken);

        if (!updated)
        {
            return NotFound(new { message = "Photo not found." });
        }

        return Ok(new { success = true, archived = request.Archived ?? false, @protected = request.Protected ?? false });
    }

    [HttpPost("save")]
    [RequestSizeLimit(100_000_000)]
    [RequestFormLimits(MultipartBodyLengthLimit = 100_000_000)]
    [ProducesResponseType(typeof(RavensightSavedMediaDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> SavePhoto([FromForm] SaveRavensightPhotoDto dto, CancellationToken cancellationToken)
    {
        if (!Request.HasFormContentType)
        {
            return BadRequest(new { message = "Expected multipart/form-data upload payload." });
        }

        var file = dto.File;
        if (file is null || file.Length == 0)
        {
            try
            {
                file = Request.Form.Files.FirstOrDefault(f =>
                    string.Equals(f.Name, "file", StringComparison.OrdinalIgnoreCase)
                    || string.Equals(f.Name, "File", StringComparison.OrdinalIgnoreCase));
            }
            catch (InvalidDataException ex)
            {
                _logger.LogWarning(ex, "Invalid multipart payload while saving photo.");
                return BadRequest(new { message = "Invalid upload payload. Retry with a valid multipart/form-data request." });
            }
        }
        if (file is null || file.Length == 0)
        {
            try
            {
                file = Request.Form.Files.FirstOrDefault();
            }
            catch (InvalidDataException ex)
            {
                _logger.LogWarning(ex, "Invalid multipart payload while reading fallback photo file.");
                return BadRequest(new { message = "Invalid upload payload. Retry with a valid multipart/form-data request." });
            }
        }

        if (file is null || file.Length == 0)
        {
            return BadRequest(new { message = "No photo file uploaded. Ensure the multipart field is named 'file'." });
        }

        dto.File ??= file;

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
        RavensightSavedMediaFile saved;
        try
        {
            saved = await _photoService.SavePhotoAsync(dto.File, resolved, userStorageIdentity, cancellationToken);
        }
        catch (InvalidOperationException ex)
        {
            _logger.LogWarning(ex, "Photo upload rejected for user {UserId}.", userId);
            return BadRequest(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Photo binary save failed for user {UserId}.", userId);
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new
            {
                message = "Photo upload is temporarily unavailable. Please try again."
            });
        }
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
                    caption = dto.Caption,
                    archived = false,
                    @protected = false
                })
            }, cancellationToken);
        }
        catch (PostgresException ex)
        {
            persistenceStatus = "degraded";
            _logger.LogError(ex, "Photo catalog save failed at DB layer for user {UserId}; upload cannot be retained without metadata persistence.", userId);
        }
        catch (Exception ex)
        {
            persistenceStatus = "degraded";
            _logger.LogError(ex, "Photo catalog save failed unexpectedly for user {UserId}; upload cannot be retained without metadata persistence.", userId);
        }

        if (mediaRecord is null)
        {
            await CleanupFailedUploadAsync(saved, cancellationToken);
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new
            {
                message = "Photo upload could not be persisted. Please retry shortly."
            });
        }

        var blobStreamUrl = StreamingUrlHelper.StreamByBlobPath(saved.RelativePath);
        var mediaUrl = StreamingUrlHelper.ResolveMediaUrl(
            saved.PublicUrl,
            !string.IsNullOrWhiteSpace(blobStreamUrl)
                ? blobStreamUrl
                : StreamingUrlHelper.StreamByFileName(saved.FileName));
        mediaUrl = AppendBlobSignatureIfNeeded(mediaUrl, saved.RelativePath);

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

    private async Task CleanupFailedUploadAsync(RavensightSavedMediaFile saved, CancellationToken cancellationToken)
    {
        try
        {
            if (!string.IsNullOrWhiteSpace(saved.RelativePath))
            {
                await _blobStorageService.DeleteAsync(saved.RelativePath, cancellationToken);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to clean up blob object {ObjectKey} after photo metadata persistence failure.", saved.RelativePath);
        }

        if (!string.IsNullOrWhiteSpace(saved.AbsolutePath) && System.IO.File.Exists(saved.AbsolutePath))
        {
            try
            {
                System.IO.File.Delete(saved.AbsolutePath);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to clean up local file {Path} after photo metadata persistence failure.", saved.AbsolutePath);
            }
        }
    }

    private string AppendBlobSignatureIfNeeded(string streamPath, string? relativePath)
    {
        if (string.IsNullOrWhiteSpace(streamPath)
            || !streamPath.StartsWith("/api/media/blob/", StringComparison.OrdinalIgnoreCase))
        {
            return streamPath;
        }

        var objectKey = (relativePath ?? string.Empty).Replace('\\', '/').Trim('/');
        if (string.IsNullOrWhiteSpace(objectKey))
        {
            return streamPath;
        }

        var signature = _signatureService.SignKey(objectKey);
        if (string.IsNullOrWhiteSpace(signature))
        {
            return streamPath;
        }

        var separator = streamPath.Contains('?') ? "&" : "?";
        return $"{streamPath}{separator}sig={Uri.EscapeDataString(signature)}";
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

    private static bool ReadMetadataBool(string? metadataJson, string key)
    {
        if (string.IsNullOrWhiteSpace(metadataJson))
        {
            return false;
        }

        try
        {
            using var doc = JsonDocument.Parse(metadataJson);
            if (!doc.RootElement.TryGetProperty(key, out var value))
            {
                return false;
            }

            return value.ValueKind switch
            {
                JsonValueKind.True => true,
                JsonValueKind.False => false,
                JsonValueKind.String when bool.TryParse(value.GetString(), out var parsed) => parsed,
                _ => false
            };
        }
        catch
        {
            return false;
        }
    }

    private static string ReadMetadataString(string? metadataJson, string key, string fallback)
    {
        if (string.IsNullOrWhiteSpace(metadataJson))
        {
            return fallback;
        }

        try
        {
            using var doc = JsonDocument.Parse(metadataJson);
            if (!doc.RootElement.TryGetProperty(key, out var value))
            {
                return fallback;
            }

            return value.ValueKind == JsonValueKind.String
                ? value.GetString()?.Trim() ?? fallback
                : fallback;
        }
        catch
        {
            return fallback;
        }
    }
}
