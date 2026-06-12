using Microsoft.AspNetCore.Mvc;

namespace Wiseravenshare.Server.Services;

[ApiController]
[Route("api/[controller]")]
public class VideoStreamingController : ControllerBase
{
    private readonly IWebHostEnvironment _environment;

    public VideoStreamingController(IWebHostEnvironment environment)
    {
        _environment = environment;
    }

    [HttpGet("stream")]
    public IActionResult StreamVideo([FromQuery] string fileName)
    {
        if (string.IsNullOrWhiteSpace(fileName))
        {
            return BadRequest("fileName is required.");
        }

        var filePath = Path.Combine(_environment.ContentRootPath, "MediaStorage", fileName);

        if (!System.IO.File.Exists(filePath))
        {
            return NotFound();
        }

        var stream = System.IO.File.OpenRead(filePath);
        return File(stream, "video/mp4", enableRangeProcessing: true);
    }
}
