// Wiseravenshare.Server/Entities/Post.cs
using System.Text.Json;
using System.Xml.Linq;

namespace Wiseravenshare.Server.Entities
{

    public class Post : BaseEntity
    {
        public Guid UserId { get; set; }
        public string Content { get; set; } = string.Empty;
        public PostType Type { get; set; } = PostType.Text;
        public string[]? MediaUrls { get; set; }
        public JsonDocument? MediaMetadata { get; set; }
        public decimal? TruthScore { get; set; }
        public string? TruthCorrection { get; set; }
        public JsonDocument? TruthSources { get; set; }
        public string? LocationName { get; set; }
        public decimal? Latitude { get; set; }
        public decimal? Longitude { get; set; }
        public bool IsSensitive { get; set; }
        public bool IsPinned { get; set; }
        public bool IsDeleted { get; set; }
        public Guid? ReplyToId { get; set; }
        public Guid? RepostOfId { get; set; }
        public Guid? QuoteOfId { get; set; }
        public int LikesCount { get; set; }
        public int RepostsCount { get; set; }
        public int CommentsCount { get; set; }
        public int SharesCount { get; set; }
        public int BookmarksCount { get; set; }
        public int ViewsCount { get; set; }

        // Navigation Properties
        public virtual User User { get; set; } = null!;
        public virtual Post? ReplyTo { get; set; }
        public virtual Post? RepostOf { get; set; }
        public virtual Post? QuoteOf { get; set; }
        public virtual ICollection<Comment> Comments { get; set; } = new List<Comment>();
        public virtual ICollection<PostLike> Likes { get; set; } = new List<PostLike>();
        public virtual ICollection<PostRepost> Reposts { get; set; } = new List<PostRepost>();
    }

    public enum PostType
    {
        Text,
        Image,
        Video,
        Audio,
        Podcast,
        TruthClaim
    }
}