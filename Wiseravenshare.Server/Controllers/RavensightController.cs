using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
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
        ".mp4", ".mov", ".webm"
    };

    private readonly IWebHostEnvironment _environment;
    private readonly IYouTubeService _youTubeService;
    private readonly VideoLibraryStore _videoStore;

    public RavensightController(IWebHostEnvironment environment, IYouTubeService youTubeService, VideoLibraryStore videoStore)
    {
        _environment = environment;
        _youTubeService = youTubeService;
        _videoStore = videoStore;
    }

    [HttpPost("upload")]
    [RequestSizeLimit(500_000_000)]
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

        var uniqueFileName = $"{Guid.NewGuid():N}{extension}";
        var uploadsFolder = Path.Combine(_environment.ContentRootPath, "MediaStorage");
        Directory.CreateDirectory(uploadsFolder);

        var filePath = Path.Combine(uploadsFolder, uniqueFileName);
        await using (var stream = new FileStream(filePath, FileMode.Create))
        {
            await file.CopyToAsync(stream, cancellationToken);
        }

        string? youtubeUrl = null;
        string? tiktokUrl = null;
        string? facebookUrl = null;

        if (upload.PublishToYouTube)
        {
            youtubeUrl = await _youTubeService.UploadVideoAsync(file, upload.Title, upload.Description);
        }

        if (upload.PublishToTikTok)
        {
            tiktokUrl = await _youTubeService.UploadTikTokVideoAsync(file, upload.Title, upload.Description);
        }

        if (upload.PublishToFacebook)
        {
            facebookUrl = await _youTubeService.UploadFacebookVideoAsync(file, upload.Title, upload.Description);
        }

        var absoluteVideoUrl = $"{Request.Scheme}://{Request.Host}/api/videostreaming/stream?fileName={Uri.EscapeDataString(uniqueFileName)}";

        var saved = await _videoStore.CreateVideoAsync(new CreateVideoLibraryEntryRequest
        {
            UserId = userId,
            Title = string.IsNullOrWhiteSpace(upload.Title) ? Path.GetFileNameWithoutExtension(file.FileName) : upload.Title,
            Description = upload.Description ?? string.Empty,
            Tags = ParseTags(upload.Tags),
            VideoUrl = absoluteVideoUrl,
            PrivacyStatus = string.IsNullOrWhiteSpace(upload.PrivacyStatus) ? "unlisted" : upload.PrivacyStatus,
            Status = "published",
            YouTubeUrl = youtubeUrl,
            TikTokUrl = tiktokUrl,
            FacebookUrl = facebookUrl
        }, cancellationToken);

        return Ok(new { video = saved });
    }

    [HttpGet("feed")]
    public async Task<IActionResult> GetFeed([FromQuery] string filter = "all", [FromQuery] int page = 1, [FromQuery] int limit = 10, CancellationToken cancellationToken = default)
    {
        var userId = GetCurrentUserId();
        var result = await _videoStore.GetFeedAsync(filter, userId, page, limit, cancellationToken);
        return Ok(new { videos = result.Videos, hasMore = result.HasMore });
    }

    [HttpGet("user")]
    public async Task<IActionResult> GetUserVideos(CancellationToken cancellationToken)
    {
        var userId = GetCurrentUserId();
        if (userId is null)
        {
            return Unauthorized(new { message = "Unable to determine current user." });
        }

        var videos = await _videoStore.GetUserVideosAsync(userId, cancellationToken);
        return Ok(new { videos });
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

        var deleted = await _videoStore.DeleteVideoAsync(videoId, userId, cancellationToken);
        return deleted ? Ok(new { success = true }) : NotFound(new { message = "Video not found." });
    }

    [HttpPost("{videoId}/like")]
    public async Task<IActionResult> LikeVideo([FromRoute] string videoId, CancellationToken cancellationToken)
    {
        var updated = await _videoStore.AddLikeAsync(videoId, cancellationToken);
        return updated ? Ok(new { success = true }) : NotFound(new { message = "Video not found." });
    }

    [HttpDelete("{videoId}/like")]
    public async Task<IActionResult> UnlikeVideo([FromRoute] string videoId, CancellationToken cancellationToken)
    {
        var updated = await _videoStore.RemoveLikeAsync(videoId, cancellationToken);
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
        return comment is null ? NotFound(new { message = "Video not found." }) : Ok(comment);
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
    public string Tags { get; set; } = "[]";
    public string PrivacyStatus { get; set; } = "unlisted";
}

public sealed class AddVideoCommentRequest
{
    public string Comment { get; set; } = string.Empty;
}
