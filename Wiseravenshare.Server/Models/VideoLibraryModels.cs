namespace Wiseravenshare.Server.Models;

public sealed class VideoLibraryVideo
{
    public string Id { get; set; } = string.Empty;
    public string UserId { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public List<string> Tags { get; set; } = [];
    public string VideoUrl { get; set; } = string.Empty;
    public string ThumbnailUrl { get; set; } = string.Empty;
    public string Status { get; set; } = "published";
    public string PrivacyStatus { get; set; } = "unlisted";
    public string? YouTubeUrl { get; set; }
    public string? TikTokUrl { get; set; }
    public string? FacebookUrl { get; set; }
    public int Views { get; set; }
    public int Likes { get; set; }
    public int Comments { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public sealed class CreateVideoLibraryEntryRequest
{
    public string UserId { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public IReadOnlyList<string>? Tags { get; set; }
    public string VideoUrl { get; set; } = string.Empty;
    public string ThumbnailUrl { get; set; } = string.Empty;
    public string Status { get; set; } = "published";
    public string PrivacyStatus { get; set; } = "unlisted";
    public string? YouTubeUrl { get; set; }
    public string? TikTokUrl { get; set; }
    public string? FacebookUrl { get; set; }
}

public sealed class UpdateVideoLibraryEntryRequest
{
    public string? Title { get; set; }
    public string? Description { get; set; }
    public IReadOnlyList<string>? Tags { get; set; }
}

public sealed class VideoLibraryComment
{
    public string Id { get; set; } = string.Empty;
    public string VideoId { get; set; } = string.Empty;
    public string UserId { get; set; } = string.Empty;
    public string Comment { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}
