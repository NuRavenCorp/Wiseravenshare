// Wiseravenshare.Server/Entities/Comment.cs
using System.ComponentModel.DataAnnotations;
using Wiseravenshare.Server.Entities;

namespace Wiseravenshare.Server.Entities
{

    public class Comment : BaseEntity
    {
        public Guid PostId { get; set; }
        public Guid UserId { get; set; }
        public Guid? ParentCommentId { get; set; }

        [MaxLength(500)]
        public string Content { get; set; } = string.Empty;

        public int LikesCount { get; set; }
        public int RepliesCount { get; set; }
        public bool IsDeleted { get; set; }

        // Navigation Properties
        public virtual Post Post { get; set; } = null!;
        public virtual User User { get; set; } = null!;
        public virtual Comment? ParentComment { get; set; }
        public virtual ICollection<Comment> Replies { get; set; } = new List<Comment>();
        public virtual ICollection<CommentLike> Likes { get; set; } = new List<CommentLike>();
    }
}