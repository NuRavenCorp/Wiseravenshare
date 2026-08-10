using System.Security.Claims;
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

    public RavensightVideoMediaController(IRavensightVideoService videoService, VideoLibraryStore videoLibraryStore, AppDbContext dbContext, ILogger<RavensightVideoMediaController> logger)
    {
        _videoService = videoService;
        _videoLibraryStore = videoLibraryStore;
        _dbContext = dbContext;
        _logger = logger;
    }

    [HttpPost("save")]
    [RequestSizeLimit(500_000_000)]
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

        var mediaUrl = $"{Request.Scheme}://{Request.Host}/api/videostreaming/stream?fileName={Uri.EscapeDataString(saved.File.FileName)}";
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

        VideoLibraryVideo persistedVideo;
        try
        {
            persistedVideo = await _videoLibraryStore.CreateVideoAsync(new CreateVideoLibraryEntryRequest
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

        return Ok(new
        {
            file = response,
            fileName = response.FileName,
            filePath = mediaUrl,
            mediaUrl,
            video = persistedVideo
        });
    }

    private async Task<bool> HasActiveSubscriptionAsync(Guid userId)
    {
        var subscription = await _dbContext.Set<UserSubscription>()
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.UserId == userId && !s.IsDeleted);

        if (subscription is null)
        {
            return false;
        }

        return subscription.Status is "active" or "trialing" or "past_due";
    }

    private bool TryResolveUserId(out Guid userId)
    {
        var userIdRaw = User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? User.FindFirstValue("sub")
            ?? User.FindFirstValue("id");

        return Guid.TryParse(userIdRaw, out userId) && userId != Guid.Empty;
    }
}
