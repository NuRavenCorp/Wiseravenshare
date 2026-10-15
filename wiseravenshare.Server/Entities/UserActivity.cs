using System.ComponentModel.DataAnnotations;

namespace Wiseravenshare.Server.Entities;

public class UserActivity : BaseEntity
{
    public Guid ActorUserId { get; set; }

    public UserActivityType ActivityType { get; set; }

    public Guid? TargetId { get; set; }

    [MaxLength(64)]
    public string? TargetType { get; set; }

    [MaxLength(1000)]
    public string? Summary { get; set; }

    public virtual User Actor { get; set; } = null!;
}

public enum UserActivityType
{
    PostCreated,
    MediaUploaded,
    CommentPosted,
    MediaLiked,
    Followed,
    YouTubeImport
}
