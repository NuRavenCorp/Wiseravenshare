using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class MediaController : ControllerBase
    {
        private readonly IWebHostEnvironment _environment;
        private readonly IYouTubeService _youTubeService;

        public MediaController(IWebHostEnvironment environment, IYouTubeService youTubeService)
        {
            _environment = environment;
            _youTubeService = youTubeService;
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

            string? youtubeUrl = null;
            string? tiktokUrl = null;

            if (upload.PublishToYouTube && isVideo)
            {
                youtubeUrl = await _youTubeService.UploadVideoAsync(upload.File, upload.Title, upload.Description);
            }

            if (upload.PublishToTikTok && isVideo)
            {
                tiktokUrl = await _youTubeService.UploadTikTokVideoAsync(upload.File, upload.Title, upload.Description);
            }

            return Ok(new { filePath, fileName = uniqueFileName, youtubeUrl, tiktokUrl });
        }
    }

    public sealed class MediaUploadDto
    {
        public IFormFile? File { get; set; }
        public bool PublishToYouTube { get; set; }
        public bool PublishToTikTok { get; set; }
        public string YouTubeChannelOrEmail { get; set; } = string.Empty;
        public string TikTokUsername { get; set; } = string.Empty;
        public bool YouTubePermissionGranted { get; set; }
        public bool TikTokPermissionGranted { get; set; }
        public string Title { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
    }
}
