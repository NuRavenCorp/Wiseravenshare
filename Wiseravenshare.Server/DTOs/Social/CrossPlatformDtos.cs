// Wiseravenshare.Server/DTOs/Social/CrossPlatformDtos.cs
using System.ComponentModel.DataAnnotations;

namespace Wiseravenshare.Server.DTOs.Social;

/// <summary>Normalized platform keys supported by the cross-platform publisher.</summary>
public static class SocialPlatforms
{
    public const string Facebook = "facebook";
    public const string Instagram = "instagram";
    public const string YouTube = "youtube";
    public const string TikTok = "tiktok";
    public const string Twitter = "twitter";
    public const string LinkedIn = "linkedin";

    public static readonly IReadOnlyList<string> All =
    [
        Facebook, Instagram, YouTube, TikTok, Twitter, LinkedIn
    ];

    public static bool IsValid(string platform) =>
        All.Contains((platform ?? string.Empty).Trim().ToLowerInvariant());
}

/// <summary>A single cross-platform publish request targeting any combination of platforms.</summary>
public class CrossPlatformPublishRequest
{
    [Required]
    public Guid PostId { get; set; }

    [Required]
    [MaxLength(5000)]
    public string Message { get; set; } = string.Empty;

    /// <summary>Publicly reachable media URL (video or photo) when sharing media.</summary>
    [MaxLength(2048)]
    public string? MediaUrl { get; set; }

    /// <summary>auto | text | photo | video</summary>
    [MaxLength(20)]
    public string MediaType { get; set; } = SocialMediaType.Auto;

    /// <summary>Platforms to publish to. Empty/omitted means all configured platforms.</summary>
    public List<string>? Platforms { get; set; }
}

/// <summary>Result of publishing to one platform.</summary>
public class CrossPlatformPublishResultDto
{
    public string Platform { get; set; } = string.Empty;
    public bool Success { get; set; }
    public bool Skipped { get; set; }
    public string? SkipReason { get; set; }
    public string? ExternalPostId { get; set; }
    public string? ExternalPostUrl { get; set; }
    public string? Error { get; set; }
}

public class CrossPlatformPublishResponse
{
    public Guid PostId { get; set; }
    public DateTimeOffset RequestedAt { get; set; } = DateTimeOffset.UtcNow;
    public List<CrossPlatformPublishResultDto> Results { get; set; } = [];
}

/// <summary>Status of a post's cross-platform distribution.</summary>
public class CrossPostStatusDto
{
    public Guid PostId { get; set; }
    public List<SocialCrossPostDto> Platforms { get; set; } = [];
}

public class SocialCrossPostDto
{
    public Guid Id { get; set; }
    public string Platform { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string? ExternalPostId { get; set; }
    public string? ExternalPostUrl { get; set; }
    public string? ErrorMessage { get; set; }
    public DateTimeOffset? PublishedAt { get; set; }
}
