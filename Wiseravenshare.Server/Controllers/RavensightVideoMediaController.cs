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

    public RavensightVideoMediaController(IRavensightVideoService videoService, VideoLibraryStore videoLibraryStore, AppDbContext dbContext, ILogger<RavensightVideoMediaController> logger, RavensightMediaCatalogStore mediaCatalogStore)
    {
        _videoService = videoService;
        _videoLibraryStore = videoLibraryStore;
        _dbContext = dbContext;
        _logger = logger;
        _mediaCatalogStore = mediaCatalogStore;
    }

    [HttpPost("save")]
    [RequestSizeLimit(500_000_000)]
    [RequestFormLimits(MultipartBodyLengthLimit = 500_000_000)]
    [ProducesResponseType(typeof(RavensightSavedMediaDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> SaveVideo([FromForm] SaveRavensightVideoDto dto, CancellationToken cancellationToken)
    {
        if (dto.File is null || dto.File.Length == 0)
        {
            return BadRequest(new { message = "No video file uploaded." });
        }

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
            dto.File,
            dto.Title,
            dto.Description,
            dto.DestinationFolder,
            privacy,
            cancellationToken);

        var hasActiveSubscription = await HasActiveSubscriptionAsync(userId);
        var resolvedStorageMode = VideoRetentionPolicy.ResolveStorageMode(dto.StorageMode, dto.IsPermanent, hasActiveSubscription);

        var mediaUrl = !string.IsNullOrWhiteSpace(saved.File.PublicUrl)
            ? saved.File.PublicUrl
            : $"{Request.Scheme}://{Request.Host}/api/videostreaming/stream?fileName={Uri.EscapeDataString(saved.File.FileName)}";
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
        var mediaRecord = await _mediaCatalogStore.CreateAssetAsync(new CreateRavensightMediaAssetRequest
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
                storageMode = resolvedStorageMode
            })
        }, cancellationToken);

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
                    IsPermanent = resolvedStorageMode == "permanent"
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

    private async Task<bool> HasActiveSubscriptionAsync(Guid userId)
    {
        if (IsAllAccessAdmin())
        {
            return true;
        }

        var subscription = await _dbContext.Set<UserSubscription>()
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.UserId == userId && !s.IsDeleted);

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
}
