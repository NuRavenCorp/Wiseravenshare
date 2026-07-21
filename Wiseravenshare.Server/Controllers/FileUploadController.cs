using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using System.Security.Claims;
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

    public MediaController(IWebHostEnvironment environment, IYouTubeService youTubeService, VideoLibraryStore videoLibraryStore)
    {
        _environment = environment;
        _youTubeService = youTubeService;
        _videoLibraryStore = videoLibraryStore;
    }

    [HttpPost("upload")]
    [RequestSizeLimit(500_000_000)]
    public async Task<IActionResult> UploadMedia([FromForm] MediaUploadDto upload)
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

        var uniqueFileName = $"{Guid.NewGuid()}{extension}";
        var uploadsFolder = Path.Combine(_environment.ContentRootPath, "MediaStorage");
        Directory.CreateDirectory(uploadsFolder);

        var filePath = Path.Combine(uploadsFolder, uniqueFileName);
        await using (var stream = new FileStream(filePath, FileMode.Create))
        {
            await upload.File.CopyToAsync(stream);
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
            });
        }

        return Ok(new { filePath, fileName = uniqueFileName, youtubeUrl, tiktokUrl, facebookUrl, video });
    }
}

public sealed class MediaUploadDto
{
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
}
