using System.ComponentModel.DataAnnotations;
using System.Text.Json;

namespace Wiseravenshare.Server.Entities;

public class MediaItem : BaseEntity
{
    [MaxLength(255)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(2000)]
    public string? Description { get; set; }

    public MediaType MediaType { get; set; }
    public MediaStatus Status { get; set; } = MediaStatus.Processing;

    [MaxLength(255)]
    public string FileName { get; set; } = string.Empty;

    [MaxLength(2048)]
    public string FilePath { get; set; } = string.Empty;

    [MaxLength(2048)]
    public string FileUrl { get; set; } = string.Empty;

    [MaxLength(255)]
    public string MimeType { get; set; } = "application/octet-stream";

    public long FileSize { get; set; }

    public int? Width { get; set; }
    public int? Height { get; set; }
    public int? Duration { get; set; }

    [MaxLength(2048)]
    public string? ThumbnailPath { get; set; }

    [MaxLength(2048)]
    public string? ThumbnailUrl { get; set; }

    [MaxLength(2048)]
    public string? PreviewPath { get; set; }

    [MaxLength(2048)]
    public string? PreviewUrl { get; set; }

    public JsonDocument? Metadata { get; set; }

    public Guid UserId { get; set; }
    public MediaVisibility Visibility { get; set; } = MediaVisibility.Private;

    public int Views { get; set; }
    public int Downloads { get; set; }
    public int Plays { get; set; }

    public virtual User User { get; set; } = null!;
    public virtual ICollection<MediaItemTag> Tags { get; set; } = new List<MediaItemTag>();
    public virtual ICollection<MediaComment> Comments { get; set; } = new List<MediaComment>();
    public virtual ICollection<MediaPlaylistItem> PlaylistItems { get; set; } = new List<MediaPlaylistItem>();
}

public class MediaTag : BaseEntity
{
    [MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Description { get; set; }

    public TagType Type { get; set; } = TagType.User;
    public int UsageCount { get; set; }

    public virtual ICollection<MediaItemTag> MediaItems { get; set; } = new List<MediaItemTag>();
}

public class MediaItemTag : BaseEntity
{
    public Guid MediaId { get; set; }
    public Guid TagId { get; set; }

    public virtual MediaItem MediaItem { get; set; } = null!;
    public virtual MediaTag MediaTag { get; set; } = null!;
}

public class MediaComment : BaseEntity
{
    public Guid MediaId { get; set; }
    public Guid UserId { get; set; }
    public Guid? ParentCommentId { get; set; }

    [MaxLength(2000)]
    public string Content { get; set; } = string.Empty;

    public int LikesCount { get; set; }
    public int RepliesCount { get; set; }
    public bool IsSoftDeleted { get; set; }
    public int? TimestampSeconds { get; set; }

    public virtual MediaItem MediaItem { get; set; } = null!;
    public virtual User User { get; set; } = null!;
    public virtual MediaComment? ParentComment { get; set; }
    public virtual ICollection<MediaComment> Replies { get; set; } = new List<MediaComment>();
}

public class MediaPlaylist : BaseEntity
{
    [MaxLength(255)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Description { get; set; }

    public Guid UserId { get; set; }
    public PlaylistType Type { get; set; } = PlaylistType.Custom;
    public PlaylistVisibility Visibility { get; set; } = PlaylistVisibility.Private;

    [MaxLength(2048)]
    public string? CoverImageUrl { get; set; }

    public int ItemCount { get; set; }
    public int Plays { get; set; }

    public virtual User User { get; set; } = null!;
    public virtual ICollection<MediaPlaylistItem> Items { get; set; } = new List<MediaPlaylistItem>();
}

public class MediaPlaylistItem : BaseEntity
{
    public Guid PlaylistId { get; set; }
    public Guid MediaId { get; set; }
    public int OrderIndex { get; set; }
    public DateTime AddedAt { get; set; } = DateTime.UtcNow;

    public virtual MediaPlaylist Playlist { get; set; } = null!;
    public virtual MediaItem MediaItem { get; set; } = null!;
}

public class MediaViewHistory : BaseEntity
{
    public Guid MediaId { get; set; }
    public Guid UserId { get; set; }
    public DateTime ViewedAt { get; set; } = DateTime.UtcNow;
    public int? PositionSeconds { get; set; }
    public int? ViewDuration { get; set; }

    [MaxLength(256)]
    public string? DeviceInfo { get; set; }

    [MaxLength(80)]
    public string? IPAddress { get; set; }

    public virtual MediaItem MediaItem { get; set; } = null!;
    public virtual User User { get; set; } = null!;
}

public class MediaLike : BaseEntity
{
    public Guid MediaId { get; set; }
    public Guid UserId { get; set; }

    public virtual MediaItem MediaItem { get; set; } = null!;
    public virtual User User { get; set; } = null!;
}

public class MediaBookmark : BaseEntity
{
    public Guid MediaId { get; set; }
    public Guid UserId { get; set; }

    public virtual MediaItem MediaItem { get; set; } = null!;
    public virtual User User { get; set; } = null!;
}

public enum MediaType
{
    Photo,
    Video,
    Music,
    Document,
    Other
}

public enum MediaStatus
{
    Processing,
    Ready,
    Failed,
    Deleted
}

public enum MediaVisibility
{
    Private,
    Public,
    Unlisted,
    Shared
}

public enum TagType
{
    User,
    System,
    AI
}

public enum PlaylistType
{
    Custom,
    Favorites,
    WatchLater,
    Recent,
    AutoGenerated
}

public enum PlaylistVisibility
{
    Private,
    Public,
    Unlisted
}
