using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Infrastructure.Data;
using Wiseravenshare.Server.Services;
using Wiseravenshare.Server.Shared;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Authorize]
[Route("api/media")]
public sealed class MediaBlobController : ControllerBase
{
    private readonly IBlobStorageService _blobStorageService;
    private readonly IMusicLibraryStore _musicLibraryStore;
    private readonly RavensightMediaCatalogStore _mediaCatalogStore;
    private readonly IMediaBlobSignatureService _signatureService;
    private readonly AppDbContext _dbContext;
    private readonly ILogger<MediaBlobController> _logger;

    public MediaBlobController(
        IBlobStorageService blobStorageService,
        IMusicLibraryStore musicLibraryStore,
        RavensightMediaCatalogStore mediaCatalogStore,
        IMediaBlobSignatureService signatureService,
        AppDbContext dbContext,
        ILogger<MediaBlobController> logger)
    {
        _blobStorageService = blobStorageService;
        _musicLibraryStore = musicLibraryStore;
        _mediaCatalogStore = mediaCatalogStore;
        _signatureService = signatureService;
        _dbContext = dbContext;
        _logger = logger;
    }

    [HttpGet("blob/{**objectKey}")]
    [HttpGet("~/api/videostreaming/blob/{**objectKey}")]
    public async Task<IActionResult> StreamBlob([FromRoute] string objectKey, [FromQuery] string? sig, CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        var normalizedKey = NormalizeObjectKey(objectKey);
        if (string.IsNullOrWhiteSpace(normalizedKey))
        {
            return BadRequest(new { message = "Missing object key." });
        }

        if (!string.IsNullOrWhiteSpace(sig) && !_signatureService.VerifyKeySignature(normalizedKey, sig))
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = "Invalid signature." });
        }

        var ownsObject = await UserOwnsObjectKeyAsync(userId, normalizedKey, cancellationToken);
        if (!ownsObject)
        {
            return NotFound(new { message = "Media not found." });
        }

        var blobStream = await _blobStorageService.OpenReadAsync(normalizedKey, cancellationToken);
        if (blobStream is not null)
        {
            var contentType = ResolveContentType(normalizedKey);
            Response.Headers.CacheControl = "private, max-age=31536000, immutable";
            Response.Headers["X-Media-Key-Signature"] = _signatureService.SignKey(normalizedKey);
            return File(blobStream, contentType, enableRangeProcessing: true);
        }

        var assets = await _mediaCatalogStore.GetUserAssetsAsync(userId, limit: 500, cancellationToken: cancellationToken);
        var localAsset = assets.FirstOrDefault(asset =>
            string.Equals(NormalizeObjectKey(asset.RelativePath), normalizedKey, StringComparison.OrdinalIgnoreCase)
            || string.Equals(asset.FileName, Path.GetFileName(normalizedKey), StringComparison.OrdinalIgnoreCase));
        if (localAsset is not null && !string.IsNullOrWhiteSpace(localAsset.AbsolutePath) && System.IO.File.Exists(localAsset.AbsolutePath))
        {
            return PhysicalFile(localAsset.AbsolutePath, ResolveContentType(normalizedKey), enableRangeProcessing: true);
        }

        return NotFound(new { message = "Media file is no longer available in storage." });
    }

    [HttpGet("stream")]
    [HttpGet("~/api/videostreaming/stream")]
    public async Task<IActionResult> StreamFileByName([FromQuery] string fileName, CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
            return Unauthorized(new { message = "Invalid user session." });

        var normalizedFileName = Path.GetFileName(fileName ?? string.Empty);
        if (string.IsNullOrWhiteSpace(normalizedFileName))
            return BadRequest(new { message = "Missing file name." });

        try
        {
            var tracks = await _musicLibraryStore.GetUserMusicAsync(userId, cancellationToken);
            var track = tracks.FirstOrDefault(candidate => string.Equals(candidate.FileName, normalizedFileName, StringComparison.OrdinalIgnoreCase));
            if (track is not null && !string.IsNullOrWhiteSpace(track.ObjectKey))
                return await StreamBlob(track.ObjectKey, null, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not resolve music file {FileName} through the music library.", normalizedFileName);
        }

        var assets = await _mediaCatalogStore.GetUserAssetsAsync(userId, limit: 500, cancellationToken: cancellationToken);
        var asset = assets.FirstOrDefault(candidate => string.Equals(candidate.FileName, normalizedFileName, StringComparison.OrdinalIgnoreCase));
        if (asset is null)
            return NotFound(new { message = "Media file not found." });

        var objectKey = string.IsNullOrWhiteSpace(asset.RelativePath) ? asset.FileName : asset.RelativePath;
        return await StreamBlob(objectKey, null, cancellationToken);
    }

    private async Task<bool> UserOwnsObjectKeyAsync(Guid userId, string objectKey, CancellationToken cancellationToken)
    {
        if (await _musicLibraryStore.UserOwnsObjectKeyAsync(userId, objectKey, cancellationToken))
        {
            return true;
        }

        if (await _mediaCatalogStore.UserOwnsObjectKeyAsync(userId, objectKey, cancellationToken))
        {
            return true;
        }

        var fileName = Path.GetFileName(objectKey);
        var mediaCandidates = await _dbContext.MediaItems
            .AsNoTracking()
            .Where(item => item.UserId == userId && !item.IsDeleted && item.Status != MediaStatus.Deleted)
            .Select(item => new
            {
                item.FileName,
                item.Metadata
            })
            .ToListAsync(cancellationToken);

        foreach (var candidate in mediaCandidates)
        {
            if (!string.IsNullOrWhiteSpace(candidate.FileName)
                && string.Equals(candidate.FileName, fileName, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            var metadataObjectKey = TryReadMetadataValue(candidate.Metadata, "objectKey");
            if (string.Equals(NormalizeObjectKey(metadataObjectKey), objectKey, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }

    private static string TryReadMetadataValue(JsonDocument? metadata, string key)
    {
        if (metadata is null || string.IsNullOrWhiteSpace(key))
        {
            return string.Empty;
        }

        if (!metadata.RootElement.TryGetProperty(key, out var property))
        {
            return string.Empty;
        }

        return property.ValueKind == JsonValueKind.String ? property.GetString() ?? string.Empty : property.ToString();
    }

    private static string NormalizeObjectKey(string? objectKey)
    {
        return (objectKey ?? string.Empty).Replace('\\', '/').Trim('/');
    }

    private string ResolveContentType(string objectKey)
    {
        var extension = Path.GetExtension(objectKey).ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(extension))
        {
            return "application/octet-stream";
        }

        return extension switch
        {
            ".mp3" => "audio/mpeg",
            ".wav" => "audio/wav",
            ".m4a" => "audio/mp4",
            ".aac" => "audio/aac",
            ".flac" => "audio/flac",
            ".ogg" => "audio/ogg",
            ".oga" => "audio/ogg",
            ".opus" => "audio/ogg",
            ".weba" => "audio/webm",
            ".jpg" or ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            ".gif" => "image/gif",
            ".webp" => "image/webp",
            ".avif" => "image/avif",
            ".bmp" => "image/bmp",
            ".mp4" => "video/mp4",
            ".mov" => "video/quicktime",
            ".webm" => "video/webm",
            ".mkv" => "video/x-matroska",
            ".avi" => "video/x-msvideo",
            ".m4v" => "video/x-m4v",
            _ => "application/octet-stream"
        };
    }
}

