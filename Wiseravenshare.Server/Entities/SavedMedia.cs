// Wiseravenshare.Server/Entities/SavedMedia.cs
using System.Text.Json;

namespace Wiseravenshare.Server.Entities
{
    /// <summary>
    /// Represents media (photos, videos, music) saved by users to their personal library.
    /// Media can be hidden from the public feed while remaining accessible in the user's library.
    /// </summary>
    public class SavedMedia : BaseEntity
    {
        /// <summary>
        /// The user who saved this media
        /// </summary>
        public Guid UserId { get; set; }

        /// <summary>
        /// The original post ID if this media was saved from an existing post
        /// </summary>
        public Guid? SourcePostId { get; set; }

        /// <summary>
        /// Title or name of the media
        /// </summary>
        public string Title { get; set; } = string.Empty;

        /// <summary>
        /// Description of the media
        /// </summary>
        public string? Description { get; set; }

        /// <summary>
        /// Type of media: Photo, Video, Music, or Audio
        /// </summary>
        public MediaLibraryType MediaType { get; set; }

        /// <summary>
        /// URL or URI to the media asset
        /// </summary>
        public string MediaUrl { get; set; } = string.Empty;

        /// <summary>
        /// Additional metadata about the media (dimensions, duration, format, etc.)
        /// </summary>
        public JsonDocument? MediaMetadata { get; set; }

        /// <summary>
        /// Thumbnail URL for visual preview
        /// </summary>
        public string? ThumbnailUrl { get; set; }

        /// <summary>
        /// Whether this media is visible in the user's feed. When false, it's only accessible via the media library.
        /// </summary>
        public bool IsVisibleInFeed { get; set; } = false;

        /// <summary>
        /// Whether this media is published as a post. When false, it's just in the library.
        /// </summary>
        public bool IsPublished { get; set; } = false;

        /// <summary>
        /// ID of the published post if IsPublished is true
        /// </summary>
        public Guid? PublishedPostId { get; set; }

        /// <summary>
        /// Collection tags for organizing media (e.g., "favorites", "drafts", "podcast", "tutorial")
        /// </summary>
        public string[]? Tags { get; set; }

        /// <summary>
        /// Date when media is scheduled to be automatically published (null if not scheduled)
        /// </summary>
        public DateTime? ScheduledPublishAt { get; set; }

        /// <summary>
        /// File size in bytes
        /// </summary>
        public long? FileSizeBytes { get; set; }

        /// <summary>
        /// Duration in seconds (for video and audio)
        /// </summary>
        public decimal? DurationSeconds { get; set; }

        // Navigation Properties
        public virtual User User { get; set; } = null!;
        public virtual Post? SourcePost { get; set; }
        public virtual Post? PublishedPost { get; set; }
    }

    /// <summary>
    /// Enumeration for types of media that can be saved to the library
    /// </summary>
    public enum MediaLibraryType
    {
        Photo,
        Video,
        Music,
        Audio,
        Podcast,
        Document
    }
}
