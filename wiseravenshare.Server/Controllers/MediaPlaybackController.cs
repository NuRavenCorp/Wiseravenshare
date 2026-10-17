using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.DTOs;
using Wiseravenshare.Server.Services.Media;
using Wiseravenshare.Server.Shared;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Authorize]
[Route("api/playback")]
public sealed class MediaPlaybackController : ControllerBase
{
    private readonly IMediaPlaybackQueueService _playbackQueueService;

    public MediaPlaybackController(IMediaPlaybackQueueService playbackQueueService)
    {
        _playbackQueueService = playbackQueueService;
    }

    [HttpGet("music")]
    [ProducesResponseType(typeof(PlaybackQueueDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetMusicQueue(CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        var queue = await _playbackQueueService.GetMusicQueueAsync(userId, cancellationToken);
        return Ok(queue);
    }

    [HttpGet("videos")]
    [ProducesResponseType(typeof(PlaybackQueueDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetVideoQueue(CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        var queue = await _playbackQueueService.GetVideoQueueAsync(userId, cancellationToken);
        return Ok(queue);
    }
}
