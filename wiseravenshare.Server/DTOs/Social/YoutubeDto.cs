using System.Collections.Generic;

namespace WiseRavenShare.server.Dtos.Social.YouTube
{
    public class YouTubeDto
    {
        public string Id { get; set; }
        public string Title { get; set; }
        public string Description { get; set; }
        public string PublishedAt { get; set; }
        public ThumbnailsDto Thumbnails { get; set; }
        public int Views { get; set; }
        public int LikeCount { get; set; }
        public int DislikeCount { get; set; }
        public int CommentCount { get; set; }
        public string CategoryId { get; set; }
        public string License { get; set; }
    }

    public class ThumbnailsDto
    {
        public DefaultThumbnailDto Default { get; set; }
        public MediumThumbnailDto Medium { get; set; }
        public HighThumbnailDto High { get; set; }
        public MaxresDefaultThumbnailDto Maxresdefault { get; set; }
    }

    public class DefaultThumbnailDto
    {
        public string Url { get; set; }
        public int Width { get; set; }
        public int Height { get; set; }
    }

    public class MediumThumbnailDto
    {
        public string Url { get; set; }
        public int Width { get; set; }
        public int Height { get; set; }
    }

    public class HighThumbnailDto
    {
        public string Url { get; set; }
        public int Width { get; set; }
        public int Height { get; set; }
    }

    public class MaxresDefaultThumbnailDto
    {
        public string Url { get; set; }
        public int Width { get; set; }
        public int Height { get; set; }
    }

    public class ContentDetailsDto
    {
        public string Duration { get; set; }
        public int Length { get; set; }
        public int Width { get; set; }
        public int Height { get; set; }
    }

    public class PlayerDto
    {
        public string Id { get; set; }
        public string Name { get; set; }
        public SnippetDto Snippet { get; set; }
    }

    public class SnippetDto
    {
        public string Title { get; set; }
        public string Description { get; set; }
        public ThumbnailsDto Thumbnails { get; set; }
    }
}