using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.DTOs;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Authorize]
[Route("api/ravensight/media/videos")]
public sealed class RavensightVideoMediaController : ControllerBase
{
    private readonly IRavensightVideoService _videoService;

    public RavensightVideoMediaController(IRavensightVideoService videoService)
    {
        _videoService = videoService;
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

        return Ok(new
        {
            file = response,
            video = new
            {
                saved.Video.Id,
                saved.Video.UserId,
                saved.Video.Title,
                saved.Video.Description,
                saved.Video.Privacy,
                saved.Video.Status,
                saved.Video.PublishedAt
            }
        });
    }

    private bool TryResolveUserId(out Guid userId)
    {
        var userIdRaw = User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? User.FindFirstValue("sub")
            ?? User.FindFirstValue("id");

        return Guid.TryParse(userIdRaw, out userId) && userId != Guid.Empty;
    }
}
