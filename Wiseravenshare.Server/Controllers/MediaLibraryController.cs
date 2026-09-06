using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.DTOs;
using Wiseravenshare.Server.Exceptions;
using Wiseravenshare.Server.Services.Media;
using Wiseravenshare.Server.Shared;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Authorize]
[Route("api/media-library")]
public sealed class MediaLibraryController : ControllerBase
{
    private readonly IMediaService _mediaService;

    public MediaLibraryController(IMediaService mediaService)
    {
        _mediaService = mediaService;
    }

    [HttpPost("upload")]
    [RequestSizeLimit(500_000_000)]
    [ProducesResponseType(typeof(MediaItemDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> UploadMedia([FromForm] UploadMediaRequest request, CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        try
        {
            var media = await _mediaService.UploadMediaAsync(request, userId, cancellationToken);
            return Ok(media);
        }
        catch (BadRequestException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpGet("{mediaId:guid}")]
    [ProducesResponseType(typeof(MediaItemDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetMedia(Guid mediaId)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        try
        {
            var media = await _mediaService.GetMediaAsync(mediaId, userId);
            return Ok(media);
        }
        catch (NotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
        catch (UnauthorizedException ex)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = ex.Message });
        }
    }

    [HttpPut("{mediaId:guid}")]
    [ProducesResponseType(typeof(MediaItemDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> UpdateMedia(Guid mediaId, [FromBody] UpdateMediaRequest request)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        try
        {
            var media = await _mediaService.UpdateMediaAsync(mediaId, request, userId);
            return Ok(media);
        }
        catch (NotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
        catch (UnauthorizedException ex)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = ex.Message });
        }
    }

    [HttpDelete("{mediaId:guid}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> DeleteMedia(Guid mediaId)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        try
        {
            await _mediaService.DeleteMediaAsync(mediaId, userId);
            return Ok(new { success = true });
        }
        catch (NotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
        catch (UnauthorizedException ex)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = ex.Message });
        }
    }

    [HttpGet("mine")]
    [ProducesResponseType(typeof(IEnumerable<MediaItemDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetMyMedia([FromQuery] int page = 1, [FromQuery] int pageSize = 20)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        var media = await _mediaService.GetUserMediaAsync(userId, page, pageSize);
        return Ok(media);
    }

    [HttpPost("search")]
    [ProducesResponseType(typeof(IEnumerable<MediaItemDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> SearchMedia([FromBody] MediaSearchRequest request)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        var media = await _mediaService.SearchMediaAsync(request, userId);
        return Ok(media);
    }

    [HttpGet("{mediaId:guid}/stream")]
    public async Task<IActionResult> StreamMedia(Guid mediaId)
    {
        try
        {
            var stream = await _mediaService.GetMediaStreamAsync(mediaId);
            if (string.IsNullOrWhiteSpace(stream.FilePath) || !System.IO.File.Exists(stream.FilePath))
            {
                return NotFound(new { message = "Media file is not available on this node." });
            }

            return PhysicalFile(stream.FilePath, stream.MimeType, enableRangeProcessing: true);
        }
        catch (NotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpPost("{mediaId:guid}/like")]
    public async Task<IActionResult> LikeMedia(Guid mediaId)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        var media = await _mediaService.LikeMediaAsync(mediaId, userId);
        return Ok(media);
    }

    [HttpDelete("{mediaId:guid}/like")]
    public async Task<IActionResult> UnlikeMedia(Guid mediaId)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        await _mediaService.UnlikeMediaAsync(mediaId, userId);
        return Ok(new { success = true });
    }

    [HttpPost("{mediaId:guid}/bookmark")]
    public async Task<IActionResult> BookmarkMedia(Guid mediaId)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        await _mediaService.BookmarkMediaAsync(mediaId, userId);
        return Ok(new { success = true });
    }

    [HttpDelete("{mediaId:guid}/bookmark")]
    public async Task<IActionResult> UnbookmarkMedia(Guid mediaId)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        await _mediaService.UnbookmarkMediaAsync(mediaId, userId);
        return Ok(new { success = true });
    }

    [HttpPost("{mediaId:guid}/progress")]
    public async Task<IActionResult> SaveProgress(Guid mediaId, [FromBody] MediaProgressDto request)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        var progress = await _mediaService.SaveProgressAsync(mediaId, request, userId);
        return Ok(progress);
    }

    [HttpGet("{mediaId:guid}/streaming-status")]
    public async Task<IActionResult> GetStreamingStatus(Guid mediaId)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        var status = await _mediaService.GetStreamingStatusAsync(mediaId, userId);
        return Ok(status);
    }

    [HttpGet("playlists")]
    [ProducesResponseType(typeof(IEnumerable<PlaylistDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetPlaylists()
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        var playlists = await _mediaService.GetUserPlaylistsAsync(userId);
        return Ok(playlists);
    }

    [HttpPost("playlists")]
    [ProducesResponseType(typeof(PlaylistDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> CreatePlaylist([FromBody] CreatePlaylistRequest request)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        var playlist = await _mediaService.CreatePlaylistAsync(request, userId);
        return Ok(playlist);
    }

    [HttpGet("playlists/{playlistId:guid}")]
    [ProducesResponseType(typeof(PlaylistDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetPlaylist(Guid playlistId)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        var playlist = await _mediaService.GetPlaylistAsync(playlistId, userId);
        return Ok(playlist);
    }

    [HttpPut("playlists/{playlistId:guid}")]
    [ProducesResponseType(typeof(PlaylistDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> UpdatePlaylist(Guid playlistId, [FromBody] CreatePlaylistRequest request)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        var playlist = await _mediaService.UpdatePlaylistAsync(playlistId, request, userId);
        return Ok(playlist);
    }

    [HttpDelete("playlists/{playlistId:guid}")]
    public async Task<IActionResult> DeletePlaylist(Guid playlistId)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        await _mediaService.DeletePlaylistAsync(playlistId, userId);
        return Ok(new { success = true });
    }

    [HttpPost("playlists/{playlistId:guid}/items")]
    public async Task<IActionResult> AddToPlaylist(Guid playlistId, [FromBody] AddToPlaylistRequest request)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        var playlist = await _mediaService.AddToPlaylistAsync(playlistId, request, userId);
        return Ok(playlist);
    }

    [HttpDelete("playlists/{playlistId:guid}/items/{mediaId:guid}")]
    public async Task<IActionResult> RemoveFromPlaylist(Guid playlistId, Guid mediaId)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        await _mediaService.RemoveFromPlaylistAsync(playlistId, mediaId, userId);
        return Ok(new { success = true });
    }

    [HttpPost("playlists/{playlistId:guid}/reorder")]
    public async Task<IActionResult> ReorderPlaylist(Guid playlistId, [FromBody] ReorderPlaylistRequest request)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        await _mediaService.ReorderPlaylistAsync(playlistId, request, userId);
        return Ok(new { success = true });
    }
}
