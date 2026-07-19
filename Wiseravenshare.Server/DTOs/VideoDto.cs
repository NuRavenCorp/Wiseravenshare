// Wiseravenshare.Server/DTOs/Video/VideoDto.cs
using System.ComponentModel.DataAnnotations;
using Wiseravenshare.Server.DTOs.User;

namespace Wiseravenshare.Server.DTOs.Video
{

    public class VideoDto
    {
        public Guid Id { get; set; }
        public Guid UserId { get; set; }
        public string Title { get; set; } = string.Empty;
        public string? Description { get; set; }
        public string VideoUrl { get; set; } = string.Empty;
        public string? ThumbnailUrl { get; set; }
        public int? Duration { get; set; }
        public string? YoutubeVideoId { get; set; }
        public string? YoutubeUrl { get; set; }
        public string YoutubePublishStatus { get; set; } = "Pending";
        public string Privacy { get; set; } = "Unlisted";
        public string Status { get; set; } = "Processing";
        public int ViewsCount { get; set; }
        public int LikesCount { get; set; }
        public int CommentsCount { get; set; }
        public int SharesCount { get; set; }
        public string[]? Tags { get; set; }
        public DateTime? PublishedAt { get; set; }
        public DateTime CreatedAt { get; set; }
        public UserDto User { get; set; } = null!;
        public bool IsLiked { get; set; }
    }

    public class UploadVideoDto
    {
        [Required]
        public IFormFile Video { get; set; } = null!;

        [Required]
        [MaxLength(255)]
        public string Title { get; set; } = string.Empty;

        [MaxLength(2000)]
        public string? Description { get; set; }

        public string[]? Tags { get; set; }
        public string Privacy { get; set; } = "Unlisted";
        public bool PublishToYoutube { get; set; }
        public string? YoutubePrivacyStatus { get; set; } = "unlisted";
        public DateTime? ScheduledPublishAt { get; set; }
    }

    public class UpdateVideoDto
    {
        [MaxLength(255)]
        public string? Title { get; set; }

        [MaxLength(2000)]
        public string? Description { get; set; }

        public string[]? Tags { get; set; }
        public string? Privacy { get; set; }
    }

    public class VideoAnalyticsDto
    {
        public Guid VideoId { get; set; }
        public int Views { get; set; }
        public int Likes { get; set; }
        public int Shares { get; set; }
        public int Comments { get; set; }
    }
}