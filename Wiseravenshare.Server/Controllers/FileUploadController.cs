using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using System.Security.Claims;
using Npgsql;
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
    private readonly VideoLibraryStore _videoLibraryStore;
    private readonly ILogger<MediaController> _logger;
    private readonly string _videoStorageFolderName;
    private readonly string _defaultVideoDestination;

    public MediaController(IWebHostEnvironment environment, IConfiguration configuration, IYouTubeService youTubeService, VideoLibraryStore videoLibraryStore, ILogger<MediaController> logger)
    {
        _environment = environment;
        _youTubeService = youTubeService;
        _videoLibraryStore = videoLibraryStore;
        _logger = logger;
        _videoStorageFolderName = configuration["Storage:Video:StorageFolderName"]?.Trim();
        if (string.IsNullOrWhiteSpace(_videoStorageFolderName))
        {
            _videoStorageFolderName = "ravensight_videos";
        }

        _defaultVideoDestination = NormalizeDestinationFolder(
            configuration["Storage:Video:DefaultFolder"],
            "wiseravenshare/ravensight/video");
    }

    [HttpPost("upload")]
    [RequestSizeLimit(500_000_000)]
    public async Task<IActionResult> UploadMedia([FromForm] MediaUploadDto upload, CancellationToken cancellationToken)
    {
        if (upload.File == null || upload.File.Length == 0)
        {
            return BadRequest("No file uploaded.");
        }

        var allowedTypes = new[] { ".mp4", ".mov", ".webm", ".jpg", ".png", ".mp3" };
        var extension = Path.GetExtension(upload.File.FileName).ToLowerInvariant();

        if (!allowedTypes.Contains(extension))
        {
            return BadRequest("Invalid file type.");
        }

        string uniqueFileName;
        try
        {
            uniqueFileName = await SaveMediaFileAsync(upload.File, extension, upload.DestinationFolder, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to persist uploaded media file.");
            return StatusCode(StatusCodes.Status500InternalServerError, new { message = "Unable to save uploaded file to storage." });
        }

        var isVideo = extension is ".mp4" or ".mov" or ".webm";
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

        if (upload.PublishToYouTube && isVideo)
        {
            youtubeUrl = await _youTubeService.UploadVideoAsync(upload.File, upload.Title, upload.Description);
        }

        if (upload.PublishToTikTok && isVideo)
        {
            tiktokUrl = await _youTubeService.UploadTikTokVideoAsync(upload.File, upload.Title, upload.Description);
        }

        if (upload.PublishToFacebook && isVideo)
        {
            facebookUrl = await _youTubeService.UploadFacebookVideoAsync(upload.File, upload.Title, upload.Description);
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

            var absoluteVideoUrl = $"{Request.Scheme}://{Request.Host}/api/videostreaming/stream?fileName={Uri.EscapeDataString(uniqueFileName)}";
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

        var mediaUrl = $"{Request.Scheme}://{Request.Host}/api/videostreaming/stream?fileName={Uri.EscapeDataString(uniqueFileName)}";
        return Ok(new
        {
            fileName = uniqueFileName,
            filePath = mediaUrl,
            mediaUrl,
            youtubeUrl,
            tiktokUrl,
            facebookUrl,
            video
        });
    }

    private async Task<string> SaveMediaFileAsync(IFormFile file, string extension, string? requestedDestinationFolder, CancellationToken cancellationToken)
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
    public string DestinationFolder { get; set; } = string.Empty;
    public bool PublishToYouTube { get; set; }
    public bool PublishToTikTok { get; set; }
    public bool PublishToFacebook { get; set; }
    public string YouTubeChannelOrEmail { get; set; } = string.Empty;
    public string TikTokUsername { get; set; } = string.Empty;
    public string FacebookPageOrProfile { get; set; } = string.Empty;
    public bool YouTubePermissionGranted { get; set; }
    public bool TikTokPermissionGranted { get; set; }
    public bool FacebookPermissionGranted { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
}
