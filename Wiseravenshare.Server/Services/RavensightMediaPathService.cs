using Wiseravenshare.Server.Models;

namespace Wiseravenshare.Server.Services;

public interface IRavensightMediaPathService
{
    Task<RavensightSavedMediaFile> SaveFileAsync(
        IFormFile file,
        RavensightMediaType mediaType,
        string? requestedDestinationFolder,
        CancellationToken cancellationToken = default);
}

public sealed class RavensightMediaPathService : IRavensightMediaPathService
{
    private static readonly Dictionary<RavensightMediaType, HashSet<string>> AllowedExtensions = new()
    {
        [RavensightMediaType.Video] = new(StringComparer.OrdinalIgnoreCase) { ".mp4", ".mov", ".webm" },
        [RavensightMediaType.Photo] = new(StringComparer.OrdinalIgnoreCase) { ".jpg", ".jpeg", ".png", ".webp" },
        [RavensightMediaType.Music] = new(StringComparer.OrdinalIgnoreCase) { ".mp3", ".wav", ".m4a", ".aac" }
    };

    private readonly IWebHostEnvironment _environment;
    private readonly ILogger<RavensightMediaPathService> _logger;
    private readonly IConfiguration _configuration;

    public RavensightMediaPathService(
        IWebHostEnvironment environment,
        IConfiguration configuration,
        ILogger<RavensightMediaPathService> logger)
    {
        _environment = environment;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task<RavensightSavedMediaFile> SaveFileAsync(
        IFormFile file,
        RavensightMediaType mediaType,
        string? requestedDestinationFolder,
        CancellationToken cancellationToken = default)
    {
        if (file is null || file.Length == 0)
        {
            throw new InvalidOperationException("No file provided.");
        }

        var extension = Path.GetExtension(file.FileName);
        if (string.IsNullOrWhiteSpace(extension) || !AllowedExtensions[mediaType].Contains(extension))
        {
            throw new InvalidOperationException($"Invalid {mediaType.ToString().ToLowerInvariant()} file type: {extension}");
        }

        var rootFolder = ResolveRootFolder(mediaType);
        var defaultDestination = ResolveDefaultDestination(mediaType);
        var destinationFolder = NormalizeDestinationFolder(requestedDestinationFolder, defaultDestination);
        var destinationParts = destinationFolder.Split('/', StringSplitOptions.RemoveEmptyEntries);

        var fileName = $"{Guid.NewGuid():N}{extension.ToLowerInvariant()}";
        var candidateFolders = new List<string>
        {
            Path.Combine(new[] { _environment.ContentRootPath, rootFolder }.Concat(destinationParts).ToArray()),
            Path.Combine(new[] { AppContext.BaseDirectory, rootFolder }.Concat(destinationParts).ToArray()),
            Path.Combine(new[] { Path.GetTempPath(), "Wiseravenshare", rootFolder }.Concat(destinationParts).ToArray())
        };

        Exception? lastFailure = null;
        foreach (var folder in candidateFolders)
        {
            try
            {
                Directory.CreateDirectory(folder);
                var fullPath = Path.Combine(folder, fileName);

                await using var stream = new FileStream(fullPath, FileMode.Create, FileAccess.Write, FileShare.None);
                await file.CopyToAsync(stream, cancellationToken);

                return new RavensightSavedMediaFile
                {
                    FileName = fileName,
                    RelativePath = $"{rootFolder}/{destinationFolder}/{fileName}".Replace('\\', '/'),
                    AbsolutePath = fullPath,
                    DestinationFolder = destinationFolder,
                    ContentType = string.IsNullOrWhiteSpace(file.ContentType) ? "application/octet-stream" : file.ContentType,
                    SizeBytes = file.Length,
                    SavedAtUtc = DateTime.UtcNow
                };
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                lastFailure = ex;
                _logger.LogWarning(ex, "Failed writing {MediaType} to {Folder}", mediaType, folder);
            }
        }

        throw new InvalidOperationException("Unable to save media to any configured storage path.", lastFailure);
    }

    private string ResolveRootFolder(RavensightMediaType mediaType)
    {
        return mediaType switch
        {
            RavensightMediaType.Video => _configuration["Storage:Video:StorageFolderName"]?.Trim() ?? "ravensight_videos",
            RavensightMediaType.Photo => _configuration["Storage:Photo:StorageFolderName"]?.Trim() ?? "ravensight_photos",
            RavensightMediaType.Music => _configuration["Storage:Music:StorageFolderName"]?.Trim() ?? "ravensight_music",
            _ => "ravensight_media"
        };
    }

    private string ResolveDefaultDestination(RavensightMediaType mediaType)
    {
        return mediaType switch
        {
            RavensightMediaType.Video => "wiseravenshare/ravensight/video",
            RavensightMediaType.Photo => "wiseravenshare/ravensight/photo",
            RavensightMediaType.Music => "wiseravenshare/ravensight/music",
            _ => "wiseravenshare/ravensight/media"
        };
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

        return safeSegments.Length == 0 ? defaultFolder : string.Join('/', safeSegments);
    }
}
