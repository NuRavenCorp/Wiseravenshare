namespace Wiseravenshare.Server.Entities;

public class PostLike : BaseEntity
{
    public Guid PostId { get; set; }
    public Guid UserId { get; set; }
}

public class PostRepost : BaseEntity
{
    public Guid PostId { get; set; }
    public Guid UserId { get; set; }
}

public class PostBookmark : BaseEntity
{
    public Guid PostId { get; set; }
    public Guid UserId { get; set; }
}

public class UserSettings : BaseEntity
{
    public Guid UserId { get; set; }
    public string Theme { get; set; } = "dark";
}
