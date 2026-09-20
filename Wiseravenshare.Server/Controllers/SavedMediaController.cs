// Wiseravenshare.Server/Controllers/SavedMediaController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using Wiseravenshare.Server.DTOs;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Controllers
{
    /// <summary>
    /// Controller for managing user's saved media library
    /// Endpoints for saving, organizing, and toggling visibility of photos, videos, and music
    /// </summary>
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class SavedMediaController : ControllerBase
    {
        private readonly ISavedMediaService _savedMediaService;
        private readonly ILogger<SavedMediaController> _logger;

        public SavedMediaController(
            ISavedMediaService savedMediaService,
            ILogger<SavedMediaController> logger)
        {
            _savedMediaService = savedMediaService;
            _logger = logger;
        }

        /// <summary>
        /// Gets the current user's ID from JWT claims
        /// </summary>
        private Guid GetUserId()
        {
            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier);
            if (userIdClaim == null || !Guid.TryParse(userIdClaim.Value, out var userId))
                throw new UnauthorizedAccessException("Invalid or missing user ID in token");
            return userId;
        }

        /// <summary>
        /// Save a new media item to the user's library
        /// </summary>
        /// <param name="request">Media details to save</param>
        /// <returns>Saved media response with ID</returns>
        [HttpPost("save")]
        [ProducesResponseType(StatusCodes.Status201Created)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        public async Task<ActionResult<SavedMediaResponse>> SaveMedia(CreateSavedMediaRequest request)
        {
            try
            {
                _logger.LogInformation("Saving media: {Title}", request.Title);

                if (string.IsNullOrWhiteSpace(request.Title))
                    return BadRequest(new { message = "Title is required" });

                if (string.IsNullOrWhiteSpace(request.MediaUrl))
                    return BadRequest(new { message = "MediaUrl is required" });

                var userId = GetUserId();
                var result = await _savedMediaService.SaveMediaAsync(userId, request);

                return CreatedAtAction(nameof(GetMedia), new { mediaId = result.Id }, result);
            }
            catch (ArgumentException ex)
            {
                _logger.LogError(ex, "Error saving media");
                return BadRequest(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unexpected error saving media");
                return StatusCode(500, new { message = "Error saving media" });
            }
        }

        /// <summary>
        /// Get a specific saved media item
        /// </summary>
        /// <param name="mediaId">ID of the media to retrieve</param>
        /// <returns>Saved media details</returns>
        [HttpGet("{mediaId}")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<ActionResult<SavedMediaResponse>> GetMedia(Guid mediaId)
        {
            try
            {
                var userId = GetUserId();
                var result = await _savedMediaService.GetMediaAsync(userId, mediaId);
                return Ok(result);
            }
            catch (UnauthorizedAccessException ex)
            {
                _logger.LogWarning(ex, "Unauthorized access to media {MediaId}", mediaId);
                return Unauthorized(new { message = ex.Message });
            }
            catch (ArgumentException ex)
            {
                _logger.LogWarning(ex, "Media {MediaId} not found", mediaId);
                return NotFound(new { message = ex.Message });
            }
        }

        /// <summary>
        /// Get the user's entire media library with optional filtering
        /// </summary>
        /// <param name="page">Page number (1-based)</param>
        /// <param name="pageSize">Items per page</param>
        /// <param name="mediaType">Optional filter by media type</param>
        /// <param name="onlyVisible">Optional filter to show only visible or hidden items</param>
        /// <returns>Paginated list of saved media</returns>
        [HttpGet("library")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        public async Task<ActionResult<MediaLibraryResponse>> GetLibrary(
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 20,
            [FromQuery] MediaLibraryType? mediaType = null,
            [FromQuery] bool? onlyVisible = null)
        {
            try
            {
                if (page < 1) page = 1;
                if (pageSize < 1 || pageSize > 100) pageSize = 20;

                var userId = GetUserId();
                var result = await _savedMediaService.GetUserLibraryAsync(userId, page, pageSize, mediaType, onlyVisible);
                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving media library");
                return StatusCode(500, new { message = "Error retrieving media library" });
            }
        }

        /// <summary>
        /// Get only hidden media items from the library
        /// </summary>
        /// <param name="page">Page number (1-based)</param>
        /// <param name="pageSize">Items per page</param>
        /// <returns>Paginated list of hidden media</returns>
        [HttpGet("library/hidden")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        public async Task<ActionResult<MediaLibraryResponse>> GetHiddenMedia(
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 20)
        {
            try
            {
                if (page < 1) page = 1;
                if (pageSize < 1 || pageSize > 100) pageSize = 20;

                var userId = GetUserId();
                var result = await _savedMediaService.GetHiddenMediaAsync(userId, page, pageSize);
                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving hidden media");
                return StatusCode(500, new { message = "Error retrieving hidden media" });
            }
        }

        /// <summary>
        /// Get only visible media items from the library
        /// </summary>
        /// <param name="page">Page number (1-based)</param>
        /// <param name="pageSize">Items per page</param>
        /// <returns>Paginated list of visible media</returns>
        [HttpGet("library/visible")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        public async Task<ActionResult<MediaLibraryResponse>> GetVisibleMedia(
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 20)
        {
            try
            {
                if (page < 1) page = 1;
                if (pageSize < 1 || pageSize > 100) pageSize = 20;

                var userId = GetUserId();
                var result = await _savedMediaService.GetVisibleMediaAsync(userId, page, pageSize);
                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving visible media");
                return StatusCode(500, new { message = "Error retrieving visible media" });
            }
        }

        /// <summary>
        /// Get media by tag
        /// </summary>
        /// <param name="tag">Tag to filter by</param>
        /// <param name="page">Page number (1-based)</param>
        /// <param name="pageSize">Items per page</param>
        /// <returns>Paginated list of tagged media</returns>
        [HttpGet("library/tag/{tag}")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        public async Task<ActionResult<MediaLibraryResponse>> GetTaggedMedia(
            string tag,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 20)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(tag))
                    return BadRequest(new { message = "Tag is required" });

                if (page < 1) page = 1;
                if (pageSize < 1 || pageSize > 100) pageSize = 20;

                var userId = GetUserId();
                var result = await _savedMediaService.GetTaggedMediaAsync(userId, tag, page, pageSize);
                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving tagged media");
                return StatusCode(500, new { message = "Error retrieving tagged media" });
            }
        }

        /// <summary>
        /// Get scheduled media that's pending publishing
        /// </summary>
        /// <param name="page">Page number (1-based)</param>
        /// <param name="pageSize">Items per page</param>
        /// <returns>Paginated list of scheduled media</returns>
        [HttpGet("library/scheduled")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        public async Task<ActionResult<MediaLibraryResponse>> GetScheduledMedia(
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 20)
        {
            try
            {
                if (page < 1) page = 1;
                if (pageSize < 1 || pageSize > 100) pageSize = 20;

                var userId = GetUserId();
                var result = await _savedMediaService.GetScheduledMediaAsync(userId, page, pageSize);
                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving scheduled media");
                return StatusCode(500, new { message = "Error retrieving scheduled media" });
            }
        }

        /// <summary>
        /// Update a saved media item
        /// </summary>
        /// <param name="mediaId">ID of the media to update</param>
        /// <param name="request">Updated media details</param>
        /// <returns>Updated media response</returns>
        [HttpPut("{mediaId}")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<ActionResult<SavedMediaResponse>> UpdateMedia(Guid mediaId, UpdateSavedMediaRequest request)
        {
            try
            {
                var userId = GetUserId();
                var result = await _savedMediaService.UpdateMediaAsync(userId, mediaId, request);
                return Ok(result);
            }
            catch (UnauthorizedAccessException ex)
            {
                _logger.LogWarning(ex, "Unauthorized access to media {MediaId}", mediaId);
                return Unauthorized(new { message = ex.Message });
            }
            catch (ArgumentException ex)
            {
                _logger.LogWarning(ex, "Media {MediaId} not found", mediaId);
                return NotFound(new { message = ex.Message });
            }
        }

        /// <summary>
        /// Toggle visibility of a single media item (hide/show)
        /// </summary>
        /// <param name="mediaId">ID of the media to toggle</param>
        /// <param name="request">Toggle request with desired visibility state</param>
        /// <returns>No content response</returns>
        [HttpPatch("{mediaId}/toggle-visibility")]
        [ProducesResponseType(StatusCodes.Status204NoContent)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> ToggleVisibility(Guid mediaId, ToggleVisibilityRequest request)
        {
            try
            {
                if (request.MediaId != mediaId)
                    return BadRequest(new { message = "Media ID mismatch" });

                var userId = GetUserId();
                await _savedMediaService.ToggleVisibilityAsync(userId, mediaId, request.IsVisibleInFeed);
                return NoContent();
            }
            catch (UnauthorizedAccessException ex)
            {
                _logger.LogWarning(ex, "Unauthorized access to media {MediaId}", mediaId);
                return Unauthorized(new { message = ex.Message });
            }
            catch (ArgumentException ex)
            {
                _logger.LogWarning(ex, "Media {MediaId} not found", mediaId);
                return NotFound(new { message = ex.Message });
            }
        }

        /// <summary>
        /// Bulk toggle visibility of multiple media items at once
        /// </summary>
        /// <param name="request">Bulk toggle request with media IDs and desired visibility</param>
        /// <returns>No content response</returns>
        [HttpPatch("bulk/toggle-visibility")]
        [ProducesResponseType(StatusCodes.Status204NoContent)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        public async Task<IActionResult> BulkToggleVisibility(BulkToggleVisibilityRequest request)
        {
            try
            {
                if (request.MediaIds == null || request.MediaIds.Length == 0)
                    return BadRequest(new { message = "At least one media ID is required" });

                if (request.MediaIds.Length > 100)
                    return BadRequest(new { message = "Maximum 100 items can be toggled at once" });

                var userId = GetUserId();
                await _savedMediaService.BulkToggleVisibilityAsync(userId, request);
                return NoContent();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in bulk toggle visibility");
                return StatusCode(500, new { message = "Error toggling visibility" });
            }
        }

        /// <summary>
        /// Delete a media item from the library
        /// </summary>
        /// <param name="mediaId">ID of the media to delete</param>
        /// <returns>No content response</returns>
        [HttpDelete("{mediaId}")]
        [ProducesResponseType(StatusCodes.Status204NoContent)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> DeleteMedia(Guid mediaId)
        {
            try
            {
                var userId = GetUserId();
                await _savedMediaService.DeleteMediaAsync(userId, mediaId);
                return NoContent();
            }
            catch (UnauthorizedAccessException ex)
            {
                _logger.LogWarning(ex, "Unauthorized access to media {MediaId}", mediaId);
                return Unauthorized(new { message = ex.Message });
            }
            catch (ArgumentException ex)
            {
                _logger.LogWarning(ex, "Media {MediaId} not found", mediaId);
                return NotFound(new { message = ex.Message });
            }
        }

        /// <summary>
        /// Publish a saved media item as a post to the feed
        /// </summary>
        /// <param name="request">Publish request with media ID and optional post content</param>
        /// <returns>Published media response</returns>
        [HttpPost("publish")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<ActionResult<SavedMediaResponse>> PublishMedia(PublishMediaRequest request)
        {
            try
            {
                var userId = GetUserId();
                var result = await _savedMediaService.PublishMediaAsync(userId, request);
                return Ok(result);
            }
            catch (UnauthorizedAccessException ex)
            {
                _logger.LogWarning(ex, "Unauthorized access to media {MediaId}", request.MediaId);
                return Unauthorized(new { message = ex.Message });
            }
            catch (ArgumentException ex)
            {
                _logger.LogWarning(ex, "Error publishing media {MediaId}", request.MediaId);
                return NotFound(new { message = ex.Message });
            }
        }

        /// <summary>
        /// Get statistics about the user's media library
        /// </summary>
        /// <returns>Library statistics</returns>
        [HttpGet("library/stats")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        public async Task<ActionResult<MediaLibraryStatsResponse>> GetLibraryStats()
        {
            try
            {
                var userId = GetUserId();
                var result = await _savedMediaService.GetLibraryStatsAsync(userId);
                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving library stats");
                return StatusCode(500, new { message = "Error retrieving library stats" });
            }
        }

        /// <summary>
        /// Add a tag to a media item
        /// </summary>
        /// <param name="mediaId">ID of the media</param>
        /// <param name="tag">Tag to add</param>
        /// <returns>No content response</returns>
        [HttpPost("{mediaId}/tags/{tag}")]
        [ProducesResponseType(StatusCodes.Status204NoContent)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> AddTag(Guid mediaId, string tag)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(tag))
                    return BadRequest(new { message = "Tag is required" });

                var userId = GetUserId();
                await _savedMediaService.AddTagToMediaAsync(userId, mediaId, tag);
                return NoContent();
            }
            catch (UnauthorizedAccessException ex)
            {
                return Unauthorized(new { message = ex.Message });
            }
            catch (ArgumentException ex)
            {
                return NotFound(new { message = ex.Message });
            }
        }

        /// <summary>
        /// Remove a tag from a media item
        /// </summary>
        /// <param name="mediaId">ID of the media</param>
        /// <param name="tag">Tag to remove</param>
        /// <returns>No content response</returns>
        [HttpDelete("{mediaId}/tags/{tag}")]
        [ProducesResponseType(StatusCodes.Status204NoContent)]
        [ProducesResponseType(StatusCodes.Status401Unauthorized)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        public async Task<IActionResult> RemoveTag(Guid mediaId, string tag)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(tag))
                    return BadRequest(new { message = "Tag is required" });

                var userId = GetUserId();
                await _savedMediaService.RemoveTagFromMediaAsync(userId, mediaId, tag);
                return NoContent();
            }
            catch (UnauthorizedAccessException ex)
            {
                return Unauthorized(new { message = ex.Message });
            }
            catch (ArgumentException ex)
            {
                return NotFound(new { message = ex.Message });
            }
        }
    }
}
