// Wiseravenshare.Server/Entities/Message.cs
using System.ComponentModel.DataAnnotations;
using Wiseravenshare.Server.Entities;

namespace Wiseravenshare.Server.Entities
{
    public class Conversation : BaseEntity
    {
        public bool IsGroup { get; set; }
        public string? GroupName { get; set; }
        public string? GroupAvatar { get; set; }
        public Guid CreatedBy { get; set; }
        public DateTime? LastMessageAt { get; set; }

        // Navigation Properties
        public virtual User Creator { get; set; } = null!;
        public virtual ICollection<ConversationParticipant> Participants { get; set; } = new List<ConversationParticipant>();
        public virtual ICollection<Message> Messages { get; set; } = new List<Message>();
    }

    public class ConversationParticipant : BaseEntity
    {
        public Guid ConversationId { get; set; }
        public Guid UserId { get; set; }
        public DateTime JoinedAt { get; set; }
        public DateTime? LastReadAt { get; set; }
        public bool IsMuted { get; set; }

        // Navigation Properties
        public virtual Conversation Conversation { get; set; } = null!;
        public virtual User User { get; set; } = null!;
    }

    public class Message : BaseEntity
    {
        public Guid ConversationId { get; set; }
        public Guid SenderId { get; set; }

        [MaxLength(2000)]
        public string Content { get; set; } = string.Empty;

        public MessageType Type { get; set; } = MessageType.Text;
        public string[]? MediaUrls { get; set; }
        public bool IsRead { get; set; }
        public bool IsDeleted { get; set; }
        public Guid? ReplyToId { get; set; }
        public DateTime? ReadAt { get; set; }

        // Navigation Properties
        public virtual Conversation Conversation { get; set; } = null!;
        public virtual User Sender { get; set; } = null!;
        public virtual Message? ReplyTo { get; set; }
        public virtual ICollection<Message> Replies { get; set; } = new List<Message>();
    }

    public enum MessageType
    {
        Text,
        Image,
        Video,
        File,
        Voice
    }
}
