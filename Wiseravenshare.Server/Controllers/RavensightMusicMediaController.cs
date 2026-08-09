using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.DTOs;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Authorize]
[Route("api/ravensight/media/music")]
public sealed class RavensightMusicMediaController : ControllerBase
{
    private readonly IRavensightMusicService _musicService;

    public RavensightMusicMediaController(IRavensightMusicService musicService)
    {
        _musicService = musicService;
    }

    [HttpPost("save")]
    [RequestSizeLimit(200_000_000)]
    [ProducesResponseType(typeof(RavensightSavedMediaDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> SaveMusic([FromForm] SaveRavensightMusicDto dto, CancellationToken cancellationToken)
    {
        if (dto.File is null || dto.File.Length == 0)
        {
            return BadRequest(new { message = "No music file uploaded." });
        }

        var saved = await _musicService.SaveMusicAsync(dto.File, dto.DestinationFolder, cancellationToken);

        var response = new RavensightSavedMediaDto
        {
            FileName = saved.FileName,
            RelativePath = saved.RelativePath,
            DestinationFolder = saved.DestinationFolder,
            ContentType = saved.ContentType,
            SizeBytes = saved.SizeBytes,
            SavedAtUtc = saved.SavedAtUtc,
            MediaUrl = $"{Request.Scheme}://{Request.Host}/api/videostreaming/stream?fileName={Uri.EscapeDataString(saved.FileName)}"
        };

        return Ok(new
        {
            file = response,
            meta = new
            {
                title = dto.Title,
                artist = dto.Artist,
                album = dto.Album,
                genre = dto.Genre
            }
        });
    }
}
