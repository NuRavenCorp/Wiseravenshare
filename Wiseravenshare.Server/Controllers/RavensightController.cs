using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Wiseravenshare.Server.DTOs.Social;
using Wiseravenshare.Server.Infrastructure.Data;
using Wiseravenshare.Server.Models;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/ravensight/videos")]
[Authorize]
public class RavensightController : ControllerBase
{
    private static readonly HashSet<string> AllowedVideoTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        ".mp4", ".mov", ".webm", ".avi"
    };

    private readonly IWebHostEnvironment _environment;
    private readonly IYouTubeService _youTubeService;
    private readonly ISocialPlatformService _socialPlatformService;
    private readonly VideoLibraryStore _videoStore;
    private readonly AppDbContext _dbContext;
    private readonly ILogger<RavensightController> _logger;
    private readonly IBlobStorageService _blobStorageService;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _configuration;
    private readonly OutputCacheInvalidationService _cacheInvalidation;
    private readonly string _videoStorageFolderName;
    private readonly string _defaultVideoDestination;

    public RavensightController(IWebHostEnvironment environment, IConfiguration configuration, IYouTubeService youTubeService, VideoLibraryStore videoStore, AppDbContext dbContext, ILogger<RavensightController> logger, IBlobStorageService blobStorageService, IHttpClientFactory httpClientFactory, OutputCacheInvalidationService cacheInvalidation, ISocialPlatformService socialPlatformService)
    {
        _environment = environment;
        _youTubeService = youTubeService;
        _socialPlatformService = socialPlatformService;
        _videoStore = videoStore;
        _dbContext = dbContext;
        _logger = logger;
        _blobStorageService = blobStorageService;
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
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
    }

    [HttpPost("upload")]
    [RequestSizeLimit(500_000_000)]
    [RequestFormLimits(MultipartBodyLengthLimit = 500_000_000)]
    public async Task<IActionResult> UploadVideo([FromForm] RavensightVideoUploadDto upload, CancellationToken cancellationToken)
    {
        var userId = GetCurrentUserId();
        if (userId is null)
        {
            return Unauthorized(new { message = "Unable to determine current user." });
        }

        var file = upload.Video ?? upload.File;
        if (file is null || file.Length == 0)
        {
            return BadRequest(new { message = "No video uploaded." });
        }

        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (!AllowedVideoTypes.Contains(extension))
        {
            return BadRequest(new { message = "Invalid video type." });
        }

        if (upload.PublishToYouTube && string.IsNullOrWhiteSpace(upload.YouTubeChannelOrEmail))
        {
            return BadRequest(new { message = "YouTube details are required when publishing to YouTube." });
        }

        if (upload.PublishToYouTube && !upload.YouTubePermissionGranted)
        {
            return BadRequest(new { message = "YouTube permission consent is required." });
        }

        if (upload.PublishToTikTok && string.IsNullOrWhiteSpace(upload.TikTokUsername))
        {
            return BadRequest(new { message = "TikTok details are required when publishing to TikTok." });
        }

        if (upload.PublishToTikTok && !upload.TikTokPermissionGranted)
        {
            return BadRequest(new { message = "TikTok permission consent is required." });
        }

        if (upload.PublishToFacebook && string.IsNullOrWhiteSpace(upload.FacebookPageOrProfile))
        {
            return BadRequest(new { message = "Facebook details are required when publishing to Facebook." });
        }

        if (upload.PublishToFacebook && !upload.FacebookPermissionGranted)
        {
            return BadRequest(new { message = "Facebook permission consent is required." });
        }

        string uniqueFileName;
        try
        {
            uniqueFileName = await SaveVideoFileAsync(file, extension, upload.DestinationFolder, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to persist uploaded video file before library save.");
            return StatusCode(StatusCodes.Status500InternalServerError, new { message = "Unable to save uploaded file to storage." });
        }

        var absoluteVideoUrl = $"{Request.Scheme}://{Request.Host}/api/videostreaming/stream?fileName={Uri.EscapeDataString(uniqueFileName)}";
        if (_blobStorageService.IsConfigured)
        {
            var publicUrl = await TryUploadToBlobStorageAsync(file, uniqueFileName, upload.DestinationFolder, cancellationToken);
            if (!string.IsNullOrWhiteSpace(publicUrl))
            {
                absoluteVideoUrl = publicUrl;
            }
        }

        string? youtubeUrl = null;
        string? tiktokUrl = null;
        string? facebookUrl = null;
        PublishSocialContentResponse? socialShare = null;

        var wantsSocialCrossPost = upload.PublishToYouTube || upload.PublishToTikTok || upload.PublishToFacebook;
        if (wantsSocialCrossPost)
        {
            // Route the upload through the real social share pipeline so Facebook/TikTok/YouTube
            // receive the same payload as feed shares, instead of placeholder URLs.
            var shareUserId = Guid.TryParse(userId, out var parsedShareUserId) ? parsedShareUserId : Guid.Empty;
            socialShare = await _socialPlatformService.PublishMediaUploadAsync(
                shareUserId,
                string.IsNullOrWhiteSpace(upload.Title) ? "New video upload from Wiseravenshare" : upload.Title.Trim(),
                absoluteVideoUrl,
                SocialMediaType.Video,
                upload.PublishToFacebook,
                upload.PublishToTikTok,
                upload.PublishToYouTube);

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

        var hasActiveSubscription = await HasActiveSubscriptionAsync(userId);
        var resolvedStorageMode = VideoRetentionPolicy.ResolveStorageMode(upload.StorageMode, upload.IsPermanent, hasActiveSubscription);

        var persistenceStatus = "ready";
        VideoLibraryVideo saved;
        try
        {
            saved = await RavensightPersistenceGuard.RunWithTimeoutAsync(
                async ct => await _videoStore.CreateVideoAsync(new CreateVideoLibraryEntryRequest
                {
                    UserId = userId,
                    Title = string.IsNullOrWhiteSpace(upload.Title) ? Path.GetFileNameWithoutExtension(file.FileName) : upload.Title,
                    Description = upload.Description ?? string.Empty,
                    Tags = ParseTags(upload.Tags),
                    VideoUrl = absoluteVideoUrl,
                    PrivacyStatus = string.IsNullOrWhiteSpace(upload.PrivacyStatus) ? "unlisted" : upload.PrivacyStatus,
                    Status = "published",
                    StorageMode = resolvedStorageMode,
                    IsPermanent = resolvedStorageMode == "permanent",
                    YouTubeUrl = youtubeUrl,
                    TikTokUrl = tiktokUrl,
                    FacebookUrl = facebookUrl
                }, ct),
                BuildFallbackVideo(userId, upload, absoluteVideoUrl, youtubeUrl, tiktokUrl, facebookUrl, resolvedStorageMode, hasActiveSubscription),
                TimeSpan.FromSeconds(5));
            persistenceStatus = "ready";
        }
        catch (PostgresException ex)
        {
            persistenceStatus = "degraded";
            _logger.LogError(ex, "Video library save failed at DB layer for user {UserId}; serving a local fallback video object.", userId);
            saved = BuildFallbackVideo(userId, upload, absoluteVideoUrl, youtubeUrl, tiktokUrl, facebookUrl, resolvedStorageMode, hasActiveSubscription);
        }
        catch (Exception ex)
        {
            persistenceStatus = "degraded";
            _logger.LogError(ex, "Video library save failed unexpectedly for user {UserId}; serving a local fallback video object.", userId);
            saved = BuildFallbackVideo(userId, upload, absoluteVideoUrl, youtubeUrl, tiktokUrl, facebookUrl, resolvedStorageMode, hasActiveSubscription);
        }

        await _cacheInvalidation.InvalidateFeedAsync(cancellationToken);

        return Ok(new
        {
            video = saved,
            fileName = uniqueFileName,
            filePath = absoluteVideoUrl,
            mediaUrl = absoluteVideoUrl,
            youtubeUrl,
            tiktokUrl,
            facebookUrl,
            socialShare = socialShare?.Results,
            persistenceStatus
        });
    }

    [HttpPost("save-reference")]
    public async Task<IActionResult> SaveVideoReference([FromBody] SaveVideoReferenceRequest request, CancellationToken cancellationToken)
    {
        var userId = GetCurrentUserId();
        if (userId is null)
        {
            return Unauthorized(new { message = "Unable to determine current user." });
        }

        if (string.IsNullOrWhiteSpace(request.VideoUrl))
        {
            return BadRequest(new { message = "videoUrl is required." });
        }

        if (!_blobStorageService.IsConfigured)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = "Blob storage is not configured. Cannot persist this video to library storage." });
        }

        var destinationFolder = NormalizeDestinationFolder(request.DestinationFolder, _defaultVideoDestination);
        var persisted = await PersistExternalVideoToBlobAsync(request.VideoUrl, destinationFolder, cancellationToken);
        if (string.IsNullOrWhiteSpace(persisted.PublicUrl))
        {
            return StatusCode(StatusCodes.Status502BadGateway, new
            {
                message = string.IsNullOrWhiteSpace(persisted.Error)
                    ? "Unable to copy source video into blob storage."
                    : persisted.Error
            });
        }

        var hasActiveSubscription = await HasActiveSubscriptionAsync(userId);
        var now = DateTime.UtcNow;
        var title = string.IsNullOrWhiteSpace(request.Title) ? "Saved Feed Video" : request.Title.Trim();

        var persistenceStatus = "ready";
        VideoLibraryVideo saved;
        try
        {
            saved = await RavensightPersistenceGuard.RunWithTimeoutAsync(
                async ct => await _videoStore.CreateVideoAsync(new CreateVideoLibraryEntryRequest
                {
                    UserId = userId,
                    Title = title,
                    Description = request.Description?.Trim() ?? string.Empty,
                    Tags = request.Tags ?? [],
                    VideoUrl = persisted.PublicUrl,
                    ThumbnailUrl = request.ThumbnailUrl?.Trim() ?? string.Empty,
                    PrivacyStatus = string.IsNullOrWhiteSpace(request.PrivacyStatus) ? "unlisted" : request.PrivacyStatus,
                    Status = "published",
                    StorageMode = "permanent",
                    IsPermanent = true
                }, ct),
                new VideoLibraryVideo
                {
                    Id = $"local-{Guid.NewGuid():N}",
                    UserId = userId,
                    Title = title,
                    Description = request.Description?.Trim() ?? string.Empty,
                    Tags = request.Tags?.Distinct(StringComparer.OrdinalIgnoreCase).ToList() ?? [],
                    VideoUrl = persisted.PublicUrl,
                    ThumbnailUrl = request.ThumbnailUrl?.Trim() ?? string.Empty,
                    Status = "published",
                    PrivacyStatus = string.IsNullOrWhiteSpace(request.PrivacyStatus) ? "unlisted" : request.PrivacyStatus,
                    StorageMode = "permanent",
                    RetentionStatus = VideoRetentionPolicy.GetStorageStatus(now, true, nowUtc: now, hasActiveSubscription: hasActiveSubscription),
                    CreatedAt = now,
                    UpdatedAt = now
                },
                TimeSpan.FromSeconds(5));
        }
        catch (Exception ex)
        {
            persistenceStatus = "degraded";
            _logger.LogError(ex, "Save reference failed for user {UserId}; returning blob URL fallback object.", userId);
            saved = new VideoLibraryVideo
            {
                Id = $"local-{Guid.NewGuid():N}",
                UserId = userId,
                Title = title,
                Description = request.Description?.Trim() ?? string.Empty,
                Tags = request.Tags?.Distinct(StringComparer.OrdinalIgnoreCase).ToList() ?? [],
                VideoUrl = persisted.PublicUrl,
                ThumbnailUrl = request.ThumbnailUrl?.Trim() ?? string.Empty,
                Status = "published",
                PrivacyStatus = string.IsNullOrWhiteSpace(request.PrivacyStatus) ? "unlisted" : request.PrivacyStatus,
                StorageMode = "permanent",
                RetentionStatus = VideoRetentionPolicy.GetStorageStatus(now, true, nowUtc: now, hasActiveSubscription: hasActiveSubscription),
                CreatedAt = now,
                UpdatedAt = now
            };
        }

        await _cacheInvalidation.InvalidateFeedAsync(cancellationToken);

        return Ok(new
        {
            video = saved,
            mediaUrl = persisted.PublicUrl,
            blobStored = true,
            persistenceStatus
        });
    }

    private async Task<string> SaveVideoFileAsync(IFormFile file, string extension, string? requestedDestinationFolder, CancellationToken cancellationToken)
    {
        var uniqueFileName = $"{Guid.NewGuid():N}{extension}";
        var normalizedDestination = NormalizeDestinationFolder(requestedDestinationFolder, _defaultVideoDestination);
        var destinationParts = normalizedDestination.Split('/', StringSplitOptions.RemoveEmptyEntries);

        var candidateFolders = new List<string>
        {
            Path.Combine(new[] { _environment.ContentRootPath, _videoStorageFolderName }.Concat(destinationParts).ToArray()),
            Path.Combine(new[] { AppContext.BaseDirectory, _videoStorageFolderName }.Concat(destinationParts).ToArray()),
            Path.Combine(new[] { Path.GetTempPath(), "Wiseravenshare", _videoStorageFolderName }.Concat(destinationParts).ToArray()),

            // Backward-compatible fallback.
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
                await using var stream = new FileStream(filePath, FileMode.Create, FileAccess.Write, FileShare.None);
                await file.CopyToAsync(stream, cancellationToken);
                return uniqueFileName;
            }
            catch (Exception ex) when (ex is IOException || ex is UnauthorizedAccessException)
            {
                lastFailure = ex;
                _logger.LogWarning(ex, "Video upload write attempt failed for folder {Folder}", folder);
            }
        }

        throw new InvalidOperationException("Unable to write uploaded video to any configured storage path.", lastFailure);
    }

    private async Task<string?> TryUploadToBlobStorageAsync(IFormFile file, string uniqueFileName, string? requestedDestinationFolder, CancellationToken cancellationToken)
    {
        if (!_blobStorageService.IsConfigured)
        {
            return null;
        }

        var normalizedDestination = NormalizeDestinationFolder(requestedDestinationFolder, _defaultVideoDestination);
        var objectKey = BuildBlobObjectKey(normalizedDestination, uniqueFileName);

        try
        {
            var localTempPath = Path.Combine(Path.GetTempPath(), "Wiseravenshare", "uploads", uniqueFileName);
            Directory.CreateDirectory(Path.GetDirectoryName(localTempPath)!);
            await using (var localStream = new FileStream(localTempPath, FileMode.Create, FileAccess.Write, FileShare.None))
            {
                await file.CopyToAsync(localStream, cancellationToken);
            }

            await using (var uploadStream = System.IO.File.OpenRead(localTempPath))
            {
                var result = await _blobStorageService.UploadAsync(objectKey, uploadStream, file.ContentType, cancellationToken);
                return result.PublicUrl;
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to upload video {FileName} to blob storage", uniqueFileName);
            return null;
        }
    }

    private async Task<(string? PublicUrl, string? Error)> PersistExternalVideoToBlobAsync(string sourceVideoUrl, string destinationFolder, CancellationToken cancellationToken)
    {
        try
        {
            var blobObjectKey = _blobStorageService.ResolveObjectKey(sourceVideoUrl);
            if (!string.IsNullOrWhiteSpace(blobObjectKey))
            {
                var existingBlobStream = await _blobStorageService.OpenReadAsync(blobObjectKey, cancellationToken);
                if (existingBlobStream is not null)
                {
                    await using (existingBlobStream)
                    {
                        var blobExtension = ResolveVideoExtensionFromPath(blobObjectKey);
                        var blobFileName = $"{Guid.NewGuid():N}{blobExtension}";
                        var blobTargetObjectKey = BuildBlobObjectKey(destinationFolder, blobFileName);
                        var blobUploadResult = await _blobStorageService.UploadAsync(blobTargetObjectKey, existingBlobStream, "video/mp4", cancellationToken);
                        return (blobUploadResult.PublicUrl, null);
                    }
                }
            }

            var sourceUri = BuildSourceUri(sourceVideoUrl);
            if (sourceUri is null)
            {
                return (null, "Source video URL is invalid or unreachable from the API host.");
            }

            var client = _httpClientFactory.CreateClient();
            using var response = await client.GetAsync(sourceUri, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Failed to fetch source video {SourceVideoUrl}. Status {StatusCode}", sourceVideoUrl, (int)response.StatusCode);
                return (null, $"Source video fetch failed ({(int)response.StatusCode}).");
            }

            var contentType = response.Content.Headers.ContentType?.MediaType ?? "video/mp4";
            var extension = ResolveVideoExtension(sourceUri, contentType);
            var uniqueFileName = $"{Guid.NewGuid():N}{extension}";
            var objectKey = BuildBlobObjectKey(destinationFolder, uniqueFileName);

            await using var sourceStream = await response.Content.ReadAsStreamAsync(cancellationToken);
            var uploadResult = await _blobStorageService.UploadAsync(objectKey, sourceStream, contentType, cancellationToken);
            return (uploadResult.PublicUrl, null);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Unable to persist external video source {SourceVideoUrl} to blob storage", sourceVideoUrl);
            return (null, $"Blob persistence failed: {ex.Message}");
        }
    }

    private Uri? BuildSourceUri(string sourceVideoUrl)
    {
        if (Uri.TryCreate(sourceVideoUrl, UriKind.Absolute, out var absoluteUri))
        {
            return absoluteUri;
        }

        if (!sourceVideoUrl.StartsWith('/'))
        {
            return null;
        }

        var host = $"{Request.Scheme}://{Request.Host}";
        return Uri.TryCreate(host + sourceVideoUrl, UriKind.Absolute, out var relativeUri) ? relativeUri : null;
    }

    private static string ResolveVideoExtension(Uri sourceUri, string contentType)
    {
        var existingExtension = Path.GetExtension(sourceUri.AbsolutePath);
        if (!string.IsNullOrWhiteSpace(existingExtension) && AllowedVideoTypes.Contains(existingExtension))
        {
            return existingExtension;
        }

        if (contentType.Contains("webm", StringComparison.OrdinalIgnoreCase)) return ".webm";
        if (contentType.Contains("quicktime", StringComparison.OrdinalIgnoreCase)) return ".mov";
        if (contentType.Contains("x-msvideo", StringComparison.OrdinalIgnoreCase)) return ".avi";
        return ".mp4";
    }

    private static string ResolveVideoExtensionFromPath(string path)
    {
        var extension = Path.GetExtension(path);
        if (!string.IsNullOrWhiteSpace(extension) && AllowedVideoTypes.Contains(extension))
        {
            return extension;
        }

        return ".mp4";
    }

    private string BuildBlobObjectKey(string destinationFolder, string fileName)
    {
        var projectFolder = StoragePathResolver.ResolveProjectFolder(_configuration, _environment.ContentRootPath, "wiseravenshare");
        var normalizedDestination = destinationFolder.Replace('\\', '/').Trim('/');
        if (string.IsNullOrWhiteSpace(projectFolder))
        {
            return string.IsNullOrWhiteSpace(normalizedDestination) ? fileName : $"{normalizedDestination}/{fileName}";
        }

        if (!string.IsNullOrWhiteSpace(normalizedDestination) && normalizedDestination.StartsWith(projectFolder, StringComparison.OrdinalIgnoreCase))
        {
            var remainingDestination = normalizedDestination[projectFolder.Length..].Trim('/');
            return string.IsNullOrWhiteSpace(remainingDestination)
                ? $"{projectFolder}/{fileName}"
                : $"{projectFolder}/{remainingDestination}/{fileName}";
        }

        return string.IsNullOrWhiteSpace(normalizedDestination)
            ? $"{projectFolder}/{fileName}"
            : $"{projectFolder}/{normalizedDestination}/{fileName}";
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

    [HttpGet("feed")]
    [AllowAnonymous]
    public async Task<IActionResult> GetFeed([FromQuery] string filter = "all", [FromQuery] int page = 1, [FromQuery] int limit = 10, CancellationToken cancellationToken = default)
    {
        var userId = GetCurrentUserId();
        try
        {
            var result = await _videoStore.GetFeedAsync(filter, userId, page, limit, cancellationToken);
            return Ok(new { videos = result.Videos, hasMore = result.HasMore, persistenceStatus = "ready" });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Video feed query failed for user {UserId}; returning an empty degraded feed.", userId);
            return Ok(new { videos = Array.Empty<VideoLibraryVideo>(), hasMore = false, persistenceStatus = "degraded" });
        }
    }

    [HttpGet("user")]
    public async Task<IActionResult> GetUserVideos(CancellationToken cancellationToken)
    {
        var userId = GetCurrentUserId();
        if (userId is null)
        {
            return Unauthorized(new { message = "Unable to determine current user." });
        }

        try
        {
            var videos = await _videoStore.GetUserVideosAsync(userId, cancellationToken);
            return Ok(new { videos, persistenceStatus = "ready" });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "User video query failed for user {UserId}; returning an empty degraded library.", userId);
            return Ok(new { videos = Array.Empty<VideoLibraryVideo>(), persistenceStatus = "degraded" });
        }
    }

    [HttpGet("{videoId}")]
    public async Task<IActionResult> GetVideo([FromRoute] string videoId, CancellationToken cancellationToken)
    {
        var video = await _videoStore.GetByIdAsync(videoId, cancellationToken);
        return video is null ? NotFound() : Ok(video);
    }

    [HttpPut("{videoId}")]
    public async Task<IActionResult> UpdateVideo([FromRoute] string videoId, [FromBody] UpdateVideoLibraryEntryRequest request, CancellationToken cancellationToken)
    {
        var userId = GetCurrentUserId();
        if (userId is null)
        {
            return Unauthorized(new { message = "Unable to determine current user." });
        }

        var updated = await _videoStore.UpdateVideoAsync(videoId, userId, request, cancellationToken);
        if (updated is null)
        {
            return NotFound(new { message = "Video not found." });
        }

        await _cacheInvalidation.InvalidateFeedAsync(cancellationToken);
        return Ok(updated);
    }

    [HttpDelete("{videoId}")]
    public async Task<IActionResult> DeleteVideo([FromRoute] string videoId, CancellationToken cancellationToken)
    {
        var userId = GetCurrentUserId();
        if (userId is null)
        {
            return Unauthorized(new { message = "Unable to determine current user." });
        }

        var video = await _videoStore.GetByIdAsync(videoId, cancellationToken);
        if (video is null)
        {
            return NotFound(new { message = "Video not found." });
        }

        var blobDeleted = false;
        var blobObjectKey = _blobStorageService.ResolveObjectKey(video.VideoUrl);
        if (!string.IsNullOrWhiteSpace(blobObjectKey))
        {
            blobDeleted = await _blobStorageService.DeleteAsync(blobObjectKey, cancellationToken);
        }

        var deleted = await _videoStore.DeleteVideoAsync(videoId, userId, cancellationToken);
        if (!deleted)
        {
            return NotFound(new { message = "Video not found." });
        }

        await _cacheInvalidation.InvalidateFeedAsync(cancellationToken);

        return Ok(new
        {
            success = true,
            blobDeleted,
            objectKey = blobDeleted ? blobObjectKey : null
        });
    }

    [HttpPost("{videoId}/like")]
    public async Task<IActionResult> LikeVideo([FromRoute] string videoId, CancellationToken cancellationToken)
    {
        var updated = await _videoStore.AddLikeAsync(videoId, cancellationToken);
        if (updated)
        {
            await _cacheInvalidation.InvalidateFeedAsync(cancellationToken);
        }

        return updated ? Ok(new { success = true }) : NotFound(new { message = "Video not found." });
    }

    [HttpDelete("{videoId}/like")]
    public async Task<IActionResult> UnlikeVideo([FromRoute] string videoId, CancellationToken cancellationToken)
    {
        var updated = await _videoStore.RemoveLikeAsync(videoId, cancellationToken);
        if (updated)
        {
            await _cacheInvalidation.InvalidateFeedAsync(cancellationToken);
        }

        return updated ? Ok(new { success = true }) : NotFound(new { message = "Video not found." });
    }

    [HttpPost("{videoId}/comments")]
    public async Task<IActionResult> AddComment([FromRoute] string videoId, [FromBody] AddVideoCommentRequest request, CancellationToken cancellationToken)
    {
        var userId = GetCurrentUserId();
        if (userId is null)
        {
            return Unauthorized(new { message = "Unable to determine current user." });
        }

        if (string.IsNullOrWhiteSpace(request.Comment))
        {
            return BadRequest(new { message = "Comment is required." });
        }

        var comment = await _videoStore.AddCommentAsync(videoId, userId, request.Comment, cancellationToken);
        if (comment is null)
        {
            return NotFound(new { message = "Video not found." });
        }

        await _cacheInvalidation.InvalidateFeedAsync(cancellationToken);
        return Ok(comment);
    }

    [HttpGet("{videoId}/comments")]
    public async Task<IActionResult> GetComments([FromRoute] string videoId, [FromQuery] int page = 1, CancellationToken cancellationToken = default)
    {
        var comments = await _videoStore.GetCommentsAsync(videoId, page, 20, cancellationToken);
        return Ok(new { comments, page });
    }

    private string? GetCurrentUserId()
    {
        return User.FindFirstValue(ClaimTypes.NameIdentifier)
               ?? User.FindFirstValue("sub")
               ?? User.FindFirstValue("id");
    }

    private async Task<bool> HasActiveSubscriptionAsync(string? userId)
    {
        if (IsAllAccessAdmin())
        {
            return true;
        }

        if (string.IsNullOrWhiteSpace(userId) || !Guid.TryParse(userId, out var parsedUserId))
        {
            return false;
        }

        var subscription = await _dbContext.Set<UserSubscription>()
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.UserId == parsedUserId && !s.IsDeleted);

        if (subscription is null)
        {
            return false;
        }

        return subscription.Status is "active" or "trialing" or "past_due";
    }

    private bool IsAllAccessAdmin()
    {
        var accessScope = User.FindFirstValue("access_scope") ?? string.Empty;
        if (string.Equals(accessScope, "admin", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        var adminPassClaim = User.FindFirstValue("admin_pass") ?? string.Empty;
        return string.Equals(adminPassClaim, "all-access", StringComparison.OrdinalIgnoreCase);
    }

    private static VideoLibraryVideo BuildFallbackVideo(string userId, RavensightVideoUploadDto upload, string absoluteVideoUrl, string? youtubeUrl, string? tiktokUrl, string? facebookUrl, string resolvedStorageMode, bool hasActiveSubscription)
    {
        var title = string.IsNullOrWhiteSpace(upload.Title) ? "Saved Video" : upload.Title.Trim();
        var description = upload.Description ?? string.Empty;
        var now = DateTime.UtcNow;

        return new VideoLibraryVideo
        {
            Id = $"local-{Guid.NewGuid():N}",
            UserId = userId,
            Title = title,
            Description = description,
            Tags = ParseTags(upload.Tags).ToList(),
            VideoUrl = absoluteVideoUrl,
            ThumbnailUrl = string.Empty,
            Status = "published",
            PrivacyStatus = string.IsNullOrWhiteSpace(upload.PrivacyStatus) ? "unlisted" : upload.PrivacyStatus,
            YouTubeUrl = youtubeUrl,
            TikTokUrl = tiktokUrl,
            FacebookUrl = facebookUrl,
            StorageMode = resolvedStorageMode,
            RetentionStatus = VideoRetentionPolicy.GetStorageStatus(now, upload.IsPermanent, nowUtc: now, hasActiveSubscription: hasActiveSubscription),
            CreatedAt = now,
            UpdatedAt = now
        };
    }

    private static IReadOnlyList<string> ParseTags(string? rawTags)
    {
        if (string.IsNullOrWhiteSpace(rawTags))
        {
            return [];
        }

        try
        {
            var parsed = System.Text.Json.JsonSerializer.Deserialize<List<string>>(rawTags) ?? [];
            return parsed.Where(t => !string.IsNullOrWhiteSpace(t)).Select(t => t.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        }
        catch
        {
            return rawTags.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        }
    }
}

public sealed class RavensightVideoUploadDto
{
    public IFormFile? Video { get; set; }
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
    public string? Tags { get; set; }
    public string? PrivacyStatus { get; set; }
    public string? StorageMode { get; set; }
    public bool IsPermanent { get; set; }
}

public sealed class AddVideoCommentRequest
{
    public string Comment { get; set; } = string.Empty;
}

public sealed class SaveVideoReferenceRequest
{
    public string VideoUrl { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string ThumbnailUrl { get; set; } = string.Empty;
    public string DestinationFolder { get; set; } = string.Empty;
    public string PrivacyStatus { get; set; } = "unlisted";
    public List<string>? Tags { get; set; }
}
