// Wiseravenshare.Server/Entities/Video.cs
using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using Wiseravenshare.Server.Entities;

namespace Wiseravenshare.Server.Entities
{
    public class Video : BaseEntity
    {
        public Guid UserId { get; set; }

        [MaxLength(255)]
        public string Title { get; set; } = string.Empty;

        [MaxLength(2000)]
        public string? Description { get; set; }

        [MaxLength(500)]
        public string VideoUrl { get; set; } = string.Empty;

        [MaxLength(500)]
        public string? ThumbnailUrl { get; set; }

        public int? Duration { get; set; } // in seconds

        [MaxLength(50)]
        public string? YoutubeVideoId { get; set; }

        [MaxLength(500)]
        public string? YoutubeUrl { get; set; }

        public VideoPublishStatus YoutubePublishStatus { get; set; } = VideoPublishStatus.Pending;
        public string? YoutubePublishError { get; set; }
        public JsonDocument? YoutubeMetadata { get; set; }

        public int ViewsCount { get; set; }
        public int LikesCount { get; set; }
        public int CommentsCount { get; set; }
        public int SharesCount { get; set; }

        public string[]? Tags { get; set; }
        public PrivacyStatus Privacy { get; set; } = PrivacyStatus.Unlisted;
        public VideoStatus Status { get; set; } = VideoStatus.Processing;
        public DateTime? PublishedAt { get; set; }
        public DateTime? DeletedAt { get; set; }

        // Navigation Properties
        public virtual User User { get; set; } = null!;
        public virtual ICollection<VideoLike> Likes { get; set; } = new List<VideoLike>();
        public virtual ICollection<VideoComment> Comments { get; set; } = new List<VideoComment>();
    }

    public enum VideoPublishStatus
    {
        Pending,
        Processing,
        Published,
        Failed,
        Scheduled
    }

    public enum PrivacyStatus
    {
        Public,
        Unlisted,
        Private
    }

    public enum VideoStatus
    {
        Processing,
        Ready,
        Failed,
        Deleted
    }

    public class VideoLike : BaseEntity
    {
        public Guid VideoId { get; set; }
        public Guid UserId { get; set; }

        // Navigation Properties
        public virtual Video Video { get; set; } = null!;
        public virtual User User { get; set; } = null!;
    }

    public class VideoComment : BaseEntity
    {
        public Guid VideoId { get; set; }
        public Guid UserId { get; set; }
        public Guid? ParentCommentId { get; set; }

        [MaxLength(500)]
        public string Content { get; set; } = string.Empty;

        public int LikesCount { get; set; }
        public bool IsDeleted { get; set; }

        // Navigation Properties
        public virtual Video Video { get; set; } = null!;
        public virtual User User { get; set; } = null!;
        public virtual VideoComment? ParentComment { get; set; }
        public virtual ICollection<VideoComment> Replies { get; set; } = new List<VideoComment>();
    }
}