using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using System.Security.Claims;
using Npgsql;
using Wiseravenshare.Server.DTOs.Social;
using Wiseravenshare.Server.Models;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class MediaController : ControllerBase
{
    private readonly IWebHostEnvironment _environment;
    private readonly IYouTubeService _youTubeService;
    private readonly ISocialPlatformService _socialPlatformService;
    private readonly VideoLibraryStore _videoLibraryStore;
    private readonly RavensightMediaCatalogStore _mediaCatalogStore;
    private readonly IBlobStorageService _blobStorage;
    private readonly ILogger<MediaController> _logger;
    private readonly OutputCacheInvalidationService _cacheInvalidation;
    private readonly string _videoStorageFolderName;
    private readonly string _defaultVideoDestination;
    private readonly string _projectFolder;

    public MediaController(
        IWebHostEnvironment environment,
        IConfiguration configuration,
        IYouTubeService youTubeService,
        VideoLibraryStore videoLibraryStore,
        RavensightMediaCatalogStore mediaCatalogStore,
        IBlobStorageService blobStorage,
        ILogger<MediaController> logger,
        OutputCacheInvalidationService cacheInvalidation,
        ISocialPlatformService socialPlatformService)
    {
        _environment = environment;
        _youTubeService = youTubeService;
        _socialPlatformService = socialPlatformService;
        _videoLibraryStore = videoLibraryStore;
        _mediaCatalogStore = mediaCatalogStore;
        _blobStorage = blobStorage;
        _logger = logger;
        _cacheInvalidation = cacheInvalidation;
        _videoStorageFolderName = configuration["Storage:Video:StorageFolderName"]?.Trim();
        if (string.IsNullOrWhiteSpace(_videoStorageFolderName))
        {
            _videoStorageFolderName = "ravensight_videos";
        }

        _defaultVideoDestination = StoragePathResolver.ResolveDefaultVideoDestination(
            configuration,
            environment.ContentRootPath,
            "wiseravenshare");

        _projectFolder = StoragePathResolver.ResolveProjectFolder(
            configuration,
            environment.ContentRootPath,
            "wiseravenshare");
    }

    [HttpPost("upload")]
    [RequestSizeLimit(500_000_000)]
    public async Task<IActionResult> UploadMedia([FromForm] MediaUploadDto upload, CancellationToken cancellationToken)
    {
        if (upload.File == null || upload.File.Length == 0)
        {
            return BadRequest("No file uploaded.");
        }

        var allowedTypes = new[]
        {
            ".mp4", ".mov", ".webm", ".avi", ".mkv",
            ".jpg", ".jpeg", ".png", ".webp", ".gif",
            ".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"
        };
        var extension = Path.GetExtension(upload.File.FileName).ToLowerInvariant();

        if (!allowedTypes.Contains(extension))
        {
            return BadRequest("Invalid file type.");
        }

        string uniqueFileName;
        string persistedMediaUrl;
        try
        {
            (uniqueFileName, persistedMediaUrl) = await SaveMediaFileAsync(upload.File, extension, upload.DestinationFolder, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to persist uploaded media file.");
            return StatusCode(StatusCodes.Status500InternalServerError, new { message = "Unable to save uploaded file to storage." });
        }

        var isVideo = extension is ".mp4" or ".mov" or ".webm" or ".avi" or ".mkv";
        var isAudio = extension is ".mp3" or ".wav" or ".m4a" or ".aac" or ".ogg" or ".flac";
        if (upload.PublishToYouTube && string.IsNullOrWhiteSpace(upload.YouTubeChannelOrEmail))
        {
            return BadRequest("YouTube details are required when publishing to YouTube.");
        }

        if (upload.PublishToYouTube && !upload.YouTubePermissionGranted)
        {
            return BadRequest("YouTube permission consent is required.");
        }

        if (upload.PublishToTikTok && string.IsNullOrWhiteSpace(upload.TikTokUsername))
        {
            return BadRequest("TikTok details are required when publishing to TikTok.");
        }

        if (upload.PublishToTikTok && !upload.TikTokPermissionGranted)
        {
            return BadRequest("TikTok permission consent is required.");
        }

        if (upload.PublishToFacebook && string.IsNullOrWhiteSpace(upload.FacebookPageOrProfile))
        {
            return BadRequest("Facebook details are required when publishing to Facebook.");
        }

        if (upload.PublishToFacebook && !upload.FacebookPermissionGranted)
        {
            return BadRequest("Facebook permission consent is required.");
        }

        string? youtubeUrl = null;
        string? tiktokUrl = null;
        string? facebookUrl = null;
        PublishSocialContentResponse? socialShare = null;

        var isPhoto = extension is ".jpg" or ".jpeg" or ".png" or ".webp" or ".gif";
        var mediaType = isPhoto
            ? SocialMediaType.Photo
            : isAudio
                ? SocialMediaType.Music
                : SocialMediaType.Video;
        var wantsSocialCrossPost = upload.PublishToYouTube || upload.PublishToTikTok || upload.PublishToFacebook;

        if (wantsSocialCrossPost)
        {
            var mediaUrlForShare = persistedMediaUrl;
            var shareUserId = Guid.TryParse(
                User.FindFirstValue(ClaimTypes.NameIdentifier)
                ?? User.FindFirstValue("sub")
                ?? User.FindFirstValue("id"),
                out var parsedShareUserId)
                ? parsedShareUserId
                : Guid.Empty;

            // Route uploads through the real social share pipeline (photos go to Facebook, videos to FB/TikTok/YouTube).
            socialShare = await _socialPlatformService.PublishMediaUploadAsync(
                shareUserId,
                string.IsNullOrWhiteSpace(upload.Title) ? "New upload from Wiseravenshare" : upload.Title.Trim(),
                mediaUrlForShare,
                mediaType,
                upload.PublishToFacebook,
                upload.PublishToTikTok && !isPhoto,
                upload.PublishToYouTube && !isPhoto);

            foreach (var result in socialShare.Results)
            {
                if (!result.Success)
                {
                    _logger.LogWarning(
                        "Social cross-post failed for upload {FileName} on {Platform}: {Error}",
                        uniqueFileName,
                        result.Platform,
                        result.Error);
                    continue;
                }

                if (string.Equals(result.Platform, "facebook", StringComparison.OrdinalIgnoreCase))
                {
                    facebookUrl = result.ExternalPostUrl;
                }
                else if (string.Equals(result.Platform, "tiktok", StringComparison.OrdinalIgnoreCase))
                {
                    tiktokUrl = result.ExternalPostUrl;
                }
                else if (string.Equals(result.Platform, "youtube", StringComparison.OrdinalIgnoreCase))
                {
                    youtubeUrl = result.ExternalPostUrl;
                }
            }
        }

        VideoLibraryVideo? video = null;
        if (isVideo)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)
                         ?? User.FindFirstValue("sub")
                         ?? User.FindFirstValue("id");

            if (string.IsNullOrWhiteSpace(userId))
            {
                return Unauthorized("Unable to determine current user for video library save.");
            }

            var absoluteVideoUrl = persistedMediaUrl;
            try
            {
                video = await _videoLibraryStore.CreateVideoAsync(new CreateVideoLibraryEntryRequest
                {
                    UserId = userId,
                    Title = string.IsNullOrWhiteSpace(upload.Title) ? Path.GetFileNameWithoutExtension(upload.File.FileName) : upload.Title,
                    Description = upload.Description ?? string.Empty,
                    VideoUrl = absoluteVideoUrl,
                    PrivacyStatus = "unlisted",
                    Status = "published",
                    YouTubeUrl = youtubeUrl,
                    TikTokUrl = tiktokUrl,
                    FacebookUrl = facebookUrl
                }, cancellationToken);
            }
            catch (PostgresException ex)
            {
                _logger.LogError(ex, "Video library save failed at DB layer for user {UserId}.", userId);
                return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = "Video library database is temporarily unavailable." });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Video library save failed unexpectedly for user {UserId}.", userId);
                return StatusCode(StatusCodes.Status500InternalServerError, new { message = "Failed to save video metadata to library." });
            }
        }

        var mediaUrl = persistedMediaUrl;

        // Register photos and music in the user catalog so they appear in My Library.
        if (isPhoto || isAudio)
        {
            var catalogUserId = User.FindFirstValue(ClaimTypes.NameIdentifier)
                ?? User.FindFirstValue("sub")
                ?? User.FindFirstValue("id");
            if (Guid.TryParse(catalogUserId, out var catalogUserGuid) && catalogUserGuid != Guid.Empty)
            {
                var displayName = User.FindFirstValue(ClaimTypes.Name);
                var email = User.FindFirstValue(ClaimTypes.Email) ?? User.FindFirstValue("email");
                var userIdentity = StoragePathResolver.ResolveUserStorageIdentity(displayName, email, catalogUserId);
                var mediaFolder = isPhoto ? $"users/{userIdentity}/media/photos" : $"users/{userIdentity}/media/music";

                try
                {
                    await _mediaCatalogStore.CreateAssetAsync(new CreateRavensightMediaAssetRequest
                    {
                        UserId = catalogUserGuid,
                        MediaType = isPhoto ? RavensightMediaType.Photo : RavensightMediaType.Music,
                        FileName = uniqueFileName,
                        RelativePath = $"{mediaFolder}/{uniqueFileName}",
                        PublicUrl = null,
                        AbsolutePath = string.Empty,
                        DestinationFolder = mediaFolder,
                        ContentType = upload.File.ContentType ?? "application/octet-stream",
                        SizeBytes = upload.File.Length,
                        SavedAtUtc = DateTime.UtcNow,
                        MetadataJson = System.Text.Json.JsonSerializer.Serialize(new
                        {
                            title = upload.Title ?? Path.GetFileNameWithoutExtension(upload.File.FileName),
                            originalFileName = upload.File.FileName,
                            mediaType = isPhoto ? "photo" : "music"
                        })
                    }, cancellationToken);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to register {MediaType} upload in catalog for user {UserId}.", isPhoto ? "photo" : "music", catalogUserGuid);
                }
            }
        }

        await _cacheInvalidation.InvalidateFeedAsync(cancellationToken);

        return Ok(new
        {
            fileName = uniqueFileName,
            filePath = mediaUrl,
            mediaUrl,
            youtubeUrl,
            tiktokUrl,
            facebookUrl,
            socialShare = socialShare?.Results,
            video
        });
    }

    /// <summary>
    /// Persists uploaded media. When DigitalOcean Spaces (or S3-compatible) blob storage is
    /// configured the file is streamed directly to the bucket and the persistent public URL is
    /// returned. This survives container restarts and redeployments.
    /// Local disk is used only as a development fallback.
    /// Returns (uniqueFileName, persistentMediaUrl).
    /// </summary>
    private async Task<(string FileName, string MediaUrl)> SaveMediaFileAsync(
        IFormFile file,
        string extension,
        string? requestedDestinationFolder,
        CancellationToken cancellationToken)
    {
        var uniqueFileName = $"{Guid.NewGuid():N}{extension}";
        var normalizedDestination = NormalizeDestinationFolder(requestedDestinationFolder, _defaultVideoDestination);

        // ── Blob storage (persistent) ──────────────────────────────────────────
        if (_blobStorage.IsConfigured)
        {
            var objectKey = $"{_projectFolder}/{normalizedDestination}/{uniqueFileName}".Replace('\\', '/').Trim('/');
            try
            {
                await using var blobStream = file.OpenReadStream();
                var result = await _blobStorage.UploadAsync(
                    objectKey,
                    blobStream,
                    string.IsNullOrWhiteSpace(file.ContentType) ? "application/octet-stream" : file.ContentType,
                    cancellationToken);

                _logger.LogInformation(
                    "Uploaded media to blob storage: key={ObjectKey} url={PublicUrl}",
                    result.ObjectKey, result.PublicUrl);

                // Prefer the blob proxy URL so credentials and ACL are handled server-side
                var blobStreamUrl = StreamingUrlHelper.StreamByBlobPath(result.ObjectKey);
                var mediaUrl = string.IsNullOrWhiteSpace(blobStreamUrl)
                    ? result.PublicUrl
                    : blobStreamUrl;

                return (uniqueFileName, mediaUrl);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Blob storage upload failed for {FileName}; falling back to local disk.", uniqueFileName);
            }
        }

        // ── Local disk fallback (dev / unconfigured) ───────────────────────────
        var destinationParts = normalizedDestination.Split('/', StringSplitOptions.RemoveEmptyEntries);
        var candidateFolders = new List<string>
        {
            Path.Combine(new[] { _environment.ContentRootPath, _videoStorageFolderName }.Concat(destinationParts).ToArray()),
            Path.Combine(new[] { AppContext.BaseDirectory, _videoStorageFolderName }.Concat(destinationParts).ToArray()),
            Path.Combine(new[] { Path.GetTempPath(), "Wiseravenshare", _videoStorageFolderName }.Concat(destinationParts).ToArray()),
            Path.Combine(_environment.ContentRootPath, "MediaStorage"),
            Path.Combine(AppContext.BaseDirectory, "MediaStorage"),
            Path.Combine(Path.GetTempPath(), "Wiseravenshare", "MediaStorage")
        };

        Exception? lastFailure = null;
        foreach (var folder in candidateFolders)
        {
            try
            {
                Directory.CreateDirectory(folder);
                var filePath = Path.Combine(folder, uniqueFileName);
                await using var diskStream = new FileStream(filePath, FileMode.Create, FileAccess.Write, FileShare.None);
                await file.CopyToAsync(diskStream, cancellationToken);
                var localUrl = StreamingUrlHelper.StreamByFileName(uniqueFileName);
                return (uniqueFileName, localUrl);
            }
            catch (Exception ex) when (ex is IOException || ex is UnauthorizedAccessException)
            {
                lastFailure = ex;
                _logger.LogWarning(ex, "Media upload write attempt failed for folder {Folder}", folder);
            }
        }

        throw new InvalidOperationException("Unable to write uploaded media to any configured storage path.", lastFailure);
    }

    private static string NormalizeDestinationFolder(string? requested, string defaultFolder)
    {
        var value = string.IsNullOrWhiteSpace(requested) ? defaultFolder : requested.Trim();
        value = value.Replace('\\', '/').Trim('/');

        if (string.IsNullOrWhiteSpace(value))
        {
            value = defaultFolder;
        }

        var safeSegments = value
            .Split('/', StringSplitOptions.RemoveEmptyEntries)
            .Select(segment => new string(segment.Where(ch => char.IsLetterOrDigit(ch) || ch is '-' or '_' or '.').ToArray()))
            .Where(segment => !string.IsNullOrWhiteSpace(segment))
            .ToArray();

        if (safeSegments.Length == 0)
        {
            return defaultFolder;
        }

        return string.Join('/', safeSegments);
    }
}

public sealed class MediaUploadDto
{
    public IFormFile? File { get; set; }
    public string? DestinationFolder { get; set; }
    public bool PublishToYouTube { get; set; }
    public bool PublishToTikTok { get; set; }
    public bool PublishToFacebook { get; set; }
    public string? YouTubeChannelOrEmail { get; set; }
    public string? TikTokUsername { get; set; }
    public string? FacebookPageOrProfile { get; set; }
    public bool YouTubePermissionGranted { get; set; }
    public bool TikTokPermissionGranted { get; set; }
    public bool FacebookPermissionGranted { get; set; }
    public string? Title { get; set; }
    public string? Description { get; set; }
}
