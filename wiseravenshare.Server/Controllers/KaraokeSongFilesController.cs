using System.Net.Mime;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Entities.Karaoke;
using Wiseravenshare.Server.Infrastructure.Data;

namespace Wiseravenshare.Server.Controllers;

/// <summary>
/// Manages user-uploaded full song files stored in the local bucket.
///
/// Routes:
///   POST   /api/karaoke/songs                              – upload a new song file
///   GET    /api/karaoke/songs                              – list caller's songs
///   GET    /api/karaoke/songs/{id}                         – get metadata
///   GET    /api/karaoke/songs/{id}/stream                  – stream audio bytes
///   PATCH  /api/karaoke/songs/{id}                         – update metadata/lyrics
///   DELETE /api/karaoke/songs/{id}                         – soft-delete
///   POST   /api/karaoke/songs/{id}/process                 – trigger vocal separation + LRC extraction
///   GET    /api/karaoke/songs/{id}/processing-status       – poll job status, creates KaraokeTrack when done
/// </summary>
[ApiController]
[Route("api/karaoke/songs")]
[Authorize]
public sealed class KaraokeSongFilesController(
    AppDbContext db,
    IConfiguration configuration,
    IHttpClientFactory httpClientFactory,
    ILogger<KaraokeSongFilesController> logger) : ControllerBase
{
    private static readonly HashSet<string> AllowedAudioTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "audio/mpeg", "audio/mp3", "audio/mp4", "audio/x-m4a", "audio/wav", "audio/wave",
        "audio/x-wav", "audio/ogg", "audio/vorbis", "audio/flac", "audio/x-flac",
        "audio/webm", "audio/aac", "audio/x-aac", "application/octet-stream"
    };

    private string BucketsRoot => configuration["Persistence:BucketsRoot"] ?? "/app/Buckets";
    private string SongsDir   => Path.Combine(BucketsRoot, "karaoke", "songs");

    // ── Upload ────────────────────────────────────────────────────────────

    [HttpPost]
    [RequestSizeLimit(524_288_000)] // 500 MB
    [RequestFormLimits(MultipartBodyLengthLimit = 524_288_000)]
    public async Task<IActionResult> Upload(
        [FromForm] string? title,
        [FromForm] string? artist,
        [FromForm] string? album,
        [FromForm] string? genre,
        [FromForm] string? language,
        [FromForm] int? year,
        [FromForm] bool isPublic = false,
        IFormFile? file = null,
        CancellationToken cancellationToken = default)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty) return Unauthorized();

        if (file is null || file.Length == 0)
            return BadRequest(new { message = "An audio file is required." });

        var contentType = (file.ContentType ?? "application/octet-stream").Split(';')[0].Trim();
        if (!AllowedAudioTypes.Contains(contentType))
            return BadRequest(new { message = $"Unsupported audio type '{contentType}'." });

        var ext = Path.GetExtension(file.FileName ?? "audio.mp3").ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(ext)) ext = MimeToExtension(contentType);

        var entity = new KaraokeSongFile
        {
            Id               = Guid.NewGuid(),
            Title            = (title ?? Path.GetFileNameWithoutExtension(file.FileName ?? "Untitled")).Trim(),
            Artist           = artist?.Trim(),
            Album            = album?.Trim(),
            Genre            = genre?.Trim(),
            Language         = language?.Trim() ?? "en",
            Year             = year,
            OriginalFileName = Path.GetFileName(file.FileName ?? $"audio{ext}"),
            ContentType      = contentType,
            FileSizeBytes    = file.Length,
            IsPublic         = isPublic,
            UploadedByUserId = userId,
            Status           = SongFileStatus.Uploading,
        };

        // Persist to local bucket
        var relativeKey = Path.Combine("karaoke", "songs", entity.Id.ToString("N"), $"audio{ext}");
        var fullPath    = Path.Combine(BucketsRoot, relativeKey);
        Directory.CreateDirectory(Path.GetDirectoryName(fullPath)!);

        await using (var dest = System.IO.File.Create(fullPath))
        await using (var src  = file.OpenReadStream())
        {
            await src.CopyToAsync(dest, cancellationToken);
        }

        entity.LocalBucketKey = relativeKey;
        entity.Status         = SongFileStatus.Uploaded;

        db.KaraokeSongFiles.Add(entity);
        await db.SaveChangesAsync(cancellationToken);

        logger.LogInformation("KaraokeSongFile {Id} uploaded by {UserId} ({Bytes} bytes)",
            entity.Id, userId, entity.FileSizeBytes);

        return CreatedAtAction(nameof(GetById), new { id = entity.Id }, MapDto(entity, Request));
    }

    // ── List ──────────────────────────────────────────────────────────────

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 40,
        [FromQuery] bool includePublic = false,
        CancellationToken cancellationToken = default)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty) return Unauthorized();

        pageSize = Math.Clamp(pageSize, 1, 200);
        page     = Math.Max(1, page);

        var query = db.KaraokeSongFiles
            .AsNoTracking()
            .Where(s => !s.IsDeleted);

        query = includePublic
            ? query.Where(s => s.UploadedByUserId == userId || s.IsPublic)
            : query.Where(s => s.UploadedByUserId == userId);

        var total = await query.CountAsync(cancellationToken);
        var items = await query
            .OrderByDescending(s => s.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Include(s => s.KaraokeTrack)
            .ToListAsync(cancellationToken);

        return Ok(new
        {
            total, page, pageSize,
            items = items.Select(s => MapDto(s, Request))
        });
    }

    // ── Get single ────────────────────────────────────────────────────────

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id, CancellationToken cancellationToken = default)
    {
        var userId = User.GetUserId();
        var song   = await db.KaraokeSongFiles
            .AsNoTracking()
            .Include(s => s.KaraokeTrack)
            .FirstOrDefaultAsync(s => s.Id == id && !s.IsDeleted, cancellationToken);

        if (song is null) return NotFound();
        if (!song.IsPublic && song.UploadedByUserId != userId) return Forbid();

        return Ok(MapDto(song, Request));
    }

    // ── Stream audio ──────────────────────────────────────────────────────

    [HttpGet("{id:guid}/stream")]
    [AllowAnonymous]
    public async Task<IActionResult> Stream(Guid id, CancellationToken cancellationToken = default)
    {
        var song = await db.KaraokeSongFiles
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == id && !s.IsDeleted, cancellationToken);

        if (song is null) return NotFound();

        // Auth: public songs are open, private require the owner's token
        if (!song.IsPublic)
        {
            var userId = User.GetUserId();
            if (userId == Guid.Empty) return Unauthorized();
            if (song.UploadedByUserId != userId) return Forbid();
        }

        // Cloud-migrated: redirect to public CDN URL
        if (song.IsMigratedToCloud && !string.IsNullOrWhiteSpace(song.CloudPublicUrl))
            return Redirect(song.CloudPublicUrl);

        if (string.IsNullOrWhiteSpace(song.LocalBucketKey))
            return NotFound(new { message = "Audio file not yet stored." });

        var fullPath = Path.Combine(BucketsRoot, song.LocalBucketKey);
        if (!System.IO.File.Exists(fullPath))
        {
            logger.LogWarning("KaraokeSongFile {Id} has LocalBucketKey {Key} but file not found", id, song.LocalBucketKey);
            return NotFound(new { message = "Audio file not found on disk." });
        }

        // Update play count in background (non-blocking)
        _ = IncrementPlayCountAsync(id);

        var fileStream = System.IO.File.OpenRead(fullPath);
        Response.Headers["Content-Disposition"] = new ContentDisposition
        {
            FileName = song.OriginalFileName,
            Inline   = true
        }.ToString();

        return File(fileStream, song.ContentType, enableRangeProcessing: true);
    }

    // ── Update metadata ───────────────────────────────────────────────────

    [HttpPatch("{id:guid}")]
    public async Task<IActionResult> Update(
        Guid id,
        [FromBody] UpdateSongFileRequest body,
        CancellationToken cancellationToken = default)
    {
        var userId = User.GetUserId();
        var song   = await db.KaraokeSongFiles
            .FirstOrDefaultAsync(s => s.Id == id && !s.IsDeleted, cancellationToken);

        if (song is null) return NotFound();
        if (song.UploadedByUserId != userId) return Forbid();

        if (body.Title    is not null) song.Title    = body.Title.Trim();
        if (body.Artist   is not null) song.Artist   = body.Artist.Trim();
        if (body.Album    is not null) song.Album    = body.Album.Trim();
        if (body.Genre    is not null) song.Genre    = body.Genre.Trim();
        if (body.Language is not null) song.Language = body.Language.Trim();
        if (body.Year     is not null) song.Year     = body.Year;
        if (body.IsPublic is not null) song.IsPublic = body.IsPublic.Value;
        if (body.LrcContent   is not null) song.LrcContent   = body.LrcContent;
        if (body.PlainLyrics  is not null) song.PlainLyrics  = body.PlainLyrics;
        if (body.DurationSeconds is not null) song.DurationSeconds = body.DurationSeconds;

        song.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);

        return Ok(MapDto(song, Request));
    }

    // ── Delete (soft) ─────────────────────────────────────────────────────

    [HttpDelete("{id:guid}")]
    [HttpPost("{id:guid}/delete")] // proxy-safe compat
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken = default)
    {
        var userId = User.GetUserId();
        var song   = await db.KaraokeSongFiles
            .FirstOrDefaultAsync(s => s.Id == id && !s.IsDeleted, cancellationToken);

        if (song is null) return NotFound();
        if (song.UploadedByUserId != userId) return Forbid();

        song.IsDeleted  = true;
        song.DeletedAt  = DateTime.UtcNow;
        song.UpdatedAt  = DateTime.UtcNow;
        song.Status     = SongFileStatus.Archived;

        await db.SaveChangesAsync(cancellationToken);

        // Best-effort: remove local file (don't fail the request if missing)
        if (!string.IsNullOrWhiteSpace(song.LocalBucketKey))
        {
            var path = Path.Combine(BucketsRoot, song.LocalBucketKey);
            try
            {
                if (System.IO.File.Exists(path)) System.IO.File.Delete(path);
                var dir = Path.GetDirectoryName(path);
                if (!string.IsNullOrWhiteSpace(dir) && Directory.Exists(dir) &&
                    !Directory.EnumerateFileSystemEntries(dir).Any())
                {
                    Directory.Delete(dir);
                }
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Could not remove local file for KaraokeSongFile {Id}", id);
            }
        }

        return NoContent();
    }

    // ── Trigger vocal separation + LRC extraction ─────────────────────────

    /// <summary>
    /// Submits the song to the karaoke engine for vocal separation and LRC extraction.
    /// Returns immediately with a job_id; poll /processing-status?jobId=xxx to track completion.
    /// </summary>
    [HttpPost("{id:guid}/process")]
    public async Task<IActionResult> Process(Guid id, CancellationToken cancellationToken = default)
    {
        var userId = User.GetUserId();
        var song   = await db.KaraokeSongFiles
            .FirstOrDefaultAsync(s => s.Id == id && !s.IsDeleted, cancellationToken);

        if (song is null) return NotFound();
        if (song.UploadedByUserId != userId) return Forbid();

        if (string.IsNullOrWhiteSpace(song.LocalBucketKey))
            return BadRequest(new { message = "Song file not yet stored." });

        var fullPath = Path.Combine(BucketsRoot, song.LocalBucketKey);
        if (!System.IO.File.Exists(fullPath))
            return NotFound(new { message = "Audio file not found on disk." });

        try
        {
            using var client = httpClientFactory.CreateClient("KaraokeServiceUpload");
            using var multipart = new MultipartFormDataContent();
            await using var stream = System.IO.File.OpenRead(fullPath);
            var fileContent = new System.Net.Http.StreamContent(stream);
            fileContent.Headers.ContentType =
                new System.Net.Http.Headers.MediaTypeHeaderValue(song.ContentType ?? "audio/mpeg");
            multipart.Add(fileContent, "file", song.OriginalFileName ?? $"{id}.mp3");
            multipart.Add(new StringContent(userId.ToString()), "user_id");
            multipart.Add(new StringContent(song.Title), "song_title");
            multipart.Add(new StringContent(id.ToString("N")), "song_id");

            var resp = await client.PostAsync("/generate-backing/jobs", multipart, cancellationToken);
            var body = await resp.Content.ReadAsStringAsync(cancellationToken);
            if (!resp.IsSuccessStatusCode)
            {
                logger.LogWarning("Karaoke engine returned {Status} for song {Id}: {Body}",
                    resp.StatusCode, id, body);
                return StatusCode(503, new { message = "Vocal separation service unavailable." });
            }

            song.Status = SongFileStatus.ProcessingQueued;
            song.ProcessingStartedAt = DateTime.UtcNow;
            song.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(cancellationToken);

            return Content(body, "application/json");
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or OperationCanceledException)
        {
            logger.LogWarning(ex, "Karaoke engine unreachable for song {Id}", id);
            return StatusCode(503, new { message = "Vocal separation service is not available in this environment." });
        }
    }

    /// <summary>
    /// Polls the karaoke engine job status.  When the job is complete, creates or updates
    /// the linked KaraokeTrack record with the instrumental URL and LRC content.
    /// </summary>
    [HttpGet("{id:guid}/processing-status")]
    public async Task<IActionResult> ProcessingStatus(
        Guid id,
        [FromQuery] string jobId,
        CancellationToken cancellationToken = default)
    {
        var userId = User.GetUserId();
        var song   = await db.KaraokeSongFiles
            .Include(s => s.KaraokeTrack)
            .FirstOrDefaultAsync(s => s.Id == id && !s.IsDeleted, cancellationToken);

        if (song is null) return NotFound();
        if (song.UploadedByUserId != userId) return Forbid();

        // If already linked to a completed track, return immediately.
        if (song.KaraokeTrack?.Status == KaraokeTrackStatus.Ready)
        {
            return Ok(new
            {
                status = "completed",
                instrumentalUrl = song.KaraokeTrack.InstrumentalUrl,
                lrcContent      = song.KaraokeTrack.LrcContent,
                plainLyrics     = song.KaraokeTrack.PlainLyrics,
                karaokeTrackId  = song.KaraokeTrackId
            });
        }

        if (string.IsNullOrWhiteSpace(jobId))
            return BadRequest(new { message = "jobId is required." });

        try
        {
            using var client = httpClientFactory.CreateClient("KaraokeService");
            var resp = await client.GetAsync(
                $"/jobs/{Uri.EscapeDataString(jobId)}",
                cancellationToken);

            if (!resp.IsSuccessStatusCode)
                return Ok(new { status = "unknown", jobId });

            var body = await resp.Content.ReadAsStringAsync(cancellationToken);
            using var doc = System.Text.Json.JsonDocument.Parse(body);
            var root   = doc.RootElement;
            var status = root.TryGetProperty("status", out var s) ? s.GetString() : "unknown";

            if (status is not "completed")
                return Ok(new { status, jobId });

            // Job completed — extract result and materialise KaraokeTrack.
            var instrumentalUrl = root.TryGetProperty("instrumental_url", out var iu) ? iu.GetString() : null;
            var lrcContent      = root.TryGetProperty("lrc",              out var lc) ? lc.GetString() : null;
            var plainLyrics     = root.TryGetProperty("lyrics",           out var pl) ? pl.GetString()
                                : root.TryGetProperty("text",             out var tx) ? tx.GetString() : null;

            KaraokeTrack track;
            if (song.KaraokeTrackId.HasValue && song.KaraokeTrack is not null)
            {
                track = song.KaraokeTrack;
            }
            else
            {
                track = new KaraokeTrack
                {
                    Id               = Guid.NewGuid(),
                    Title            = song.Title,
                    Artist           = song.Artist ?? string.Empty,
                    Genre            = song.Genre,
                    Language         = song.Language,
                    SourceType       = KaraokeTrackSource.UserUploaded,
                    License          = "User Upload",
                    UploadedByUserId = userId,
                };
                db.KaraokeTracks.Add(track);
            }

            if (!string.IsNullOrWhiteSpace(instrumentalUrl)) track.InstrumentalUrl = instrumentalUrl;
            if (!string.IsNullOrWhiteSpace(lrcContent))      track.LrcContent      = lrcContent;
            if (!string.IsNullOrWhiteSpace(plainLyrics))     track.PlainLyrics     = plainLyrics;
            track.HasInstrumental = !string.IsNullOrWhiteSpace(track.InstrumentalUrl);
            track.HasLrc          = !string.IsNullOrWhiteSpace(track.LrcContent);
            track.Status          = KaraokeTrackStatus.Ready;

            song.KaraokeTrack           = track;
            song.KaraokeTrackId         = track.Id;
            song.Status                 = SongFileStatus.Ready;
            song.ProcessingCompletedAt  = DateTime.UtcNow;
            song.UpdatedAt              = DateTime.UtcNow;

            // Promote LRC to the song record if not already set.
            if (string.IsNullOrWhiteSpace(song.LrcContent) && !string.IsNullOrWhiteSpace(lrcContent))
                song.LrcContent = lrcContent;
            if (string.IsNullOrWhiteSpace(song.PlainLyrics) && !string.IsNullOrWhiteSpace(plainLyrics))
                song.PlainLyrics = plainLyrics;

            await db.SaveChangesAsync(cancellationToken);

            return Ok(new
            {
                status          = "completed",
                instrumentalUrl = track.InstrumentalUrl,
                lrcContent      = track.LrcContent,
                plainLyrics     = track.PlainLyrics,
                karaokeTrackId  = track.Id
            });
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            logger.LogWarning(ex, "Karaoke engine unreachable when polling job {JobId}", jobId);
            return Ok(new { status = "unknown", jobId });
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    private static object MapDto(KaraokeSongFile s, HttpRequest request)
    {
        var baseUrl = $"{request.Scheme}://{request.Host}";
        var audioUrl = s.IsMigratedToCloud && !string.IsNullOrWhiteSpace(s.CloudPublicUrl)
            ? s.CloudPublicUrl
            : (s.LocalBucketKey is not null ? $"{baseUrl}/api/karaoke/songs/{s.Id}/stream" : null);
        var instrumentalUrl = s.KaraokeTrack?.InstrumentalUrl;
        return new
        {
            id               = s.Id,
            title            = s.Title,
            artist           = s.Artist,
            album            = s.Album,
            genre            = s.Genre,
            language         = s.Language,
            year             = s.Year,
            originalFileName = s.OriginalFileName,
            contentType      = s.ContentType,
            fileSizeBytes    = s.FileSizeBytes,
            durationSeconds  = s.DurationSeconds,
            status           = s.Status.ToString(),
            isPublic         = s.IsPublic,
            playCount        = s.PlayCount,
            lrcContent       = s.LrcContent ?? s.KaraokeTrack?.LrcContent,
            plainLyrics      = s.PlainLyrics ?? s.KaraokeTrack?.PlainLyrics,
            coverImageUrl    = s.CoverImageUrl,
            audioUrl,
            instrumentalUrl,
            isMigratedToCloud   = s.IsMigratedToCloud,
            karaokeTrackId      = s.KaraokeTrackId,
            uploadedByUserId    = s.UploadedByUserId,
            createdAt           = s.CreatedAt,
            updatedAt           = s.UpdatedAt,
        };
    }

    private static string MimeToExtension(string mime) => mime.ToLowerInvariant() switch
    {
        "audio/mpeg"   or "audio/mp3"          => ".mp3",
        "audio/mp4"    or "audio/x-m4a"        => ".m4a",
        "audio/wav"    or "audio/wave"
                       or "audio/x-wav"        => ".wav",
        "audio/ogg"    or "audio/vorbis"       => ".ogg",
        "audio/flac"   or "audio/x-flac"       => ".flac",
        "audio/webm"                           => ".webm",
        "audio/aac"    or "audio/x-aac"        => ".aac",
        _                                      => ".audio",
    };

    private async Task IncrementPlayCountAsync(Guid id)
    {
        try
        {
            await db.KaraokeSongFiles
                .Where(s => s.Id == id)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.PlayCount, x => x.PlayCount + 1));
        }
        catch { /* non-fatal */ }
    }
}

public sealed class UpdateSongFileRequest
{
    public string? Title          { get; set; }
    public string? Artist         { get; set; }
    public string? Album          { get; set; }
    public string? Genre          { get; set; }
    public string? Language       { get; set; }
    public int?    Year           { get; set; }
    public bool?   IsPublic       { get; set; }
    public string? LrcContent     { get; set; }
    public string? PlainLyrics    { get; set; }
    public int?    DurationSeconds{ get; set; }
}
