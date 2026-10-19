using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using System.Security.Claims;
using Npgsql;
using Wiseravenshare.Server.DTOs.Social;
using Wiseravenshare.Server.Models;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class MediaController : ControllerBase
{
    private static readonly IReadOnlyDictionary<string, string[]> AllowedUploadContentTypesByExtension =
        new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase)
        {
            [".mp4"]  = ["video/mp4", "video/mpeg", "video/x-m4v"],
            [".m4v"]  = ["video/mp4", "video/x-m4v"],
            [".mov"]  = ["video/quicktime", "video/mov"],
            [".webm"] = ["video/webm"],
            [".avi"]  = ["video/x-msvideo", "video/avi", "video/x-avi"],
            [".mkv"]  = ["video/x-matroska", "video/mkv"],
            [".mpg"]  = ["video/mpeg"],
            [".mpeg"] = ["video/mpeg"],
            [".3gp"]  = ["video/3gpp", "video/3gp"],
            [".3g2"]  = ["video/3gpp2"],
            [".ts"]   = ["video/mp2t", "video/ts"],
            [".m2ts"] = ["video/mp2t"],
            [".flv"]  = ["video/x-flv"],
            [".jpg"]  = ["image/jpeg"],
            [".jpeg"] = ["image/jpeg"],
            [".png"]  = ["image/png"],
            [".webp"] = ["image/webp"],
            [".gif"]  = ["image/gif"],
            [".heic"] = ["image/heic", "image/heif"],
            [".heif"] = ["image/heif", "image/heic"],
            [".mp3"]  = ["audio/mpeg", "audio/mp3", "audio/x-mpeg"],
            [".wav"]  = ["audio/wav", "audio/wave", "audio/x-wav"],
            [".m4a"]  = ["audio/mp4", "audio/x-m4a", "audio/m4a", "audio/aac"],
            [".aac"]  = ["audio/aac", "audio/x-aac", "audio/mp4"],
            [".ogg"]  = ["audio/ogg", "audio/vorbis", "application/ogg"],
            [".oga"]  = ["audio/ogg", "audio/vorbis"],
            [".flac"] = ["audio/flac", "audio/x-flac"],
            [".wma"]  = ["audio/x-ms-wma", "audio/wma"],
            [".aiff"] = ["audio/aiff", "audio/x-aiff"],
            [".aif"]  = ["audio/aiff", "audio/x-aiff"],
            [".opus"] = ["audio/opus", "audio/ogg"],
            [".caf"]  = ["audio/x-caf"],
        };

    private readonly IWebHostEnvironment _environment;
    private readonly IYouTubeService _youTubeService;
    private readonly ISocialPlatformService _socialPlatformService;
    private readonly VideoLibraryStore _videoLibraryStore;
    private readonly RavensightMediaCatalogStore _mediaCatalogStore;
    private readonly IBlobStorageService _blobStorage;
    private readonly ILogger<MediaController> _logger;
    private readonly OutputCacheInvalidationService _cacheInvalidation;
    private readonly IMusicLibraryStore? _musicLibraryStore;
    private readonly string _videoStorageFolderName;
    private readonly string _defaultVideoDestination;
    private readonly string _projectFolder;

    public MediaController(
        IWebHostEnvironment environment,
        IConfiguration configuration,
        IYouTubeService youTubeService,
        VideoLibraryStore videoLibraryStore,
        RavensightMediaCatalogStore mediaCatalogStore,
        IBlobStorageService blobStorage,
        ILogger<MediaController> logger,
        OutputCacheInvalidationService cacheInvalidation,
        ISocialPlatformService socialPlatformService,
        IMusicLibraryStore? musicLibraryStore = null)
    {
        _environment = environment;
        _youTubeService = youTubeService;
        _socialPlatformService = socialPlatformService;
        _videoLibraryStore = videoLibraryStore;
        _mediaCatalogStore = mediaCatalogStore;
        _blobStorage = blobStorage;
        _logger = logger;
        _cacheInvalidation = cacheInvalidation;
        _musicLibraryStore = musicLibraryStore;
        _videoStorageFolderName = configuration["Storage:Video:StorageFolderName"]?.Trim();
        if (string.IsNullOrWhiteSpace(_videoStorageFolderName))
        {
            _videoStorageFolderName = "ravensight_videos";
        }

        _defaultVideoDestination = StoragePathResolver.ResolveDefaultVideoDestination(
            configuration,
            environment.ContentRootPath,
            "wiseravenshare");

        _projectFolder = StoragePathResolver.ResolveProjectFolder(
            configuration,
            environment.ContentRootPath,
            "wiseravenshare");
    }

    [HttpPost("upload")]
    [RequestSizeLimit(500_000_000)]
    [RequestFormLimits(MultipartBodyLengthLimit = 500_000_000)]
    public async Task<IActionResult> UploadMedia([FromForm] MediaUploadDto upload, CancellationToken cancellationToken)
    {
        // Resilient file resolution: accept "file" or "File" field name from any client.
        var file = upload.File;
        if (file is null || file.Length == 0)
        {
            file = Request.Form.Files.FirstOrDefault(f =>
                string.Equals(f.Name, "file", StringComparison.OrdinalIgnoreCase)
                || string.Equals(f.Name, "File", StringComparison.OrdinalIgnoreCase));
        }

        if (file is null || file.Length == 0)
        {
            return BadRequest(new { message = "No file uploaded. Send the file in a multipart/form-data field named 'file'." });
        }

        upload.File = file;

        if (!TryValidateUpload(file, out var extension, out var uploadError))
        {
            return BadRequest(new { message = uploadError });
        }

        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)
                     ?? User.FindFirstValue("sub")
                     ?? User.FindFirstValue("id");
        if (string.IsNullOrWhiteSpace(userId))
        {
            return Unauthorized(new { message = "Unable to determine current user." });
        }

        var userStorageIdentity = ResolveUserStorageIdentity(userId);
        var managedDestinationFolder = ResolveManagedDestinationFolder(extension, userStorageIdentity);

        if (!string.IsNullOrWhiteSpace(upload.DestinationFolder)
            && !string.Equals(
                StoragePathResolver.EnsureUserScopedDestination(upload.DestinationFolder, userStorageIdentity, _projectFolder),
                managedDestinationFolder,
                StringComparison.OrdinalIgnoreCase))
        {
            _logger.LogInformation(
                "Ignoring client-supplied destination folder {RequestedDestination} for user {UserId}; enforcing managed destination {ManagedDestination}.",
                upload.DestinationFolder,
                userId,
                managedDestinationFolder);
        }

        string uniqueFileName;
        string persistedMediaUrl;
        string persistedRelativePath;
        try
        {
            (uniqueFileName, persistedMediaUrl, persistedRelativePath) = await SaveMediaFileAsync(file, extension, managedDestinationFolder, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to persist uploaded media file.");
            return StatusCode(StatusCodes.Status500InternalServerError, new { message = "Unable to save uploaded file to storage." });
        }

        var isVideo = extension is
            ".mp4" or ".mov" or ".webm" or ".avi" or ".mkv" or ".m4v"
            or ".mpg" or ".mpeg" or ".3gp" or ".3g2" or ".ts" or ".m2ts" or ".flv";
        var isAudio = extension is
            ".mp3" or ".wav" or ".m4a" or ".aac" or ".ogg" or ".oga"
            or ".flac" or ".wma" or ".aiff" or ".aif" or ".opus" or ".caf";
        var isPhoto = extension is ".jpg" or ".jpeg" or ".png" or ".webp" or ".gif" or ".heic" or ".heif";
        if (upload.PublishToYouTube && string.IsNullOrWhiteSpace(upload.YouTubeChannelOrEmail))
        {
            return BadRequest("YouTube details are required when publishing to YouTube.");
        }

        if (upload.PublishToYouTube && !upload.YouTubePermissionGranted)
        {
            return BadRequest("YouTube permission consent is required.");
        }

        if (upload.PublishToTikTok && string.IsNullOrWhiteSpace(upload.TikTokUsername))
        {
            return BadRequest("TikTok details are required when publishing to TikTok.");
        }

        if (upload.PublishToTikTok && !upload.TikTokPermissionGranted)
        {
            return BadRequest("TikTok permission consent is required.");
        }

        if (upload.PublishToFacebook && string.IsNullOrWhiteSpace(upload.FacebookPageOrProfile))
        {
            return BadRequest("Facebook details are required when publishing to Facebook.");
        }

        if (upload.PublishToFacebook && !upload.FacebookPermissionGranted)
        {
            return BadRequest("Facebook permission consent is required.");
        }

        string? youtubeUrl = null;
        string? tiktokUrl = null;
        string? facebookUrl = null;
        PublishSocialContentResponse? socialShare = null;

        var mediaType = isPhoto
            ? SocialMediaType.Photo
            : isAudio
                ? SocialMediaType.Music
                : SocialMediaType.Video;
        var wantsSocialCrossPost = upload.PublishToYouTube || upload.PublishToTikTok || upload.PublishToFacebook;

        if (wantsSocialCrossPost)
        {
            var mediaUrlForShare = persistedMediaUrl;
            var shareUserId = Guid.TryParse(userId, out var parsedShareUserId)
                ? parsedShareUserId
                : Guid.Empty;

            // Route uploads through the real social share pipeline (photos go to Facebook, videos to FB/TikTok/YouTube).
            socialShare = await _socialPlatformService.PublishMediaUploadAsync(
                shareUserId,
                string.IsNullOrWhiteSpace(upload.Title) ? "New upload from Wiseravenshare" : upload.Title.Trim(),
                mediaUrlForShare,
                mediaType,
                upload.PublishToFacebook,
                upload.PublishToTikTok && !isPhoto,
                upload.PublishToYouTube && !isPhoto);

            foreach (var result in socialShare.Results)
            {
                if (!result.Success)
                {
                    _logger.LogWarning(
                        "Social cross-post failed for upload {FileName} on {Platform}: {Error}",
                        uniqueFileName,
                        result.Platform,
                        result.Error);
                    continue;
                }

                if (string.Equals(result.Platform, "facebook", StringComparison.OrdinalIgnoreCase))
                {
                    facebookUrl = result.ExternalPostUrl;
                }
                else if (string.Equals(result.Platform, "tiktok", StringComparison.OrdinalIgnoreCase))
                {
                    tiktokUrl = result.ExternalPostUrl;
                }
                else if (string.Equals(result.Platform, "youtube", StringComparison.OrdinalIgnoreCase))
                {
                    youtubeUrl = result.ExternalPostUrl;
                }
            }
        }

        VideoLibraryVideo? video = null;
        // ── Persist to all relevant stores (best-effort, never blocks the upload response) ──
        if (Guid.TryParse(userId, out var catalogUserGuid) && catalogUserGuid != Guid.Empty)
        {
            var displayName = User.FindFirstValue(ClaimTypes.Name);
            var email = User.FindFirstValue(ClaimTypes.Email) ?? User.FindFirstValue("email");
            var userIdentity = StoragePathResolver.ResolveUserStorageIdentity(displayName, email, userId);
            var mediaFolder = isPhoto
                ? $"users/{userIdentity}/media/photos"
                : isAudio
                    ? $"users/{userIdentity}/media/music"
                    : $"users/{userIdentity}/media/videos";
            var title = string.IsNullOrWhiteSpace(upload.Title)
                ? Path.GetFileNameWithoutExtension(file.FileName)
                : upload.Title.Trim();

            // 1. Unified catalog entry for all types (powers Ravensight Media tab + library views).
            try
            {
                await _mediaCatalogStore.CreateAssetAsync(new CreateRavensightMediaAssetRequest
                {
                    UserId = catalogUserGuid,
                    MediaType = isPhoto ? RavensightMediaType.Photo : isAudio ? RavensightMediaType.Music : RavensightMediaType.Video,
                    FileName = uniqueFileName,
                    RelativePath = persistedRelativePath,
                    PublicUrl = persistedMediaUrl.StartsWith("http", StringComparison.OrdinalIgnoreCase) ? persistedMediaUrl : null,
                    AbsolutePath = string.Empty,
                    DestinationFolder = mediaFolder,
                    ContentType = file.ContentType ?? "application/octet-stream",
                    SizeBytes = file.Length,
                    SavedAtUtc = DateTime.UtcNow,
                    MetadataJson = System.Text.Json.JsonSerializer.Serialize(new
                    {
                        title,
                        originalFileName = file.FileName,
                        mediaType = isPhoto ? "photo" : isAudio ? "music" : "video",
                        storageMode = "permanent",
                        mediaUrl = persistedMediaUrl
                    })
                }, cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Catalog write failed for {MediaType} upload by user {UserId}; upload still succeeded.", isPhoto ? "photo" : isAudio ? "audio" : "video", catalogUserGuid);
            }

            // 2. Video library entry (powers /ravensight/media/videos listing).
            if (isVideo)
            {
                try
                {
                    video = await _videoLibraryStore.CreateVideoAsync(new CreateVideoLibraryEntryRequest
                    {
                        UserId = userId,
                        Title = title,
                        Description = upload.Description ?? string.Empty,
                        VideoUrl = persistedMediaUrl,
                        PrivacyStatus = "unlisted",
                        Status = "published",
                        StorageMode = "permanent",
                        IsPermanent = true,
                        YouTubeUrl = youtubeUrl,
                        TikTokUrl = tiktokUrl,
                        FacebookUrl = facebookUrl
                    }, cancellationToken);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Video library write failed for user {UserId}; upload still succeeded.", userId);
                }
            }

            // 3. Music bucket store entry (powers FM radio + music player listings).
            if (isAudio && _musicLibraryStore is not null)
            {
                try
                {
                    await _musicLibraryStore.SaveMusicAsync(
                        catalogUserGuid,
                        file,
                        new DTOs.SaveRavensightMusicDto
                        {
                            Title = title,
                            DestinationFolder = mediaFolder
                        },
                        userIdentity,
                        cancellationToken);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Music bucket write failed for user {UserId}; upload still succeeded.", catalogUserGuid);
                }
            }
        }

        await _cacheInvalidation.InvalidateFeedAsync(cancellationToken);

        return Ok(new
        {
            fileName = uniqueFileName,
            filePath = persistedMediaUrl,
            mediaUrl = persistedMediaUrl,
            youtubeUrl,
            tiktokUrl,
            facebookUrl,
            socialShare = socialShare?.Results,
            video
        });
    }

    /// <summary>
    /// Persists uploaded media. When DigitalOcean Spaces (or S3-compatible) blob storage is
    /// configured the file is streamed directly to the bucket and the persistent public URL is
    /// returned. This survives container restarts and redeployments.
    /// Local disk is used only as a development fallback.
    /// Returns (uniqueFileName, persistentMediaUrl, storageRelativePath).
    /// </summary>
    private async Task<(string FileName, string MediaUrl, string RelativePath)> SaveMediaFileAsync(
        IFormFile file,
        string extension,
        string? requestedDestinationFolder,
        CancellationToken cancellationToken)
    {
        var uniqueFileName = $"{Guid.NewGuid():N}{extension}";
        var normalizedDestination = NormalizeDestinationFolder(requestedDestinationFolder, _defaultVideoDestination);

        // ── Blob storage (persistent) ──────────────────────────────────────────
        if (_blobStorage.IsConfigured)
        {
            var objectKey = $"{_projectFolder}/{normalizedDestination}/{uniqueFileName}".Replace('\\', '/').Trim('/');
            try
            {
                await using var blobStream = file.OpenReadStream();
                var result = await _blobStorage.UploadAsync(
                    objectKey,
                    blobStream,
                    string.IsNullOrWhiteSpace(file.ContentType) ? "application/octet-stream" : file.ContentType,
                    cancellationToken);

                _logger.LogInformation(
                    "Uploaded media to blob storage: key={ObjectKey} url={PublicUrl}",
                    result.ObjectKey, result.PublicUrl);

                // Prefer the blob proxy URL so credentials and ACL are handled server-side
                var blobStreamUrl = StreamingUrlHelper.StreamByBlobPath(result.ObjectKey);
                var mediaUrl = string.IsNullOrWhiteSpace(blobStreamUrl)
                    ? result.PublicUrl
                    : blobStreamUrl;

                return (uniqueFileName, mediaUrl, result.ObjectKey);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Blob storage upload failed for {FileName}; falling back to local disk.", uniqueFileName);
            }
        }

        // ── Local disk fallback (dev / unconfigured) ───────────────────────────
        var destinationParts = normalizedDestination.Split('/', StringSplitOptions.RemoveEmptyEntries);
        var candidateFolders = new List<string>
        {
            Path.Combine(new[] { _environment.ContentRootPath, _videoStorageFolderName }.Concat(destinationParts).ToArray()),
            Path.Combine(new[] { AppContext.BaseDirectory, _videoStorageFolderName }.Concat(destinationParts).ToArray()),
            Path.Combine(new[] { Path.GetTempPath(), "Wiseravenshare", _videoStorageFolderName }.Concat(destinationParts).ToArray()),
            Path.Combine(_environment.ContentRootPath, "MediaStorage"),
            Path.Combine(AppContext.BaseDirectory, "MediaStorage"),
            Path.Combine(Path.GetTempPath(), "Wiseravenshare", "MediaStorage")
        };

        Exception? lastFailure = null;
        foreach (var folder in candidateFolders)
        {
            try
            {
                Directory.CreateDirectory(folder);
                var filePath = Path.Combine(folder, uniqueFileName);
                await using var diskStream = new FileStream(filePath, FileMode.Create, FileAccess.Write, FileShare.None);
                await file.CopyToAsync(diskStream, cancellationToken);
                var localUrl = StreamingUrlHelper.StreamByFileName(uniqueFileName);
                var localRelativePath = $"{normalizedDestination}/{uniqueFileName}".Replace('\\', '/').Trim('/');
                return (uniqueFileName, localUrl, localRelativePath);
            }
            catch (Exception ex) when (ex is IOException || ex is UnauthorizedAccessException)
            {
                lastFailure = ex;
                _logger.LogWarning(ex, "Media upload write attempt failed for folder {Folder}", folder);
            }
        }

        throw new InvalidOperationException("Unable to write uploaded media to any configured storage path.", lastFailure);
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

    private static bool TryValidateUpload(IFormFile file, out string extension, out string error)
    {
        extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (!AllowedUploadContentTypesByExtension.TryGetValue(extension, out var allowedContentTypes))
        {
            error = $"Unsupported file type '{extension}'.";
            return false;
        }

        // Strip content-type parameters (e.g. "video/mp4; codecs=avc1.42E01E" → "video/mp4").
        var rawContentType = (file.ContentType ?? string.Empty).Trim();
        var baseContentType = rawContentType.Contains(';')
            ? rawContentType[..rawContentType.IndexOf(';')].Trim()
            : rawContentType;

        // Accept if the base type is in the explicit list, OR if it is a general
        // video/audio/image type that matches the file's media category.
        if (!string.IsNullOrWhiteSpace(baseContentType))
        {
            if (allowedContentTypes.Contains(baseContentType, StringComparer.OrdinalIgnoreCase))
            {
                error = string.Empty;
                return true;
            }

            var category = allowedContentTypes[0].Split('/')[0].ToLowerInvariant();
            var incomingCategory = baseContentType.Split('/')[0].ToLowerInvariant();
            if (incomingCategory == category || incomingCategory == "application")
            {
                error = string.Empty;
                return true;
            }
        }
        else
        {
            // No content type sent by the browser — accept based on extension only.
            error = string.Empty;
            return true;
        }

        error = $"Unsupported content type '{baseContentType}' for '{extension}'.";
        return false;
    }

    private static string ResolveManagedDestinationFolder(string extension, string userStorageIdentity)
    {
        var mediaSegment = extension switch
        {
            ".mp4" or ".mov" or ".webm" or ".avi" or ".mkv" or ".m4v"
                or ".mpg" or ".mpeg" or ".3gp" or ".3g2" or ".ts" or ".m2ts" or ".flv" => "videos",
            ".jpg" or ".jpeg" or ".png" or ".webp" or ".gif" or ".heic" or ".heif" => "photos",
            ".mp3" or ".wav" or ".m4a" or ".aac" or ".ogg" or ".oga"
                or ".flac" or ".wma" or ".aiff" or ".aif" or ".opus" or ".caf" => "audio",
            _ => "media"
        };

        return $"users/{userStorageIdentity}/media/{mediaSegment}";
    }

    private string ResolveUserStorageIdentity(string userId)
    {
        var displayName = User.FindFirstValue(ClaimTypes.Name);
        var email = User.FindFirstValue(ClaimTypes.Email) ?? User.FindFirstValue("email");
        return StoragePathResolver.ResolveUserStorageIdentity(displayName, email, userId);
    }
}

public sealed class MediaUploadDto
{
    public IFormFile? File { get; set; }
    public string? DestinationFolder { get; set; }
    public bool PublishToYouTube { get; set; }
    public bool PublishToTikTok { get; set; }
    public bool PublishToFacebook { get; set; }
    public string? YouTubeChannelOrEmail { get; set; }
    public string? TikTokUsername { get; set; }
    public string? FacebookPageOrProfile { get; set; }
    public bool YouTubePermissionGranted { get; set; }
    public bool TikTokPermissionGranted { get; set; }
    public bool FacebookPermissionGranted { get; set; }
    public string? Title { get; set; }
    public string? Description { get; set; }
}
