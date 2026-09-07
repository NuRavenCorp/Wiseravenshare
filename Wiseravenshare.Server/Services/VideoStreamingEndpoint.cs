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

        var storageFolderNames = ResolveStorageFolderNames();
        var defaultDestinations = ResolveDefaultDestinations();
        var candidatePaths = new List<string>();

        foreach (var storageFolderName in storageFolderNames)
        {
            foreach (var destination in defaultDestinations)
            {
                var destinationParts = destination.Split('/', StringSplitOptions.RemoveEmptyEntries);
                candidatePaths.Add(Path.Combine(new[] { _environment.ContentRootPath, storageFolderName }.Concat(destinationParts).Append(safeFileName).ToArray()));
                candidatePaths.Add(Path.Combine(new[] { AppContext.BaseDirectory, storageFolderName }.Concat(destinationParts).Append(safeFileName).ToArray()));
                candidatePaths.Add(Path.Combine(new[] { Path.GetTempPath(), "Wiseravenshare", storageFolderName }.Concat(destinationParts).Append(safeFileName).ToArray()));
            }
        }

        candidatePaths.Add(Path.Combine(_environment.ContentRootPath, "MediaStorage", safeFileName));
        candidatePaths.Add(Path.Combine(AppContext.BaseDirectory, "MediaStorage", safeFileName));
        candidatePaths.Add(Path.Combine(Path.GetTempPath(), "Wiseravenshare", "MediaStorage", safeFileName));

        var filePath = candidatePaths.FirstOrDefault(System.IO.File.Exists);

        if (string.IsNullOrWhiteSpace(filePath))
        {
            var searchRoots = new List<string>();
            foreach (var storageFolderName in storageFolderNames)
            {
                searchRoots.Add(Path.Combine(_environment.ContentRootPath, storageFolderName));
                searchRoots.Add(Path.Combine(AppContext.BaseDirectory, storageFolderName));
                searchRoots.Add(Path.Combine(Path.GetTempPath(), "Wiseravenshare", storageFolderName));
            }

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
        var normalizedFileName = Path.GetFileName(fileName.Replace('\\', '/'));
        var rawPath = fileName.Replace('\\', '/').Trim('/');
        var projectFolder = StoragePathResolver.ResolveProjectFolder(_configuration, _environment.ContentRootPath, "wiseravenshare");
        var candidates = new List<string>();

        if (!string.IsNullOrWhiteSpace(rawPath))
        {
            candidates.Add(rawPath);
            candidates.Add(rawPath.TrimStart('/'));
            candidates.Add(rawPath.Replace("//", "/"));
        }

        if (!string.IsNullOrWhiteSpace(normalizedFileName))
        {
            candidates.Add(normalizedFileName);
        }

        foreach (var defaultDestination in ResolveDefaultDestinations())
        {
            candidates.Add($"{projectFolder}/{defaultDestination}/{normalizedFileName}".Replace("//", "/"));
            candidates.Add($"{defaultDestination}/{normalizedFileName}".Replace("//", "/"));
            if (!string.IsNullOrWhiteSpace(rawPath))
            {
                candidates.Add($"{projectFolder}/{rawPath}".Replace("//", "/"));
                candidates.Add($"{rawPath}".Replace("//", "/"));
            }
        }

        candidates.Add($"{projectFolder}/{normalizedFileName}".Replace("//", "/"));
        candidates.Add(normalizedFileName);

        return candidates.Where(item => !string.IsNullOrWhiteSpace(item));
    }

    private string[] ResolveStorageFolderNames()
    {
        var configured = new[]
        {
            _configuration["Storage:Video:StorageFolderName"],
            _configuration["Storage:Photo:StorageFolderName"],
            _configuration["Storage:Music:StorageFolderName"]
        };

        return configured
            .Select(value => string.IsNullOrWhiteSpace(value) ? null : value.Trim())
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Concat(new[] { "ravensight_videos", "ravensight_photos", "ravensight_music" })
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray()!;
    }

    private string[] ResolveDefaultDestinations()
    {
        var projectFolder = StoragePathResolver.ResolveProjectFolder(_configuration, _environment.ContentRootPath, "wiseravenshare");
        var configuredVideo = NormalizeDestinationFolder(
            _configuration["Storage:Video:DefaultFolder"],
            $"{projectFolder}/ravensight/video");

        var defaults = new[]
        {
            configuredVideo,
            $"{projectFolder}/ravensight/photo",
            $"{projectFolder}/ravensight/music"
        };

        return defaults
            .Select(value => NormalizeDestinationFolder(value, $"{projectFolder}/ravensight/video"))
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
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
