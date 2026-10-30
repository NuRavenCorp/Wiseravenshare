using System.ComponentModel.DataAnnotations;
using Wiseravenshare.Server.Entities;

namespace Wiseravenshare.Server.Entities.Karaoke;

/// <summary>
/// Represents a full song audio file uploaded by a user and stored in the
/// local bucket filesystem.  Designed for future migration to DO Spaces or
/// any S3-compatible cloud store without schema changes.
///
/// Blob key convention (local and cloud):
///   karaoke/songs/{Id}/audio{.ext}          – primary audio file
///   karaoke/songs/{Id}/cover{.ext}          – optional cover art
///   karaoke/songs/{Id}/lyrics.lrc           – optional timed lyrics
/// </summary>
public class KaraokeSongFile : BaseEntity
{
    // ── Identity / metadata ───────────────────────────────────────────────
    [MaxLength(255)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(255)]
    public string? Artist { get; set; }

    [MaxLength(255)]
    public string? Album { get; set; }

    [MaxLength(100)]
    public string? Genre { get; set; }

    [MaxLength(10)]
    public string? Language { get; set; } = "en";

    public int? Year { get; set; }

    // ── Uploaded file info ────────────────────────────────────────────────
    [MaxLength(512)]
    public string OriginalFileName { get; set; } = string.Empty;

    [MaxLength(128)]
    public string ContentType { get; set; } = "audio/mpeg";

    public long FileSizeBytes { get; set; }

    public int? DurationSeconds { get; set; }

    public int? Bpm { get; set; }

    [MaxLength(16)]
    public string? MusicalKey { get; set; }

    // ── Local bucket storage (active tier) ───────────────────────────────
    // Relative key inside the BucketsRoot directory.
    // Full path = {BucketsRoot}/{LocalBucketKey}
    [MaxLength(1024)]
    public string? LocalBucketKey { get; set; }

    // Served via /api/karaoke/songs/{id}/stream  →  maps to this key.
    // e.g.  karaoke/songs/{Id}/audio.mp3

    // ── Cloud / blob storage (future tier) ───────────────────────────────
    // Object key inside the configured DO Spaces / S3 bucket.
    [MaxLength(1024)]
    public string? CloudBlobKey { get; set; }

    // Resolved public URL after cloud migration.
    [MaxLength(2048)]
    public string? CloudPublicUrl { get; set; }

    public bool IsMigratedToCloud { get; set; }

    public DateTime? CloudMigratedAt { get; set; }

    // ── Cover image ───────────────────────────────────────────────────────
    [MaxLength(1024)]
    public string? CoverImageLocalKey { get; set; }

    [MaxLength(2048)]
    public string? CoverImageUrl { get; set; }

    // ── Lyrics (cached inline) ────────────────────────────────────────────
    public string? LrcContent { get; set; }     // LRC-format timed lyrics
    public string? PlainLyrics { get; set; }    // plain-text fallback

    // ── Status ────────────────────────────────────────────────────────────
    public SongFileStatus Status { get; set; } = SongFileStatus.Uploaded;

    [MaxLength(1024)]
    public string? ProcessingError { get; set; }

    public DateTime? ProcessingStartedAt { get; set; }
    public DateTime? ProcessingCompletedAt { get; set; }

    // ── Link to processed KaraokeTrack (set once vocal separation is done) ─
    public Guid? KaraokeTrackId { get; set; }
    public virtual KaraokeTrack? KaraokeTrack { get; set; }

    // ── Visibility ────────────────────────────────────────────────────────
    public bool IsPublic { get; set; }      // false = private to uploader only

    // ── Statistics ────────────────────────────────────────────────────────
    public int PlayCount { get; set; }

    // ── Owner ─────────────────────────────────────────────────────────────
    public Guid UploadedByUserId { get; set; }
    public virtual User UploadedByUser { get; set; } = null!;

    // ── Computed helpers (not persisted) ─────────────────────────────────
    /// <summary>
    /// Returns the best available audio URL: cloud first, local stream endpoint fallback.
    /// The local endpoint value is returned as a relative path segment; callers
    /// must prefix with the app base URL.
    /// </summary>
    public string? ResolveAudioUrl(string appBaseUrl)
    {
        if (IsMigratedToCloud && !string.IsNullOrWhiteSpace(CloudPublicUrl))
            return CloudPublicUrl;
        if (!string.IsNullOrWhiteSpace(LocalBucketKey))
            return $"{appBaseUrl.TrimEnd('/')}/api/karaoke/songs/{Id}/stream";
        return null;
    }
}

public enum SongFileStatus
{
    Uploading       = 0,    // multipart upload in progress
    Uploaded        = 1,    // stored locally; ready to play
    ProcessingQueued = 2,   // queued for vocal separation / LRC extraction
    Processing      = 3,    // python-karaoke job running
    Ready           = 4,    // vocal separation done; KaraokeTrack linked
    Failed          = 5,    // processing failed; ErrorMessage set
    CloudMigrating  = 6,    // in-flight copy to cloud storage
    Archived        = 7,    // soft-removed from active service
}
