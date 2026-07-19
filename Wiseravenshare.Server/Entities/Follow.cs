// Wiseravenshare.Server/Entities/Follow.cs
using System.Text.Json.Serialization;

namespace Wiseravenshare.Server.Entities
{

    public class Follow : BaseEntity
    {
        public Guid FollowerId { get; set; }
        public Guid FollowingId { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        // Navigation Properties
        [JsonIgnore]
        public virtual User Follower { get; set; } = null!;

        [JsonIgnore]
        public virtual User Following { get; set; } = null!;
    }
}