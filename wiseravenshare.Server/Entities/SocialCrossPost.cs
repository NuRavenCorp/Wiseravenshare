// Wiseravenshare.Server/Entities/SocialCrossPost.cs
namespace Wiseravenshare.Server.Entities;

/// <summary>
/// Tracks a single cross-platform publish attempt for one post to one external
/// platform (facebook, instagram, youtube, tiktok, twitter, linkedin).
/// </summary>
public class SocialCrossPost : BaseEntity
{
    public Guid PostId { get; set; }
    public Guid UserId { get; set; }

    /// <summary>Normalized platform key: facebook | instagram | youtube | tiktok | twitter | linkedin.</summary>
    public string Platform { get; set; } = string.Empty;

    /// <summary>Pending | Published | Failed.</summary>
    public string Status { get; set; } = "Pending";

    public string? ExternalPostId { get; set; }
    public string? ExternalPostUrl { get; set; }
    public string? ErrorMessage { get; set; }
    public DateTimeOffset? PublishedAt { get; set; }

    public virtual Post? Post { get; set; }
}
