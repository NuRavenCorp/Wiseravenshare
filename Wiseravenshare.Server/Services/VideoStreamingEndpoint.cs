using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.StaticFiles;

namespace Wiseravenshare.Server.Services;

[ApiController]
[Route("api/[controller]")]
public class VideoStreamingController : ControllerBase
{
    private readonly IWebHostEnvironment _environment;
    private readonly IConfiguration _configuration;
    private readonly IBlobStorageService _blobStorageService;
    private readonly FileExtensionContentTypeProvider _contentTypeProvider = new();

    public VideoStreamingController(IWebHostEnvironment environment, IConfiguration configuration, IBlobStorageService blobStorageService)
    {
        _environment = environment;
        _configuration = configuration;
        _blobStorageService = blobStorageService;
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

        var storageFolderName = _configuration["Storage:Video:StorageFolderName"]?.Trim();
        if (string.IsNullOrWhiteSpace(storageFolderName))
        {
            storageFolderName = "ravensight_videos";
        }

        var defaultDestination = NormalizeDestinationFolder(
            _configuration["Storage:Video:DefaultFolder"],
            "wiseravenshare/ravensight/video");
        var destinationParts = defaultDestination.Split('/', StringSplitOptions.RemoveEmptyEntries);

        var candidatePaths = new[]
        {
            Path.Combine(new[] { _environment.ContentRootPath, storageFolderName }.Concat(destinationParts).Append(safeFileName).ToArray()),
            Path.Combine(new[] { AppContext.BaseDirectory, storageFolderName }.Concat(destinationParts).Append(safeFileName).ToArray()),
            Path.Combine(new[] { Path.GetTempPath(), "Wiseravenshare", storageFolderName }.Concat(destinationParts).Append(safeFileName).ToArray()),

            Path.Combine(_environment.ContentRootPath, "MediaStorage", safeFileName),
            Path.Combine(AppContext.BaseDirectory, "MediaStorage", safeFileName),
            Path.Combine(Path.GetTempPath(), "Wiseravenshare", "MediaStorage", safeFileName)
        };

        var filePath = candidatePaths.FirstOrDefault(System.IO.File.Exists);

        if (string.IsNullOrWhiteSpace(filePath))
        {
            var searchRoots = new[]
            {
                Path.Combine(_environment.ContentRootPath, storageFolderName),
                Path.Combine(AppContext.BaseDirectory, storageFolderName),
                Path.Combine(Path.GetTempPath(), "Wiseravenshare", storageFolderName)
            };

            foreach (var root in searchRoots)
            {
                if (!Directory.Exists(root))
                {
                    continue;
                }

                try
                {
                    var match = Directory.EnumerateFiles(root, safeFileName, SearchOption.AllDirectories).FirstOrDefault();
                    if (!string.IsNullOrWhiteSpace(match))
                    {
                        filePath = match;
                        break;
                    }
                }
                catch
                {
                    // Continue through remaining search roots.
                }
            }
        }

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

    [HttpGet("blob/{*fileName}")]
    public async Task<IActionResult> StreamBlob([FromRoute] string fileName, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(fileName))
        {
            return BadRequest();
        }

        var objectKeyCandidates = BuildObjectKeyCandidates(fileName);
        foreach (var objectKey in objectKeyCandidates)
        {
            var blobStream = await _blobStorageService.OpenReadAsync(objectKey, cancellationToken);
            if (blobStream is not null)
            {
                var contentType = "application/octet-stream";
                if (!_contentTypeProvider.TryGetContentType(fileName, out var resolvedContentType))
                {
                    resolvedContentType = "application/octet-stream";
                }

                return File(blobStream, resolvedContentType, enableRangeProcessing: true);
            }
        }

        return NotFound();
    }

    private IEnumerable<string> BuildObjectKeyCandidates(string fileName)
    {
        var normalizedFileName = Path.GetFileName(fileName);
        var projectFolder = StoragePathResolver.ResolveProjectFolder(_configuration, _environment.ContentRootPath, "wiseravenshare");
        var defaultDestination = NormalizeDestinationFolder(
            _configuration["Storage:Video:DefaultFolder"],
            "wiseravenshare/ravensight/video");

        var candidates = new List<string>
        {
            $"{projectFolder}/{defaultDestination}/{normalizedFileName}".Replace("//", "/"),
            $"{projectFolder}/{normalizedFileName}".Replace("//", "/"),
            $"{defaultDestination}/{normalizedFileName}".Replace("//", "/"),
            normalizedFileName
        };

        return candidates.Where(item => !string.IsNullOrWhiteSpace(item));
    }

    private static string NormalizeDestinationFolder(string? requested, string defaultFolder)
    {
        var value = string.IsNullOrWhiteSpace(requested) ? defaultFolder : requested.Trim();
        value = value.Replace('\\', '/').Trim('/');

        if (string.IsNullOrWhiteSpace(value))
        {
            value = defaultFolder;
        }

        var safeSegments = value
            .Split('/', StringSplitOptions.RemoveEmptyEntries)
            .Select(segment => new string(segment.Where(ch => char.IsLetterOrDigit(ch) || ch is '-' or '_' or '.').ToArray()))
            .Where(segment => !string.IsNullOrWhiteSpace(segment))
            .ToArray();

        if (safeSegments.Length == 0)
        {
            return defaultFolder;
        }

        return string.Join('/', safeSegments);
    }
}
