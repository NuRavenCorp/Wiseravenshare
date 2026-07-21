namespace Wiseravenshare.Server.Models;

public sealed class UserRecord
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Handle { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string Bio { get; set; } = string.Empty;
    public string Location { get; set; } = string.Empty;
    public string Website { get; set; } = string.Empty;
    public string Avatar { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
    public SocialFeedSettings SocialFeeds { get; set; } = new();
}

public sealed class SocialFeedSettings
{
    public SocialFeedConnection TikTok { get; set; } = new();
    public SocialFeedConnection Facebook { get; set; } = new();
}

public sealed class SocialFeedConnection
{
    public bool Enabled { get; set; }
    public string Username { get; set; } = string.Empty;
    public string ProfileUrl { get; set; } = string.Empty;
    public string FeedUrl { get; set; } = string.Empty;
}

public sealed class UserResponse
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Handle { get; set; } = string.Empty;
    public string Bio { get; set; } = string.Empty;
    public string Location { get; set; } = string.Empty;
    public string Website { get; set; } = string.Empty;
    public string Avatar { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public SocialFeedSettings SocialFeeds { get; set; } = new();
}

public sealed class UpdateUserProfileRequest
{
    public string? Name { get; set; }
    public string? Bio { get; set; }
    public string? Location { get; set; }
    public string? Website { get; set; }
    public string? Avatar { get; set; }
    public SocialFeedSettings? SocialFeeds { get; set; }
}

public sealed class UpdateSocialFeedsRequest
{
    public SocialFeedConnection? TikTok { get; set; }
    public SocialFeedConnection? Facebook { get; set; }
}
