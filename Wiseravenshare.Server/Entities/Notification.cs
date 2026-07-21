// Wiseravenshare.Server/Entities/Notification.cs
using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using Wiseravenshare.Server.Entities;

namespace Wiseravenshare.Server.Entities
{

    public class Notification : BaseEntity
    {
        public Guid UserId { get; set; }
        public NotificationType Type { get; set; }
        public Guid? ActorId { get; set; }
        public Guid? PostId { get; set; }
        public Guid? CommentId { get; set; }
        public Guid? VideoId { get; set; }
        public Guid? MessageId { get; set; }

        [MaxLength(500)]
        public string? Content { get; set; }

        public JsonDocument? Metadata { get; set; }
        public bool IsRead { get; set; }
        public DateTime? ReadAt { get; set; }

        // Navigation Properties
        public virtual User User { get; set; } = null!;
        public virtual User? Actor { get; set; }
        public virtual Post? Post { get; set; }
        public virtual Comment? Comment { get; set; }
        public virtual Video? Video { get; set; }
        public virtual Message? Message { get; set; }
    }

    public enum NotificationType
    {
        Like,
        Comment,
        Follow,
        Mention,
        Repost,
        Message,
        TruthAlert,
        SystemAlert,
        Achievement
    }
}