namespace Wiseravenshare.Server.DTOs.Social;

public class SocialFeedItemDto
{
    public string Platform { get; set; } = string.Empty;
    public string ExternalId { get; set; } = string.Empty;
    public string? Text { get; set; }
    public string? MediaUrl { get; set; }
    public string? PermalinkUrl { get; set; }
    public string? AuthorHandle { get; set; }
    public DateTimeOffset? CreatedAt { get; set; }
}

public class PublishSocialContentRequest
{
    [MaxLength(4000)]
    public string Message { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? LinkUrl { get; set; }

    [MaxLength(500)]
    public string? VideoUrl { get; set; }

    public bool PublishToFacebook { get; set; } = true;
    public bool PublishToTikTok { get; set; } = true;
}

public class SocialPublishResultDto
{
    public string Platform { get; set; } = string.Empty;
    public bool Success { get; set; }
    public string? ExternalPostId { get; set; }
    public string? ExternalPostUrl { get; set; }
    public string? Error { get; set; }
}

public class PublishSocialContentResponse
{
    public DateTimeOffset RequestedAt { get; set; } = DateTimeOffset.UtcNow;
    public List<SocialPublishResultDto> Results { get; set; } = [];
}
