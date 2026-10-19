using System.Security.Claims;
using System.Text.Json;
using System.Net.Http.Headers;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using Wiseravenshare.Server.DTOs;
using Wiseravenshare.Server.Models;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Authorize]
[Route("api/ravensight/media/music")]
public sealed class RavensightMusicMediaController : ControllerBase
{
    private readonly IMusicLibraryStore _musicLibraryStore;
    private readonly IMusicPlaybackStateStore _musicPlaybackStateStore;
    private readonly RavensightMediaCatalogStore _mediaCatalogStore;
    private readonly IBlobStorageService _blobStorageService;
    private readonly ILogger<RavensightMusicMediaController> _logger;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IWebHostEnvironment _environment;
    private readonly IConfiguration _configuration;
    private readonly IRavensightMediaPathService _mediaPathService;

    public RavensightMusicMediaController(
        IMusicLibraryStore musicLibraryStore,
        IMusicPlaybackStateStore musicPlaybackStateStore,
        RavensightMediaCatalogStore mediaCatalogStore,
        IBlobStorageService blobStorageService,
        ILogger<RavensightMusicMediaController> logger,
        IHttpClientFactory httpClientFactory,
        IWebHostEnvironment environment,
        IConfiguration configuration,
        IRavensightMediaPathService mediaPathService)
    {
        _musicLibraryStore = musicLibraryStore;
        _musicPlaybackStateStore = musicPlaybackStateStore;
        _mediaCatalogStore = mediaCatalogStore;
        _blobStorageService = blobStorageService;
        _logger = logger;
        _httpClientFactory = httpClientFactory;
        _environment = environment;
        _configuration = configuration;
        _mediaPathService = mediaPathService;
    }

    [HttpGet]
    [ProducesResponseType(typeof(IReadOnlyList<UserMusicTrackDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetUserMusic(CancellationToken cancellationToken)
    {
        if (!TryResolveUserId(out var userId))
        {
            return Unauthorized(new { message = "Unable to determine current user." });
        }

        var bucketTracks = await _musicLibraryStore.GetUserMusicAsync(userId, cancellationToken);
        var bucketFileNames = new HashSet<string>(bucketTracks.Select(t => t.FileName), StringComparer.OrdinalIgnoreCase);

        IEnumerable<UserMusicTrackDto> catalogTracks = [];
        try
        {
            var catalogAssets = await _mediaCatalogStore.GetUserAssetsAsync(userId, "music", 200, cancellationToken);
            catalogTracks = catalogAssets
                .Where(a => !bucketFileNames.Contains(a.FileName))
                .Select(a =>
                {
                    // StreamByBlobPath returns "" (not null) when path is empty, so ?? won't trigger.
                    // Use IsNullOrWhiteSpace check to properly fall back to filename streaming.
                    var blobPath = StreamingUrlHelper.StreamByBlobPath(a.RelativePath);
                    var streamPath = string.IsNullOrWhiteSpace(blobPath)
                        ? StreamingUrlHelper.StreamByFileName(a.FileName)
                        : blobPath;
                    return new UserMusicTrackDto
                    {
                        Id = a.Id,
                        Title = ReadMusicMeta(a.MetadataJson, "title") is { Length: > 0 } t
                            ? t
                            : System.IO.Path.GetFileNameWithoutExtension(a.FileName),
                        Artist = ReadMusicMeta(a.MetadataJson, "artist"),
                        Album = ReadMusicMeta(a.MetadataJson, "album"),
                        Genre = ReadMusicMeta(a.MetadataJson, "genre"),
                        MediaUrl = StreamingUrlHelper.ResolveMediaUrl(a.PublicUrl, streamPath),
                        RelativePath = a.RelativePath,
                        ObjectKey = a.RelativePath,
                        FileName = a.FileName,
                        UploadedAt = a.SavedAtUtc.ToString("O"),
                        SizeBytes = a.SizeBytes
                    };
                });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Catalog query failed for user {UserId} during GetUserMusic; serving bucket tracks only.", userId);
        }

        return Ok(bucketTracks.Concat(catalogTracks).ToList());
    }

    [HttpGet("{trackId}/browser-compatible")]
    [Produces("audio/mpeg", "application/json")]
    public async Task<IActionResult> GetBrowserCompatibleTrack(string trackId, CancellationToken cancellationToken)
    {
        if (!TryResolveUserId(out var userId))
            return Unauthorized(new { message = "Unable to determine current user." });

        string? objectKey = null;
        string fileName = "audio-file";
        RavensightMediaAssetRecord? catalogAsset = null;
        var tracks = await _musicLibraryStore.GetUserMusicAsync(userId, cancellationToken);
        var track = tracks.FirstOrDefault(candidate => string.Equals(candidate.Id, trackId, StringComparison.OrdinalIgnoreCase));
        if (track is not null)
        {
            objectKey = track.ObjectKey;
            fileName = track.FileName;
        }
        else
        {
            catalogAsset = await _mediaCatalogStore.GetUserAssetByIdAsync(userId, trackId, cancellationToken);
            if (catalogAsset is null || !string.Equals(catalogAsset.MediaType, "music", StringComparison.OrdinalIgnoreCase))
                return NotFound(new { message = "Track not found in your library." });
            objectKey = catalogAsset.RelativePath;
            fileName = catalogAsset.FileName;
        }

        // Some music uploads are cataloged in both bucket_objects and the unified
        // media catalog. Resolve the catalog row by ID or filename so local and
        // backup copies remain usable when the primary Spaces object has expired.
        if (catalogAsset is null)
        {
            catalogAsset = await _mediaCatalogStore.GetUserAssetByIdAsync(userId, trackId, cancellationToken);
            if (catalogAsset is null)
            {
                var userAssets = await _mediaCatalogStore.GetUserAssetsAsync(userId, "music", 10000, cancellationToken);
                catalogAsset = userAssets.FirstOrDefault(asset =>
                    string.Equals(asset.FileName, fileName, StringComparison.OrdinalIgnoreCase));
            }
        }

        var objectKeyCandidates = BuildObjectKeyCandidates(
            objectKey,
            track?.MediaUrl,
            catalogAsset?.RelativePath,
            catalogAsset?.PublicUrl,
            userId,
            fileName);

        if (objectKeyCandidates.Count == 0)
            return NotFound(new { message = "The original audio file has no stored media key." });

        Stream? source = null;
        foreach (var candidateKey in objectKeyCandidates)
        {
            source = await _blobStorageService.OpenReadAsync(candidateKey, cancellationToken);
            if (source is not null)
                break;
        }

        if (source is null && catalogAsset is not null)
        {
            if (!string.IsNullOrWhiteSpace(catalogAsset.AbsolutePath)
                && System.IO.File.Exists(catalogAsset.AbsolutePath))
                source = new FileStream(catalogAsset.AbsolutePath, FileMode.Open, FileAccess.Read, FileShare.Read, 81920, useAsync: true);
        }

        if (source is null)
        {
            var userMusicFolder = $"users/{ResolveUserStorageIdentity(userId)}/media/music";
            var objectFolders = objectKeyCandidates
                .Select(candidate => Path.GetDirectoryName(candidate.Replace('/', Path.DirectorySeparatorChar)))
                .Where(folder => !string.IsNullOrWhiteSpace(folder));
            var localFolders = new[]
            {
                catalogAsset?.DestinationFolder,
                userMusicFolder
            }
            .Concat(objectFolders)
            .Where(folder => !string.IsNullOrWhiteSpace(folder))
            .Distinct(StringComparer.OrdinalIgnoreCase);

            foreach (var localFolder in localFolders)
            {
                var localPath = _mediaPathService.ResolveExistingFilePath(
                    RavensightMediaType.Music,
                    fileName,
                    localFolder);
                if (string.IsNullOrWhiteSpace(localPath) || !System.IO.File.Exists(localPath))
                    continue;
                source = new FileStream(localPath, FileMode.Open, FileAccess.Read, FileShare.Read, 81920, useAsync: true);
                break;
            }
        }

        if (source is null)
            source = await OpenMediaBackupAsync(userId, catalogAsset?.Id ?? track?.Id ?? trackId, fileName, cancellationToken);

        if (source is null)
            return NotFound(new { message = "The original audio file is no longer available in primary storage or its configured backup. Re-upload the file to restore playback." });

        await using var ownedSource = source;

        using var client = _httpClientFactory.CreateClient("AudioService");
        using var multipart = new MultipartFormDataContent();
        using var fileContent = new StreamContent(ownedSource);
        using var conversionRequest = new HttpRequestMessage(HttpMethod.Post, "/browser-compatible");
        fileContent.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        multipart.Add(fileContent, "file", Path.GetFileName(fileName));
        conversionRequest.Content = multipart;
        conversionRequest.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("audio/mpeg"));
        conversionRequest.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json", 0.9));

        HttpResponseMessage response;
        try
        {
            response = await client.SendAsync(conversionRequest, cancellationToken);
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "Audio compatibility service unavailable for track {TrackId}.", trackId);
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = "Audio conversion is unavailable right now." });
        }

        using (response)
        {
            if (!response.IsSuccessStatusCode)
            {
                var detail = await response.Content.ReadAsStringAsync(cancellationToken);
                _logger.LogWarning("Audio conversion returned {Status} for track {TrackId}: {Detail}", (int)response.StatusCode, trackId, detail);
                return StatusCode((int)response.StatusCode, new { message = "Audio conversion failed.", detail });
            }

            var converted = await response.Content.ReadAsByteArrayAsync(cancellationToken);
            return File(converted, "audio/mpeg", $"{Path.GetFileNameWithoutExtension(fileName)}.mp3");
        }
    }

    private async Task<Stream?> OpenMediaBackupAsync(Guid userId, string assetId, string fileName, CancellationToken cancellationToken)
    {
        var safeName = Path.GetFileName(fileName);
        var safeAssetId = Path.GetFileName(assetId);
        if (string.IsNullOrWhiteSpace(safeName) || string.IsNullOrWhiteSpace(safeAssetId))
            return null;

        // The media backup endpoint stores object copies under this deterministic key.
        var backupKey = $"backups/media/{userId:N}/{safeAssetId}/{safeName}";
        var backupStream = await _blobStorageService.OpenReadAsync(backupKey, cancellationToken);
        if (backupStream is not null)
            return backupStream;

        // Also check the local backup root used by the same endpoint.
        var configuredRoot = _configuration["MediaBackup:LocalRoot"];
        var backupRoot = Path.GetFullPath(string.IsNullOrWhiteSpace(configuredRoot)
            ? Path.Combine(_environment.ContentRootPath, "App_Data", "MediaBackups")
            : Path.IsPathRooted(configuredRoot) ? configuredRoot : Path.Combine(_environment.ContentRootPath, configuredRoot));
        var candidate = Path.GetFullPath(Path.Combine(backupRoot, userId.ToString("N"), safeAssetId, safeName));
        var rootPrefix = backupRoot.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar) + Path.DirectorySeparatorChar;
        if (!candidate.StartsWith(rootPrefix, StringComparison.OrdinalIgnoreCase) || !System.IO.File.Exists(candidate))
            return null;

        return new FileStream(candidate, FileMode.Open, FileAccess.Read, FileShare.Read, 81920, useAsync: true);
    }

    private async Task CreateMusicBackupAsync(
        Guid userId,
        string assetId,
        string objectKey,
        string fileName,
        string destinationFolder,
        string contentType,
        CancellationToken cancellationToken)
    {
        var safeName = Path.GetFileName(fileName);
        var safeAssetId = Path.GetFileName(assetId);
        if (string.IsNullOrWhiteSpace(safeName) || string.IsNullOrWhiteSpace(safeAssetId))
            return;

        var backupKey = $"backups/media/{userId:N}/{safeAssetId}/{safeName}";
        if (_blobStorageService.IsConfigured)
        {
            await using var original = await _blobStorageService.OpenReadAsync(objectKey, cancellationToken);
            if (original is not null)
            {
                await _blobStorageService.UploadAsync(backupKey, original, contentType, cancellationToken);
                return;
            }

            var localSourcePath = _mediaPathService.ResolveExistingFilePath(
                RavensightMediaType.Music,
                safeName,
                destinationFolder);
            if (!string.IsNullOrWhiteSpace(localSourcePath) && System.IO.File.Exists(localSourcePath))
            {
                await using var localSource = new FileStream(localSourcePath, FileMode.Open, FileAccess.Read, FileShare.Read, 81920, useAsync: true);
                await _blobStorageService.UploadAsync(backupKey, localSource, contentType, cancellationToken);
                return;
            }
        }

        var configuredRoot = _configuration["MediaBackup:LocalRoot"];
        var backupRoot = Path.GetFullPath(string.IsNullOrWhiteSpace(configuredRoot)
            ? Path.Combine(_environment.ContentRootPath, "App_Data", "MediaBackups")
            : Path.IsPathRooted(configuredRoot) ? configuredRoot : Path.Combine(_environment.ContentRootPath, configuredRoot));
        var backupPath = Path.GetFullPath(Path.Combine(backupRoot, userId.ToString("N"), safeAssetId, safeName));
        var rootPrefix = backupRoot.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar) + Path.DirectorySeparatorChar;
        if (!backupPath.StartsWith(rootPrefix, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Invalid local music backup path.");

        var sourcePath = _mediaPathService.ResolveExistingFilePath(
            RavensightMediaType.Music,
            safeName,
            destinationFolder);
        if (string.IsNullOrWhiteSpace(sourcePath) || !System.IO.File.Exists(sourcePath))
            return;

        Directory.CreateDirectory(Path.GetDirectoryName(backupPath)!);
        await using var input = new FileStream(sourcePath, FileMode.Open, FileAccess.Read, FileShare.Read, 81920, useAsync: true);
        await using var output = new FileStream(backupPath, FileMode.Create, FileAccess.Write, FileShare.None, 81920, useAsync: true);
        await input.CopyToAsync(output, cancellationToken);
    }

    [HttpGet("player-state")]
    [ProducesResponseType(typeof(MusicPlayerStateDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetPlayerState(CancellationToken cancellationToken)
    {
        if (!TryResolveUserId(out var userId))
        {
            return Unauthorized(new { message = "Unable to determine current user." });
        }

        var state = await _musicPlaybackStateStore.GetStateAsync(userId, cancellationToken);
        return Ok(state);
    }

    [HttpPut("player-state")]
    [ProducesResponseType(typeof(MusicPlayerStateDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> UpsertPlayerState(
        [FromBody] MusicPlayerStateUpsertRequest request,
        CancellationToken cancellationToken)
    {
        if (!TryResolveUserId(out var userId))
        {
            return Unauthorized(new { message = "Unable to determine current user." });
        }

        var state = await _musicPlaybackStateStore.UpsertStateAsync(userId, request, cancellationToken);
        return Ok(state);
    }

    [HttpPost("favorites/{trackId}")]
    [ProducesResponseType(typeof(MusicPlayerStateDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> AddFavorite(string trackId, CancellationToken cancellationToken)
    {
        if (!TryResolveUserId(out var userId))
        {
            return Unauthorized(new { message = "Unable to determine current user." });
        }

        var state = await _musicPlaybackStateStore.ToggleFavoriteAsync(userId, trackId, true, cancellationToken);
        return Ok(state);
    }

    [HttpDelete("favorites/{trackId}")]
    [ProducesResponseType(typeof(MusicPlayerStateDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> RemoveFavorite(string trackId, CancellationToken cancellationToken)
    {
        if (!TryResolveUserId(out var userId))
        {
            return Unauthorized(new { message = "Unable to determine current user." });
        }

        var state = await _musicPlaybackStateStore.ToggleFavoriteAsync(userId, trackId, false, cancellationToken);
        return Ok(state);
    }

    [HttpPost("history/{trackId}")]
    [ProducesResponseType(typeof(MusicPlayerStateDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> RecordHistory(
        string trackId,
        [FromQuery] double positionSeconds = 0,
        [FromQuery] bool completed = false,
        CancellationToken cancellationToken = default)
    {
        if (!TryResolveUserId(out var userId))
        {
            return Unauthorized(new { message = "Unable to determine current user." });
        }

        var state = await _musicPlaybackStateStore.AppendHistoryAsync(
            userId,
            trackId,
            positionSeconds,
            completed,
            cancellationToken);

        return Ok(state);
    }

    [HttpDelete("{trackId}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DeleteTrack([FromRoute] string trackId, CancellationToken cancellationToken = default)
    {
        if (!TryResolveUserId(out var userId))
        {
            return Unauthorized(new { message = "Unable to determine current user." });
        }

        var normalizedTrackId = string.IsNullOrWhiteSpace(trackId) ? string.Empty : trackId.Trim();
        if (string.IsNullOrWhiteSpace(normalizedTrackId))
        {
            return BadRequest(new { message = "trackId is required." });
        }

        var deletedFileNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var blobDeleted = false;

        MusicLibraryDeleteResult? bucketDeleted = null;
        try
        {
            bucketDeleted = await _musicLibraryStore.DeleteMusicAsync(userId, normalizedTrackId, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not remove music library row {TrackId} for user {UserId}; trying the media catalog.", normalizedTrackId, userId);
        }
        if (bucketDeleted is not null)
        {
            if (!string.IsNullOrWhiteSpace(bucketDeleted.FileName))
            {
                deletedFileNames.Add(bucketDeleted.FileName);
            }

            var bucketObjectKey = string.IsNullOrWhiteSpace(bucketDeleted.ObjectKey)
                ? _blobStorageService.ResolveObjectKey(bucketDeleted.PublicUrl)
                : bucketDeleted.ObjectKey;

            if (!string.IsNullOrWhiteSpace(bucketObjectKey))
            {
                try
                {
                    blobDeleted = await _blobStorageService.DeleteAsync(bucketObjectKey, cancellationToken) || blobDeleted;
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to delete music blob for track {TrackId}", normalizedTrackId);
                }
            }
        }

        RavensightMediaAssetRecord? catalogAsset = null;
        try
        {
            catalogAsset = await _mediaCatalogStore.GetUserAssetByIdAsync(userId, normalizedTrackId, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not read catalog row for music track {TrackId}; continuing with bucket deletion result.", normalizedTrackId);
        }
        if (catalogAsset is not null && string.Equals(catalogAsset.MediaType, "music", StringComparison.OrdinalIgnoreCase))
        {
            deletedFileNames.Add(catalogAsset.FileName);

            var catalogObjectKey = string.IsNullOrWhiteSpace(catalogAsset.RelativePath)
                ? _blobStorageService.ResolveObjectKey(catalogAsset.PublicUrl ?? string.Empty)
                : catalogAsset.RelativePath;

            if (!string.IsNullOrWhiteSpace(catalogObjectKey))
            {
                try
                {
                    blobDeleted = await _blobStorageService.DeleteAsync(catalogObjectKey, cancellationToken) || blobDeleted;
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to delete catalog music blob for track {TrackId}", normalizedTrackId);
                }
            }

            try { await _mediaCatalogStore.MarkAssetDeletedAsync(catalogAsset.Id, DateTime.UtcNow, cancellationToken); }
            catch (Exception ex) { _logger.LogWarning(ex, "Failed to mark music asset {AssetId} deleted.", catalogAsset.Id); }
        }

        foreach (var fileName in deletedFileNames)
        {
            IReadOnlyList<MusicLibraryDeleteResult> bucketRows = Array.Empty<MusicLibraryDeleteResult>();
            try { bucketRows = await _musicLibraryStore.DeleteMusicByFileNameAsync(userId, fileName, cancellationToken); }
            catch (Exception ex) { _logger.LogWarning(ex, "Failed to clean up additional bucket rows for music file {FileName}.", fileName); }
            foreach (var row in bucketRows)
            {
                var objectKey = string.IsNullOrWhiteSpace(row.ObjectKey)
                    ? _blobStorageService.ResolveObjectKey(row.PublicUrl)
                    : row.ObjectKey;

                if (!string.IsNullOrWhiteSpace(objectKey))
                {
                    try
                    {
                        blobDeleted = await _blobStorageService.DeleteAsync(objectKey, cancellationToken) || blobDeleted;
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Failed deleting music blob by filename {FileName}", fileName);
                    }
                }
            }
        }

        if (deletedFileNames.Count > 0)
        {
            try
            {
                var assets = await _mediaCatalogStore.GetUserAssetsAsync(userId, "music", 500, cancellationToken);
                foreach (var asset in assets.Where(a => deletedFileNames.Contains(a.FileName)))
                {
                    try { await _mediaCatalogStore.MarkAssetDeletedAsync(asset.Id, DateTime.UtcNow, cancellationToken); }
                    catch (Exception ex) { _logger.LogWarning(ex, "Failed to mark music asset {AssetId} deleted.", asset.Id); }
                }
            }
            catch (Exception ex) { _logger.LogWarning(ex, "Failed to reconcile catalog rows after deleting music track {TrackId}.", normalizedTrackId); }
        }

        if (bucketDeleted is null && catalogAsset is null)
        {
            return NotFound(new { message = "Track not found." });
        }

        return Ok(new
        {
            success = true,
            id = normalizedTrackId,
            blobDeleted,
            removedFileNames = deletedFileNames.ToArray()
        });
    }

    [HttpPatch("{trackId}/state")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> UpdateTrackState(
        [FromRoute] string trackId,
        [FromBody] UpdateRavensightMediaStateRequest request,
        CancellationToken cancellationToken = default)
    {
        if (!TryResolveUserId(out var userId))
        {
            return Unauthorized(new { message = "Unable to determine current user." });
        }

        if (string.IsNullOrWhiteSpace(trackId))
        {
            return BadRequest(new { message = "trackId is required." });
        }

        var updated = await _musicLibraryStore.UpdateTrackStateAsync(
            userId,
            trackId.Trim(),
            request.Archived ?? false,
            request.Protected ?? false,
            cancellationToken);

        if (!updated)
        {
            return NotFound(new { message = "Track not found." });
        }

        return Ok(new { success = true, archived = request.Archived ?? false, @protected = request.Protected ?? false });
    }

    [HttpPost("save")]
    [RequestSizeLimit(200_000_000)]
    [ProducesResponseType(typeof(RavensightSavedMediaDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> SaveMusic([FromForm] SaveRavensightMusicDto dto, CancellationToken cancellationToken)
    {
        // Resilient file resolution: accept both lowercase 'file' and uppercase 'File' field names.
        var file = dto.File;
        if (file is null || file.Length == 0)
        {
            file = Request.Form.Files.FirstOrDefault(f =>
                string.Equals(f.Name, "file", StringComparison.OrdinalIgnoreCase)
                || string.Equals(f.Name, "File", StringComparison.OrdinalIgnoreCase));
        }

        if (file is null || file.Length == 0)
        {
            return BadRequest(new { message = "No music file uploaded. Ensure the multipart field is named 'File'." });
        }

        // Normalize the resolved upload back onto the DTO so every downstream
        // read (dto.File.ContentType below, and SaveMusicAsync) sees the same
        // instance. Assigning unconditionally matters: `??=` only fires when
        // dto.File is null, so a non-null but empty binding (Length == 0)
        // recovered from Request.Form would otherwise be discarded here and
        // reach SaveMusicAsync empty, which throws InvalidOperationException
        // and surfaced as an unhandled 500.
        dto.File = file;

        // Return explicit 400 for unsupported formats instead of a 500 from the service layer.
        var fileExtension = Path.GetExtension(file.FileName)?.ToLowerInvariant();
        var allowedExtensions = new[] { ".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg" };
        if (string.IsNullOrWhiteSpace(fileExtension) || !allowedExtensions.Contains(fileExtension))
        {
            return BadRequest(new { message = $"Unsupported audio format '{fileExtension}'. Supported formats: MP3, WAV, M4A, AAC, FLAC, OGG." });
        }

        if (!TryResolveUserId(out var userId))
        {
            return Unauthorized(new { message = "Unable to determine current user." });
        }

        // Enforce 30-song free-tier cap. Future: bypass for users with an active music creator plan.
        const int MusicUploadLimit = 30;
        IReadOnlyList<UserMusicTrackDto> existingTracks;
        try
        {
            existingTracks = await _musicLibraryStore.GetUserMusicAsync(userId, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not retrieve existing track count for user {UserId}; proceeding with upload.", userId);
            existingTracks = Array.Empty<UserMusicTrackDto>();
        }

        if (existingTracks.Count >= MusicUploadLimit)
        {
            return StatusCode(StatusCodes.Status409Conflict, new
            {
                message = $"Your Wise-tracks library has reached the {MusicUploadLimit}-song limit. Delete a track to free space, or upgrade to a Music Creator Plan for unlimited storage.",
                limit = MusicUploadLimit,
                current = existingTracks.Count
            });
        }

        var userStorageIdentity = ResolveUserStorageIdentity(userId);
        // Always route music uploads into the user-specific folder regardless of what the client sent.
        var userMusicFolder = $"users/{userStorageIdentity}/media/music";
        dto.DestinationFolder = userMusicFolder;

        UserMusicTrackDto track;
        try
        {
            track = await _musicLibraryStore.SaveMusicAsync(userId, dto.File, dto, userStorageIdentity, cancellationToken);
        }
        catch (InvalidOperationException ex)
        {
            // SaveMusicAsync guards against an empty upload; surface that as a
            // client error rather than letting it become an unhandled 500.
            _logger.LogWarning(ex, "Music upload rejected for user {UserId}.", userId);
            return BadRequest(new { message = ex.Message });
        }

        var mediaUrl = string.IsNullOrWhiteSpace(track.MediaUrl)
            ? StreamingUrlHelper.StreamByFileName(track.FileName)
            : track.MediaUrl;

        // Mirror to the unified media catalog so GetUserMusic can always find it.
        var savedAtUtc = DateTime.TryParse(track.UploadedAt, out var uploadedAt) ? uploadedAt.ToUniversalTime() : DateTime.UtcNow;
        RavensightMediaAssetRecord? savedCatalogAsset = null;
        try
        {
            savedCatalogAsset = await _mediaCatalogStore.CreateAssetAsync(new CreateRavensightMediaAssetRequest
            {
                UserId = userId,
                MediaType = RavensightMediaType.Music,
                FileName = track.FileName,
                // Use the actual blob object key so catalog streaming URLs match bucket_objects.
                RelativePath = string.IsNullOrWhiteSpace(track.ObjectKey) ? $"{userMusicFolder}/{track.FileName}" : track.ObjectKey,
                PublicUrl = mediaUrl.StartsWith("/", StringComparison.Ordinal) ? null : mediaUrl,
                AbsolutePath = string.Empty,
                DestinationFolder = userMusicFolder,
                ContentType = dto.File.ContentType,
                SizeBytes = track.SizeBytes,
                SavedAtUtc = savedAtUtc,
                MetadataJson = JsonSerializer.Serialize(new
                {
                    title = track.Title,
                    artist = track.Artist,
                    album = track.Album,
                    genre = track.Genre,
                    fingerprint = track.Fingerprint,
                    archived = false,
                    @protected = false,
                    mediaUrl
                })
            }, cancellationToken);
        }
        catch (Exception ex)
        {
            // Catalog write is best-effort; bucket_objects already has the record.
            HttpContext.RequestServices
                .GetService<ILogger<RavensightMusicMediaController>>()
                ?.LogWarning(ex, "Music catalog entry failed for user {UserId}; track saved in bucket store.", userId);
        }

        try
        {
            await CreateMusicBackupAsync(
                userId,
                savedCatalogAsset?.Id ?? track.Id,
                track.ObjectKey,
                track.FileName,
                userMusicFolder,
                dto.File.ContentType,
                cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Music backup could not be created for track {TrackId}; primary upload remains saved.", track.Id);
        }

        return Ok(new
        {
            track,
            file = new RavensightSavedMediaDto
            {
                FileName = track.FileName,
                RelativePath = $"{userMusicFolder}/{track.FileName}",
                DestinationFolder = userMusicFolder,
                ContentType = dto.File.ContentType,
                SizeBytes = track.SizeBytes,
                SavedAtUtc = savedAtUtc,
                MediaUrl = mediaUrl
            },
            fileName = track.FileName,
            filePath = mediaUrl,
            mediaUrl
        });
    }

    private bool TryResolveUserId(out Guid userId)
    {
        var userIdRaw = User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? User.FindFirstValue("sub")
            ?? User.FindFirstValue("id");

        return Guid.TryParse(userIdRaw, out userId) && userId != Guid.Empty;
    }

    private string ResolveUserStorageIdentity(Guid userId)
    {
        var displayName = User.FindFirstValue(ClaimTypes.Name);
        var email = User.FindFirstValue(ClaimTypes.Email) ?? User.FindFirstValue("email");
        return StoragePathResolver.ResolveUserStorageIdentity(displayName, email, userId.ToString("N"));
    }

    private List<string> BuildObjectKeyCandidates(
        string? objectKey,
        string? trackMediaUrl,
        string? catalogRelativePath,
        string? catalogPublicUrl,
        Guid userId,
        string fileName)
    {
        var keys = new List<string>();
        var projectFolder = (_configuration["Storage:ProjectFolder"] ?? "wiseravenshare").Trim().Trim('/');
        var userStorageIdentity = ResolveUserStorageIdentity(userId);
        var fallbackUserMusicPath = $"users/{userStorageIdentity}/media/music/{Path.GetFileName(fileName)}";
        var fallbackUserAudioPath = $"users/{userStorageIdentity}/media/audio/{Path.GetFileName(fileName)}";

        AddObjectKeyCandidate(keys, objectKey, projectFolder);
        AddObjectKeyCandidate(keys, catalogRelativePath, projectFolder);
        AddObjectKeyCandidate(keys, _blobStorageService.ResolveObjectKey(objectKey ?? string.Empty), projectFolder);
        AddObjectKeyCandidate(keys, _blobStorageService.ResolveObjectKey(catalogRelativePath ?? string.Empty), projectFolder);
        AddObjectKeyCandidate(keys, ExtractObjectKeyFromMediaUrl(trackMediaUrl), projectFolder);
        AddObjectKeyCandidate(keys, ExtractObjectKeyFromMediaUrl(catalogPublicUrl), projectFolder);
        AddObjectKeyCandidate(keys, _blobStorageService.ResolveObjectKey(trackMediaUrl ?? string.Empty), projectFolder);
        AddObjectKeyCandidate(keys, _blobStorageService.ResolveObjectKey(catalogPublicUrl ?? string.Empty), projectFolder);
        AddObjectKeyCandidate(keys, fallbackUserMusicPath, projectFolder);
        AddObjectKeyCandidate(keys, fallbackUserAudioPath, projectFolder);

        return keys;
    }

    private static string? ExtractObjectKeyFromMediaUrl(string? mediaUrl)
    {
        if (string.IsNullOrWhiteSpace(mediaUrl))
            return null;

        var value = mediaUrl.Trim();
        if (!Uri.TryCreate(value, UriKind.RelativeOrAbsolute, out var uri))
            return null;

        var path = uri.IsAbsoluteUri ? uri.AbsolutePath : value;
        var normalizedPath = path.Replace('\\', '/');
        const string mediaBlobPrefix = "/api/media/blob/";
        const string videoBlobPrefix = "/api/videostreaming/blob/";
        if (normalizedPath.StartsWith(mediaBlobPrefix, StringComparison.OrdinalIgnoreCase))
            return Uri.UnescapeDataString(normalizedPath[mediaBlobPrefix.Length..]).Trim('/');
        if (normalizedPath.StartsWith(videoBlobPrefix, StringComparison.OrdinalIgnoreCase))
            return Uri.UnescapeDataString(normalizedPath[videoBlobPrefix.Length..]).Trim('/');

        return null;
    }

    private static void AddObjectKeyCandidate(ICollection<string> keys, string? candidate, string projectFolder)
    {
        if (string.IsNullOrWhiteSpace(candidate))
            return;

        var normalized = candidate.Replace('\\', '/').Trim('/');
        if (string.IsNullOrWhiteSpace(normalized))
            return;

        if (!keys.Contains(normalized, StringComparer.OrdinalIgnoreCase))
            keys.Add(normalized);

        if (!normalized.StartsWith(projectFolder + "/", StringComparison.OrdinalIgnoreCase))
        {
            var projectScoped = $"{projectFolder}/{normalized}".Trim('/');
            if (!keys.Contains(projectScoped, StringComparer.OrdinalIgnoreCase))
                keys.Add(projectScoped);
        }
    }

    private static string ReadMusicMeta(string? metadataJson, string key)
    {
        if (string.IsNullOrWhiteSpace(metadataJson)) return string.Empty;
        try
        {
            using var doc = JsonDocument.Parse(metadataJson);
            if (doc.RootElement.TryGetProperty(key, out var val) && val.ValueKind == JsonValueKind.String)
                return val.GetString() ?? string.Empty;
        }
        catch { /* ignore */ }
        return string.Empty;
    }
}
