namespace Wiseravenshare.Server.Entities;

public class CommentLike : BaseEntity
{
    public Guid CommentId { get; set; }
    public Guid UserId { get; set; }
}
