// Wiseravenshare.Server/Controllers/VideoController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.DTOs.Video;
using Wiseravenshare.Server.Models;
using Wiseravenshare.Server.Services;
using Wiseravenshare.Server.DTOs.Video;

namespace Wiseravenshare.Server.Controllers
{

    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    [Produces("application/json")]
    public class VideoController : ControllerBase
    {
        private readonly IVideoService _videoService;
        private readonly ILogger<VideoController> _logger;

        public VideoController(IVideoService videoService, ILogger<VideoController> logger)
        {
            _videoService = videoService;
            _logger = logger;
        }

        /// <summary>
        /// Upload a video
        /// </summary>
        [HttpPost("upload")]
        [RequestSizeLimit(524288000)] // 500MB
        [ProducesResponseType(typeof(VideoDto), StatusCodes.Status201Created)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
        public async Task<IActionResult> UploadVideo([FromForm] UploadVideoDto dto)
        {
            var userId = User.GetUserId();
            var video = await _videoService.UploadVideoAsync(userId, dto);
            return CreatedAtAction(nameof(GetVideo), new { id = video.Id }, video);
        }

        /// <summary>
        /// Get video by ID
        /// </summary>
        [HttpGet("{id}")]
        [AllowAnonymous]
        [ProducesResponseType(typeof(VideoDto), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> GetVideo(Guid id)
        {
            var video = await _videoService.GetVideoAsync(id);
            return Ok(video);
        }

        /// <summary>
        /// Update video details
        /// </summary>
        [HttpPut("{id}")]
        [ProducesResponseType(typeof(VideoDto), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(ErrorResponse), StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> UpdateVideo(Guid id, [FromBody] UpdateVideoDto dto)
        {
            var userId = User.GetUserId();
            var video = await _videoService.UpdateVideoAsync(userId, id, dto);
            return Ok(video);
        }

        /// <summary>
        /// Delete a video
        /// </summary>
        [HttpDelete("{id}")]
        [ProducesResponseType(StatusCodes.Status204NoContent)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> DeleteVideo(Guid id)
        {
            var userId = User.GetUserId();
            await _videoService.DeleteVideoAsync(userId, id);
            return NoContent();
        }

        /// <summary>
        /// Get user's videos
        /// </summary>
        [HttpGet("user/{userId}")]
        [AllowAnonymous]
        [ProducesResponseType(typeof(IEnumerable<VideoDto>), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetUserVideos(Guid userId, [FromQuery] int page = 1, [FromQuery] int pageSize = 20)
        {
            var videos = await _videoService.GetUserVideosAsync(userId, page, pageSize);
            return Ok(videos);
        }

        /// <summary>
        /// Get video feed
        /// </summary>
        [HttpGet("feed")]
        [AllowAnonymous]
        [ProducesResponseType(typeof(IEnumerable<VideoDto>), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetVideoFeed([FromQuery] string? filter = null, [FromQuery] int page = 1, [FromQuery] int pageSize = 20)
        {
            var videos = await _videoService.GetVideoFeedAsync(filter, page, pageSize);
            return Ok(videos);
        }

        /// <summary>
        /// Like a video
        /// </summary>
        [HttpPost("{id}/like")]
        [ProducesResponseType(StatusCodes.Status204NoContent)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> LikeVideo(Guid id)
        {
            var userId = User.GetUserId();
            await _videoService.LikeVideoAsync(userId, id);
            return NoContent();
        }

        /// <summary>
        /// Unlike a video
        /// </summary>
        [HttpDelete("{id}/like")]
        [ProducesResponseType(StatusCodes.Status204NoContent)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> UnlikeVideo(Guid id)
        {
            var userId = User.GetUserId();
            await _videoService.UnlikeVideoAsync(userId, id);
            return NoContent();
        }

        /// <summary>
        /// Share a video
        /// </summary>
        [HttpPost("{id}/share")]
        [ProducesResponseType(StatusCodes.Status204NoContent)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> ShareVideo(Guid id)
        {
            var userId = User.GetUserId();
            await _videoService.ShareVideoAsync(userId, id);
            return NoContent();
        }

        /// <summary>
        /// Get video analytics
        /// </summary>
        [HttpGet("{id}/analytics")]
        [Authorize(Roles = "Admin,Moderator")]
        [ProducesResponseType(typeof(VideoAnalyticsDto), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetVideoAnalytics(Guid id)
        {
            var analytics = await _videoService.GetVideoAnalyticsAsync(id);
            return Ok(analytics);
        }
    }
}