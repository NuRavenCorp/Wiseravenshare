using System.ComponentModel.DataAnnotations;
using Wiseravenshare.Server.Entities;

namespace Wiseravenshare.Server.Entities.Karaoke;

/// <summary>
/// A karaoke track sourced from public-domain collections, Creative Commons
/// releases, or user uploads.  Blob keys follow the convention:
///   {BlobProjectFolder}/karaoke/tracks/{Id}/{file}
/// e.g.  wiseravenshare/karaoke/tracks/{uuid}/instrumental.wav
/// </summary>
public class KaraokeTrack : BaseEntity
{
    // ── Identity ──────────────────────────────────────────────────────────
    [MaxLength(255)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(255)]
    public string Artist { get; set; } = string.Empty;

    [MaxLength(255)]
    public string? Album { get; set; }

    [MaxLength(100)]
    public string? Genre { get; set; }

    [MaxLength(10)]
    public string? Language { get; set; } = "en";

    public int? Year { get; set; }

    // ── Source provenance ─────────────────────────────────────────────────
    public KaraokeTrackSource SourceType { get; set; } = KaraokeTrackSource.System;

    [MaxLength(255)]
    public string? SourceId { get; set; }       // external ID from the source system

    [MaxLength(2048)]
    public string? SourceUrl { get; set; }      // canonical URL at origin

    // ── Licensing ─────────────────────────────────────────────────────────
    [MaxLength(128)]
    public string License { get; set; } = "Public Domain";

    [MaxLength(512)]
    public string? LicenseUrl { get; set; }

    [MaxLength(512)]
    public string? AttributionText { get; set; }

    // ── Blob storage keys (object keys inside the DO Spaces bucket) ───────
    // Store object keys (not full URLs) so the serving layer can build CDN
    // URLs or presigned URLs at request time via IBlobStorageService.
    [MaxLength(512)]
    public string? InstrumentalBlobKey { get; set; }   // …/instrumental.wav

    [MaxLength(512)]
    public string? VocalsBlobKey { get; set; }          // …/vocals.wav

    [MaxLength(512)]
    public string? LrcBlobKey { get; set; }              // …/song.lrc

    [MaxLength(512)]
    public string? CoverImageBlobKey { get; set; }      // …/cover.jpg

    // Cached public CDN URLs (denormalised from blob keys for fast reads)
    [MaxLength(2048)]
    public string? InstrumentalUrl { get; set; }

    [MaxLength(2048)]
    public string? LrcUrl { get; set; }

    [MaxLength(2048)]
    public string? CoverImageUrl { get; set; }

    // ── Lyrics (cached inline so the player can display without a blob call) ─
    public string? LrcContent { get; set; }     // LRC-format timed lyrics
    public string? PlainLyrics { get; set; }    // plain-text fallback

    // ── Audio metadata ────────────────────────────────────────────────────
    public int? DurationSeconds { get; set; }
    public int? Bpm { get; set; }

    [MaxLength(16)]
    public string? MusicalKey { get; set; }

    // ── Status / availability ─────────────────────────────────────────────
    public KaraokeTrackStatus Status { get; set; } = KaraokeTrackStatus.Pending;
    public bool IsPublic { get; set; } = true;
    public bool HasInstrumental { get; set; }
    public bool HasLrc { get; set; }

    // ── Statistics ────────────────────────────────────────────────────────
    public int PlayCount { get; set; }
    public float? Rating { get; set; }
    public int RatingCount { get; set; }

    // ── Uploader (null = system-seeded) ───────────────────────────────────
    public Guid? UploadedByUserId { get; set; }
    public virtual User? UploadedByUser { get; set; }
}

public enum KaraokeTrackSource
{
    UserUploaded = 0,
    LrcLib = 1,
    UltraStarWorld = 2,
    FreeMusicArchive = 3,
    InternetArchive = 4,
    Jamendo = 5,
    CcMixter = 6,
    OpenKaraoke = 7,
    System = 99
}

public enum KaraokeTrackStatus
{
    Pending = 0,       // awaiting processing by python-karaoke engine
    Processing = 1,    // karaoke job in progress
    Ready = 2,         // instrumental + LRC available
    Failed = 3,        // processing failed; can be retried
    Removed = 4        // soft-removed from public catalogue
}

/// <summary>
/// Per-user play history and ratings for a karaoke track.
/// </summary>
public class KaraokeTrackPlay : BaseEntity
{
    public Guid TrackId { get; set; }
    public Guid UserId { get; set; }

    public DateTime PlayedAt { get; set; } = DateTime.UtcNow;
    public int? DurationPlayedSeconds { get; set; }

    /// <summary>Optional 1–5 star rating left after the session.</summary>
    public int? Stars { get; set; }

    public virtual KaraokeTrack Track { get; set; } = null!;
    public virtual User User { get; set; } = null!;
}
