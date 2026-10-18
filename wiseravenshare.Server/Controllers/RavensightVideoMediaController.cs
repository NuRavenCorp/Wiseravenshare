using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Wiseravenshare.Server.DTOs;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Infrastructure.Data;
using Wiseravenshare.Server.Models;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Authorize]
[Route("api/ravensight/media/videos")]
public sealed class RavensightVideoMediaController : ControllerBase
{
    private readonly IRavensightVideoService _videoService;
    private readonly VideoLibraryStore _videoLibraryStore;
    private readonly AppDbContext _dbContext;
    private readonly ILogger<RavensightVideoMediaController> _logger;
    private readonly RavensightMediaCatalogStore _mediaCatalogStore;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IBlobStorageService _blobStorageService;

    public RavensightVideoMediaController(IRavensightVideoService videoService, VideoLibraryStore videoLibraryStore, AppDbContext dbContext, ILogger<RavensightVideoMediaController> logger, RavensightMediaCatalogStore mediaCatalogStore, IHttpClientFactory httpClientFactory, IBlobStorageService blobStorageService)
    {
        _videoService = videoService;
        _videoLibraryStore = videoLibraryStore;
        _dbContext = dbContext;
        _logger = logger;
        _mediaCatalogStore = mediaCatalogStore;
        _httpClientFactory = httpClientFactory;
        _blobStorageService = blobStorageService;
    }

    [HttpGet]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetUserVideos(CancellationToken cancellationToken)
    {
        if (!TryResolveUserId(out var userId))
            return Unauthorized(new { message = "Unable to determine current user." });

        try
        {
            var videos = (await _videoLibraryStore.GetUserVideosAsync(userId.ToString(), cancellationToken)).ToList();
            try
            {
                // Durable catalog entries survive when the secondary video-library write degrades.
                var assets = await _mediaCatalogStore.GetUserAssetsAsync(userId, "video", 200, cancellationToken);
                var knownUrls = videos
                    .Select(video => NormalizeMediaUrl(video.VideoUrl))
                    .Where(url => !string.IsNullOrWhiteSpace(url))
                    .ToHashSet(StringComparer.OrdinalIgnoreCase);

                foreach (var asset in assets)
                {
                    var mediaUrl = StreamingUrlHelper.ResolveMediaUrl(
                        asset.PublicUrl,
                        StreamingUrlHelper.StreamByBlobPath(asset.RelativePath) ?? StreamingUrlHelper.StreamByFileName(asset.FileName));
                    var normalizedUrl = NormalizeMediaUrl(mediaUrl);
                    if (string.IsNullOrWhiteSpace(normalizedUrl) || !knownUrls.Add(normalizedUrl)) continue;

                    videos.Add(new VideoLibraryVideo
                    {
                        Id = asset.Id,
                        UserId = userId.ToString(),
                        Title = TryReadMetadataString(asset.MetadataJson, "title", Path.GetFileNameWithoutExtension(asset.FileName)),
                        Description = TryReadMetadataString(asset.MetadataJson, "description", string.Empty),
                        VideoUrl = mediaUrl,
                        ThumbnailUrl = string.Empty,
                        Status = "published",
                        PrivacyStatus = "unlisted",
                        StorageMode = TryReadMetadataString(asset.MetadataJson, "storageMode", "temporary"),
                        Archived = TryReadMetadataBool(asset.MetadataJson, "archived"),
                        Protected = TryReadMetadataBool(asset.MetadataJson, "protected"),
                        CreatedAt = asset.SavedAtUtc,
                        UpdatedAt = asset.SavedAtUtc
                    });
                }
            }
            catch (Exception catalogException)
            {
                _logger.LogWarning(catalogException, "Could not merge media catalog rows into video listing for user {UserId}.", userId);
            }

            return Ok(videos.OrderByDescending(video => video.CreatedAt).ToList());
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Falling back to media catalog for video listing for user {UserId}.", userId);
            var assets = await _mediaCatalogStore.GetUserAssetsAsync(userId, "video", 200, cancellationToken);
            var videos = assets.Select(asset => new VideoLibraryVideo
            {
                Id = asset.Id,
                UserId = userId.ToString(),
                Title = TryReadMetadataString(asset.MetadataJson, "title", Path.GetFileNameWithoutExtension(asset.FileName)),
                Description = TryReadMetadataString(asset.MetadataJson, "description", string.Empty),
                VideoUrl = StreamingUrlHelper.ResolveMediaUrl(
                    asset.PublicUrl,
                    StreamingUrlHelper.StreamByBlobPath(asset.RelativePath) ?? StreamingUrlHelper.StreamByFileName(asset.FileName)),
                ThumbnailUrl = string.Empty,
                Status = "published",
                PrivacyStatus = "unlisted",
                StorageMode = TryReadMetadataString(asset.MetadataJson, "storageMode", "temporary"),
                Archived = TryReadMetadataBool(asset.MetadataJson, "archived"),
                Protected = TryReadMetadataBool(asset.MetadataJson, "protected"),
                CreatedAt = asset.SavedAtUtc,
                UpdatedAt = asset.SavedAtUtc
            }).ToList();

            return Ok(videos);
        }
    }

    [HttpDelete("{videoId}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DeleteVideo([FromRoute] string videoId, CancellationToken cancellationToken = default)
    {
        if (!TryResolveUserId(out var userId))
            return Unauthorized(new { message = "Unable to determine current user." });

        var normalizedVideoId = string.IsNullOrWhiteSpace(videoId) ? string.Empty : videoId.Trim();
        if (string.IsNullOrWhiteSpace(normalizedVideoId))
        {
            return BadRequest(new { message = "videoId is required." });
        }

        var userVideos = await _videoLibraryStore.GetUserVideosAsync(userId.ToString(), cancellationToken);
        var video = userVideos.FirstOrDefault(v => string.Equals(v.Id, normalizedVideoId, StringComparison.OrdinalIgnoreCase));

        var deleted = await _videoLibraryStore.DeleteVideoAsync(normalizedVideoId, userId.ToString(), cancellationToken);
        var removedFileNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var blobDeleted = false;

        if (video is not null)
        {
            if (!string.IsNullOrWhiteSpace(video.Title))
            {
                removedFileNames.Add(video.Title);
            }

            var matchingAssets = await _mediaCatalogStore.GetUserAssetsAsync(userId, "video", 500, cancellationToken);
            foreach (var asset in matchingAssets.Where(a =>
                         string.Equals(a.FileName, Path.GetFileName(video.VideoUrl), StringComparison.OrdinalIgnoreCase)
                         || string.Equals(StreamingUrlHelper.ResolveMediaUrl(a.PublicUrl, StreamingUrlHelper.StreamByFileName(a.FileName)), video.VideoUrl, StringComparison.OrdinalIgnoreCase)
                         || string.Equals(StreamingUrlHelper.ResolveMediaUrl(a.PublicUrl, StreamingUrlHelper.StreamByBlobPath(a.RelativePath) ?? string.Empty), video.VideoUrl, StringComparison.OrdinalIgnoreCase)))
            {
                var objectKey = string.IsNullOrWhiteSpace(asset.RelativePath) ? null : asset.RelativePath;
                if (!string.IsNullOrWhiteSpace(objectKey))
                {
                    try
                    {
                        blobDeleted = await _blobStorageService.DeleteAsync(objectKey, cancellationToken) || blobDeleted;
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Failed to delete video blob for asset {AssetId}", asset.Id);
                    }
                }

                await _mediaCatalogStore.MarkAssetDeletedAsync(asset.Id, DateTime.UtcNow, cancellationToken);
                removedFileNames.Add(asset.FileName);
            }
        }

        if (!deleted && removedFileNames.Count == 0)
        {
            return NotFound(new { message = "Video not found." });
        }

        return Ok(new
        {
            success = true,
            id = normalizedVideoId,
            blobDeleted,
            removedFileNames = removedFileNames.ToArray()
        });
    }

    [HttpPost("save")]
    [RequestSizeLimit(500_000_000)]
    [RequestFormLimits(MultipartBodyLengthLimit = 500_000_000)]
    [ProducesResponseType(typeof(RavensightSavedMediaDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> SaveVideo([FromForm] SaveRavensightVideoDto dto, CancellationToken cancellationToken)
    {
        var file = dto.File;
        if (file is null || file.Length == 0)
        {
            file = Request.Form.Files.FirstOrDefault(f =>
                string.Equals(f.Name, "file", StringComparison.OrdinalIgnoreCase)
                || string.Equals(f.Name, "File", StringComparison.OrdinalIgnoreCase));
        }

        if (file is null || file.Length == 0)
        {
            return BadRequest(new { message = "No video file uploaded. Ensure the multipart field is named 'File'." });
        }

        dto.File = file;

        if (!TryResolveUserId(out var userId))
        {
            return Unauthorized(new { message = "Unable to determine current user." });
        }

        var privacy = PrivacyStatus.Unlisted;
        if (!string.IsNullOrWhiteSpace(dto.Privacy)
            && Enum.TryParse<PrivacyStatus>(dto.Privacy, true, out var parsedPrivacy))
        {
            privacy = parsedPrivacy;
        }

        var saved = await _videoService.SaveVideoAsync(
            userId,
            file,
            dto.Title,
            dto.Description,
            dto.DestinationFolder,
            ResolveUserStorageIdentity(userId),
            privacy,
            cancellationToken);

        var hasActiveSubscription = await HasActiveSubscriptionAsync(userId);
        var resolvedStorageMode = VideoRetentionPolicy.ResolveStorageMode(dto.StorageMode, dto.IsPermanent, hasActiveSubscription);

        var mediaUrl = StreamingUrlHelper.ResolveMediaUrl(
            saved.File.PublicUrl,
            StreamingUrlHelper.StreamByBlobPath(saved.File.RelativePath));
        var persistenceStatus = "ready";
        var response = new RavensightSavedMediaDto
        {
            FileName = saved.File.FileName,
            RelativePath = saved.File.RelativePath,
            DestinationFolder = saved.File.DestinationFolder,
            ContentType = saved.File.ContentType,
            SizeBytes = saved.File.SizeBytes,
            SavedAtUtc = saved.File.SavedAtUtc,
            MediaUrl = mediaUrl
        };

        var preference = await _mediaCatalogStore.GetUserPreferenceAsync(userId, cancellationToken);
        RavensightMediaAssetRecord? mediaRecord = null;
        try
        {
            mediaRecord = await _mediaCatalogStore.CreateAssetAsync(new CreateRavensightMediaAssetRequest
            {
                UserId = userId,
                MediaType = RavensightMediaType.Video,
                FileName = saved.File.FileName,
                RelativePath = saved.File.RelativePath,
                PublicUrl = saved.File.PublicUrl,
                AbsolutePath = saved.File.AbsolutePath,
                DestinationFolder = saved.File.DestinationFolder,
                ContentType = saved.File.ContentType,
                SizeBytes = saved.File.SizeBytes,
                SavedAtUtc = saved.File.SavedAtUtc,
                MetadataJson = JsonSerializer.Serialize(new
                {
                    title = dto.Title,
                    description = dto.Description,
                    privacy = dto.Privacy,
                    storageMode = resolvedStorageMode,
                    music = string.IsNullOrWhiteSpace(dto.MusicTrackId)
                        ? null
                        : new
                        {
                            id = dto.MusicTrackId,
                            title = dto.MusicTrackTitle,
                            url = dto.MusicTrackUrl,
                            artist = dto.MusicTrackArtist,
                            album = dto.MusicTrackAlbum,
                            genre = dto.MusicTrackGenre
                        }
                })
            }, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Video catalog entry failed for user {UserId}; continuing without catalog record.", userId);
        }

        // Fire-and-forget HLS segmentation job — non-blocking
        _ = Task.Run(async () =>
        {
            try
            {
                using var hlsClient = _httpClientFactory.CreateClient("VideoProcessorService");
                var payload = System.Text.Json.JsonSerializer.Serialize(new
                {
                    object_key = saved.File.RelativePath,
                    user_id = userId.ToString("N"),
                    title = string.IsNullOrWhiteSpace(dto.Title) ? Path.GetFileNameWithoutExtension(dto.File.FileName) : dto.Title
                });
                using var content = new System.Net.Http.StringContent(payload, System.Text.Encoding.UTF8, "application/json");
                await hlsClient.PostAsync("/hls/jobs", content);
            }
            catch
            {
                // HLS processing is best-effort; the raw video URL remains the fallback.
            }
        });

        VideoLibraryVideo persistedVideo;
        try
        {
            persistedVideo = await RavensightPersistenceGuard.RunWithTimeoutAsync(
                async ct => await _videoLibraryStore.CreateVideoAsync(new CreateVideoLibraryEntryRequest
                {
                    UserId = userId.ToString(),
                    Title = string.IsNullOrWhiteSpace(dto.Title) ? Path.GetFileNameWithoutExtension(dto.File.FileName) : dto.Title.Trim(),
                    Description = dto.Description ?? string.Empty,
                    Tags = [],
                    VideoUrl = mediaUrl,
                    PrivacyStatus = "unlisted",
                    Status = "published",
                    StorageMode = resolvedStorageMode,
                    IsPermanent = resolvedStorageMode == "permanent",
                    MusicTrackId = string.IsNullOrWhiteSpace(dto.MusicTrackId) ? null : dto.MusicTrackId.Trim(),
                    MusicTrackTitle = string.IsNullOrWhiteSpace(dto.MusicTrackTitle) ? null : dto.MusicTrackTitle.Trim(),
                    MusicTrackUrl = string.IsNullOrWhiteSpace(dto.MusicTrackUrl) ? null : dto.MusicTrackUrl.Trim(),
                    MusicTrackArtist = string.IsNullOrWhiteSpace(dto.MusicTrackArtist) ? null : dto.MusicTrackArtist.Trim(),
                    MusicTrackAlbum = string.IsNullOrWhiteSpace(dto.MusicTrackAlbum) ? null : dto.MusicTrackAlbum.Trim(),
                    MusicTrackGenre = string.IsNullOrWhiteSpace(dto.MusicTrackGenre) ? null : dto.MusicTrackGenre.Trim()
                }, ct),
                BuildFallbackVideo(userId, dto, mediaUrl, resolvedStorageMode, hasActiveSubscription),
                TimeSpan.FromSeconds(5));
            persistenceStatus = "ready";
        }
        catch (PostgresException ex)
        {
            persistenceStatus = "degraded";
            _logger.LogError(ex, "Video library save failed at DB layer for user {UserId}; serving a local fallback video object.", userId);
            persistedVideo = BuildFallbackVideo(userId, dto, mediaUrl, resolvedStorageMode, hasActiveSubscription);
        }
        catch (Exception ex)
        {
            persistenceStatus = "degraded";
            _logger.LogError(ex, "Video library save failed unexpectedly for user {UserId}; serving a local fallback video object.", userId);
            persistedVideo = BuildFallbackVideo(userId, dto, mediaUrl, resolvedStorageMode, hasActiveSubscription);
        }

        return Ok(new
        {
            file = response,
            fileName = response.FileName,
            filePath = mediaUrl,
            mediaUrl,
            video = persistedVideo,
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

    [HttpPatch("{videoId}/state")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> UpdateVideoState(
        [FromRoute] string videoId,
        [FromBody] UpdateRavensightMediaStateRequest request,
        CancellationToken cancellationToken = default)
    {
        if (!TryResolveUserId(out var userId))
        {
            return Unauthorized(new { message = "Unable to determine current user." });
        }

        if (string.IsNullOrWhiteSpace(videoId))
        {
            return BadRequest(new { message = "videoId is required." });
        }

        var updated = await _videoLibraryStore.UpdateVideoStateAsync(
            videoId.Trim(),
            userId.ToString(),
            request.Archived ?? false,
            request.Protected ?? false,
            cancellationToken);

        if (!updated)
        {
            return NotFound(new { message = "Video not found." });
        }

        return Ok(new { success = true, archived = request.Archived ?? false, @protected = request.Protected ?? false });
    }

    private async Task<bool> HasActiveSubscriptionAsync(Guid userId)
    {
        if (IsAllAccessAdmin())
        {
            return true;
        }
        UserSubscription? subscription;
        try
        {
            subscription = await _dbContext.Set<UserSubscription>()
                .AsNoTracking()
                .FirstOrDefaultAsync(s => s.UserId == userId && !s.IsDeleted);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Unable to resolve active subscription for user {UserId}; defaulting to inactive for video retention.", userId);
            return false;
        }

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

    private static VideoLibraryVideo BuildFallbackVideo(Guid userId, SaveRavensightVideoDto dto, string mediaUrl, string resolvedStorageMode, bool hasActiveSubscription)
    {
        var title = string.IsNullOrWhiteSpace(dto.Title) ? "Saved Video" : dto.Title.Trim();
        var now = DateTime.UtcNow;

        return new VideoLibraryVideo
        {
            Id = $"local-{Guid.NewGuid():N}",
            UserId = userId.ToString(),
            Title = title,
            Description = dto.Description ?? string.Empty,
            Tags = [],
            VideoUrl = mediaUrl,
            ThumbnailUrl = string.Empty,
            Status = "published",
            PrivacyStatus = "unlisted",
            MusicTrackId = string.IsNullOrWhiteSpace(dto.MusicTrackId) ? null : dto.MusicTrackId.Trim(),
            MusicTrackTitle = string.IsNullOrWhiteSpace(dto.MusicTrackTitle) ? null : dto.MusicTrackTitle.Trim(),
            MusicTrackUrl = string.IsNullOrWhiteSpace(dto.MusicTrackUrl) ? null : dto.MusicTrackUrl.Trim(),
            MusicTrackArtist = string.IsNullOrWhiteSpace(dto.MusicTrackArtist) ? null : dto.MusicTrackArtist.Trim(),
            MusicTrackAlbum = string.IsNullOrWhiteSpace(dto.MusicTrackAlbum) ? null : dto.MusicTrackAlbum.Trim(),
            MusicTrackGenre = string.IsNullOrWhiteSpace(dto.MusicTrackGenre) ? null : dto.MusicTrackGenre.Trim(),
            StorageMode = resolvedStorageMode,
            RetentionStatus = VideoRetentionPolicy.GetStorageStatus(now, dto.IsPermanent, nowUtc: now, hasActiveSubscription: hasActiveSubscription),
            CreatedAt = now,
            UpdatedAt = now
        };
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

    private static string NormalizeMediaUrl(string? mediaUrl) =>
        string.IsNullOrWhiteSpace(mediaUrl) ? string.Empty : mediaUrl.Trim().TrimEnd('/');
    private static string TryReadMetadataString(string? metadataJson, string key, string fallback)
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

    private static bool TryReadMetadataBool(string? metadataJson, string key)
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
}
