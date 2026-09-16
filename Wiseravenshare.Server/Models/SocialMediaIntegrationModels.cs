using System;
using System.Collections.Generic;

namespace Wiseravenshare.Server.Models
{
    public enum MediaType
    {
        None,
        Image,
        Video,
        Carousel,
        Link,
        Other
    }

    public class MediaItem
    {
        public string Url { get; set; } = string.Empty;
        public MediaType Type { get; set; } = MediaType.None;
        public string? MimeType { get; set; }
        public int? Width { get; set; }
        public int? Height { get; set; }
    }

    public abstract class SocialPost
    {
        public string Id { get; set; } = string.Empty;
        public string AuthorId { get; set; } = string.Empty;
        public string? AuthorName { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public string? Content { get; set; }
        public List<MediaItem> Media { get; set; } = new List<MediaItem>();
        public long? LikeCount { get; set; }
        public long? CommentCount { get; set; }
        public long? ShareCount { get; set; }
        public Uri? SourceUrl { get; set; }
        // Generic metrics bag for provider-specific metrics
        public Dictionary<string, long>? Metrics { get; set; }
    }

    public class FacebookPost : SocialPost
    {
        // e.g. reaction -> count (LIKE, LOVE, WOW, SAD, ANGRY, etc.)
        public Dictionary<string, long> ReactionsBreakdown { get; set; } = new Dictionary<string, long>();
        public string? Privacy { get; set; } // e.g. "Public", "Friends"
        public string? Permalink { get; set; }
        public bool IsShared { get; set; }
        public bool IsSponsored { get; set; }
        public string? PageId { get; set; } // if posted by a page
    }

    public class InstagramPost : SocialPost
    {
        public bool IsVideo { get; set; }
        public bool IsCarousel { get; set; }
        public string? Location { get; set; }
        public List<string> Hashtags { get; set; } = new List<string>();
        public bool IsSponsored { get; set; }
        public long? ViewCount { get; set; } // for videos/reels
        public string? Shortcode { get; set; } // Instagram's post short id
    }

    public class TikTokPost : SocialPost
    {
        public TimeSpan? Duration { get; set; }
        public string? Music { get; set; } // song or sound used
        public bool IsDuetAllowed { get; set; }
        public bool IsStitchAllowed { get; set; }
        public long? ViewCount { get; set; }
        public long? HeartCount { get; set; } // likes on TikTok
        public long? ShareCountDetailed { get; set; } // optional separate share metric
    }

    public class RedditPost : SocialPost
    {
        public string Subreddit { get; set; } = string.Empty;
        public string? SubredditId { get; set; }
        public long? Score { get; set; }
        public long? Upvotes { get; set; }
        public long? Downvotes { get; set; }
        public bool IsNSFW { get; set; }
        public bool IsSpoiler { get; set; }
        public string? PostType { get; set; } // e.g. "link", "self", "image", "video"
        public List<string> Awards { get; set; } = new List<string>();
        public string? Permalink { get; set; }
    }

    public class YouTubeVideo : SocialPost
    {
        public string VideoId { get; set; } = string.Empty;
        public string? ChannelId { get; set; }
        public string? Title { get; set; }
        public TimeSpan? Duration { get; set; }
        public long? ViewCount { get; set; }
        public long? LikeCount { get; set; }
        public long? DislikeCount { get; set; } // may be deprecated but kept for compatibility
        public long? CommentCountDetailed { get; set; }
        public List<string> Tags { get; set; } = new List<string>();
        public Uri? ThumbnailUrl { get; set; }
        public bool IsLive { get; set; }
        public bool IsShort { get; set; } // YouTube Shorts specific flag
    }
}

