using System.Collections.Generic;

namespace WiseRavenShare.server.Dtos.Social.Twitter
{
    public class TwitterDto
    {
        public string Id { get; set; }
        public string Username { get; set; }
        public string Name { get; set; }
        public string ProfileImageUrl { get; set; }
        public bool Verified { get; set; }
        public int FollowersCount { get; set; }
        public int FollowingCount { get; set; }
        public bool Protected { get; set; }
        public List<string> PublicKeywords { get; set; }

        // Optional: media upload
        public MediaDto Media { get; set; }
    }

    public class MediaDto
    {
        public string Type { get; set; } // e.g., "photo"
        public string MediaId { get; set; }
        public string MediaIdStr { get; set; }
        public string MediaUrl { get; set; }
        public string MediaUrlHttps { get; set; }
        public string MediaUrlLarge { get; set; }
        public string MediaUrlSmall { get; set; }
        public string MediaUrlStd { get; set; }
        public SizesDto Sizes { get; set; }
    }

    public class SizesDto
    {
        public LargeSizesDto Large { get; set; }
        public SmallSizesDto Small { get; set; }
        public StandardSizesDto Standard { get; set; }
        public ThumbSizesDto Thumb { get; set; }
    }

    public class LargeSizesDto
    {
        public string File { get; set; }
        public int Height { get; set; }
        public int Width { get; set; }
    }

    public class SmallSizesDto
    {
        public string File { get; set; }
        public int Height { get; set; }
        public int Width { get; set; }
    }

    public class StandardSizesDto
    {
        public string File { get; set; }
        public int Height { get; set; }
        public int Width { get; set; }
    }

    public class ThumbSizesDto
    {
        public string File { get; set; }
        public int Height { get; set; }
        public int Width { get; set; }
    }
}



