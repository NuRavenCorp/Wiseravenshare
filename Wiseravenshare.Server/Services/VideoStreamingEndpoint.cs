using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.StaticFiles;

namespace Wiseravenshare.Server.Services;

[ApiController]
[Route("api/[controller]")]
public class VideoStreamingController : ControllerBase
{
    private readonly IWebHostEnvironment _environment;
    private readonly FileExtensionContentTypeProvider _contentTypeProvider = new();

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

        var safeFileName = Path.GetFileName(fileName);
        if (string.IsNullOrWhiteSpace(safeFileName))
        {
            return BadRequest("Invalid fileName.");
        }

        var candidatePaths = new[]
        {
            Path.Combine(_environment.ContentRootPath, "MediaStorage", safeFileName),
            Path.Combine(AppContext.BaseDirectory, "MediaStorage", safeFileName),
            Path.Combine(Path.GetTempPath(), "Wiseravenshare", "MediaStorage", safeFileName)
        };

        var filePath = candidatePaths.FirstOrDefault(System.IO.File.Exists);

        if (string.IsNullOrWhiteSpace(filePath))
        {
            return NotFound();
        }

        var stream = System.IO.File.OpenRead(filePath);
        if (!_contentTypeProvider.TryGetContentType(filePath, out var contentType))
        {
            contentType = "application/octet-stream";
        }

        return File(stream, contentType, enableRangeProcessing: true);
    }
}
