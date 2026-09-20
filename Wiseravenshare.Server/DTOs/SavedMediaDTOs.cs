// Wiseravenshare.Server/DTOs/SavedMediaDTOs.cs
using Wiseravenshare.Server.Entities;
using System.Text.Json;

namespace Wiseravenshare.Server.DTOs
{
    /// <summary>
    /// Request DTO for creating a new saved media entry
    /// </summary>
    public class CreateSavedMediaRequest
    {
        public string Title { get; set; } = string.Empty;
        public string? Description { get; set; }
        public MediaLibraryType MediaType { get; set; }
        public string MediaUrl { get; set; } = string.Empty;
        public string? ThumbnailUrl { get; set; }
        public JsonDocument? MediaMetadata { get; set; }
        public bool IsVisibleInFeed { get; set; } = false;
        public string[]? Tags { get; set; }
        public long? FileSizeBytes { get; set; }
        public decimal? DurationSeconds { get; set; }
        public DateTime? ScheduledPublishAt { get; set; }
        public Guid? SourcePostId { get; set; }
    }

    /// <summary>
    /// Request DTO for updating a saved media entry
    /// </summary>
    public class UpdateSavedMediaRequest
    {
        public string? Title { get; set; }
        public string? Description { get; set; }
        public string? ThumbnailUrl { get; set; }
        public bool? IsVisibleInFeed { get; set; }
        public string[]? Tags { get; set; }
        public DateTime? ScheduledPublishAt { get; set; }
    }

    /// <summary>
    /// Request DTO for bulk toggling visibility
    /// </summary>
    public class BulkToggleVisibilityRequest
    {
        public Guid[] MediaIds { get; set; } = Array.Empty<Guid>();
        public bool IsVisibleInFeed { get; set; }
    }

    /// <summary>
    /// Response DTO for saved media
    /// </summary>
    public class SavedMediaResponse
    {
        public Guid Id { get; set; }
        public Guid UserId { get; set; }
        public Guid? SourcePostId { get; set; }
        public string Title { get; set; } = string.Empty;
        public string? Description { get; set; }
        public MediaLibraryType MediaType { get; set; }
        public string MediaUrl { get; set; } = string.Empty;
        public string? ThumbnailUrl { get; set; }
        public JsonDocument? MediaMetadata { get; set; }
        public bool IsVisibleInFeed { get; set; }
        public bool IsPublished { get; set; }
        public Guid? PublishedPostId { get; set; }
        public string[]? Tags { get; set; }
        public DateTime? ScheduledPublishAt { get; set; }
        public long? FileSizeBytes { get; set; }
        public decimal? DurationSeconds { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
    }

    /// <summary>
    /// Response DTO for media library (with pagination support)
    /// </summary>
    public class MediaLibraryResponse
    {
        public List<SavedMediaResponse> Items { get; set; } = new();
        public int TotalCount { get; set; }
        public int PageNumber { get; set; }
        public int PageSize { get; set; }
    }

    /// <summary>
    /// Quick action DTO for toggling visibility
    /// </summary>
    public class ToggleVisibilityRequest
    {
        public Guid MediaId { get; set; }
        public bool IsVisibleInFeed { get; set; }
    }

    /// <summary>
    /// Response for media library statistics
    /// </summary>
    public class MediaLibraryStatsResponse
    {
        public int TotalItems { get; set; }
        public int PhotoCount { get; set; }
        public int VideoCount { get; set; }
        public int MusicCount { get; set; }
        public int AudioCount { get; set; }
        public int PodcastCount { get; set; }
        public int VisibleItemsCount { get; set; }
        public int HiddenItemsCount { get; set; }
        public int PublishedCount { get; set; }
        public int ScheduledCount { get; set; }
        public long TotalSizeBytes { get; set; }
    }

    /// <summary>
    /// Request to publish media from library as a post
    /// </summary>
    public class PublishMediaRequest
    {
        public Guid MediaId { get; set; }
        public string? PostContent { get; set; }
        public string? LocationName { get; set; }
        public decimal? Latitude { get; set; }
        public decimal? Longitude { get; set; }
        public bool IsSensitive { get; set; }
    }
}
