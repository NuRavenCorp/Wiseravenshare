using System.ComponentModel.DataAnnotations;

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

    /// <summary>
    /// Optional publicly reachable photo/image URL to attach when the share is a photo post.
    /// </summary>
    [MaxLength(500)]
    public string? PhotoUrl { get; set; }

    /// <summary>
    /// Optional hint describing the shared media. Defaults to "auto" which infers the type from the URLs.
    /// Supported values: auto, text, photo, video.
    /// </summary>
    [MaxLength(20)]
    public string MediaType { get; set; } = "auto";

    public bool PublishToFacebook { get; set; } = true;
    public bool PublishToTikTok { get; set; } = true;
    public bool PublishToYouTube { get; set; } = false;
}

public class SocialPublishResultDto
{
    public string Platform { get; set; } = string.Empty;
    public bool Success { get; set; }
    public string? ExternalPostId { get; set; }
    public string? ExternalPostUrl { get; set; }
    public string? Error { get; set; }
}

public static class SocialMediaType
{
    public const string Auto = "auto";
    public const string Text = "text";
    public const string Photo = "photo";
    public const string Video = "video";

    public static bool IsVideo(string? mediaType) =>
        string.Equals(mediaType, Video, StringComparison.OrdinalIgnoreCase)
        || (string.Equals(mediaType, Auto, StringComparison.OrdinalIgnoreCase)
            && !string.IsNullOrWhiteSpace(mediaType));
}

public class PublishSocialContentResponse
{
    public DateTimeOffset RequestedAt { get; set; } = DateTimeOffset.UtcNow;
    public List<SocialPublishResultDto> Results { get; set; } = [];
}

public class FacebookClientCodeRequest
{
    /// <summary>
    /// Long-lived user access token obtained via the standard OAuth flow.
    /// </summary>
    [Required]
    public string AccessToken { get; set; } = string.Empty;

    /// <summary>
    /// Redirect URI that exactly matches the one used when the access token was issued.
    /// Defaults to App:PublicBaseUrl when omitted.
    /// </summary>
    [MaxLength(500)]
    public string? RedirectUri { get; set; }
}

public class FacebookClientCodeResultDto
{
    public bool Success { get; set; }
    public string? Code { get; set; }
    public string? Error { get; set; }
}

public class FacebookLongLivedTokenRequest
{
    /// <summary>
    /// Code returned by the /oauth/client_code endpoint. Single-use and valid for a short window.
    /// </summary>
    [Required]
    public string Code { get; set; } = string.Empty;

    /// <summary>
    /// Redirect URI that exactly matches the one used for the client_code request.
    /// </summary>
    [MaxLength(500)]
    public string? RedirectUri { get; set; }
}

public class FacebookLongLivedTokenResultDto
{
    public bool Success { get; set; }
    public string? AccessToken { get; set; }
    public string? TokenType { get; set; }
    public long? ExpiresIn { get; set; }
    public string? Error { get; set; }
}
/// <summary>
/// DTO used when creating a new post/tweet on X.
/// </summary>
public class XPostCreationRequestDto
{
    public string TweetText { get; set; }


    /// <summary>
    /// Optional URL to attach to the tweet.
    /// </summary>
    public string MediaUrl { get; set; }

    /// <summary>
    /// The ID of the user associated with the tweet (if posting on behalf of another).
    /// </summary>
    public string UserId { get; set; }
    public string Profile { get; set; }
    public string AccessToken { get; set; }
    public string Posts { get; set; } 
    public string Notifications { get; set; }
}
