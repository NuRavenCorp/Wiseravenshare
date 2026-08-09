using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.DTOs;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Authorize]
[Route("api/ravensight/media/photos")]
public sealed class RavensightPhotoMediaController : ControllerBase
{
    private readonly IRavensightPhotoService _photoService;

    public RavensightPhotoMediaController(IRavensightPhotoService photoService)
    {
        _photoService = photoService;
    }

    [HttpPost("save")]
    [RequestSizeLimit(100_000_000)]
    [ProducesResponseType(typeof(RavensightSavedMediaDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> SavePhoto([FromForm] SaveRavensightPhotoDto dto, CancellationToken cancellationToken)
    {
        if (dto.File is null || dto.File.Length == 0)
        {
            return BadRequest(new { message = "No photo file uploaded." });
        }

        var saved = await _photoService.SavePhotoAsync(dto.File, dto.DestinationFolder, cancellationToken);

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
            caption = dto.Caption
        });
    }
}
