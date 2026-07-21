// Wiseravenshare.Server/DTOs/Post/PostDto.cs
using System.ComponentModel.DataAnnotations;

namespace Wiseravenshare.Server.DTOs.Post
{

    public class PostDto
    {
        public Guid Id { get; set; }
        public Guid UserId { get; set; }
        public string Content { get; set; } = string.Empty;
        public string Type { get; set; } = "Text";
        public string[]? MediaUrls { get; set; }
        public decimal? TruthScore { get; set; }
        public string? TruthCorrection { get; set; }
        public string? LocationName { get; set; }
        public double? Latitude { get; set; }
        public double? Longitude { get; set; }
        public bool IsSensitive { get; set; }
        public bool IsPinned { get; set; }
        public int LikesCount { get; set; }
        public int RepostsCount { get; set; }
        public int CommentsCount { get; set; }
        public int SharesCount { get; set; }
        public int BookmarksCount { get; set; }
        public int ViewsCount { get; set; }
        public DateTime CreatedAt { get; set; }
        public UserDto User { get; set; } = null!;
        public PostDto? ReplyTo { get; set; }
        public PostDto? RepostOf { get; set; }
        public PostDto? QuoteOf { get; set; }
        public bool IsLiked { get; set; }
        public bool IsReposted { get; set; }
        public bool IsBookmarked { get; set; }
    }

    public class CreatePostDto
    {
        [Required]
        [MaxLength(1000)]
        public string Content { get; set; } = string.Empty;

        public string? MediaUrls { get; set; }
        public string Type { get; set; } = "Text";
        public Guid? ReplyToId { get; set; }
        public Guid? RepostOfId { get; set; }
        public Guid? QuoteOfId { get; set; }
        public string? LocationName { get; set; }
        public double? Latitude { get; set; }
        public double? Longitude { get; set; }
        public bool IsSensitive { get; set; }
    }

    public class UpdatePostDto
    {
        [MaxLength(1000)]
        public string? Content { get; set; }

        public bool? IsSensitive { get; set; }
    }
}