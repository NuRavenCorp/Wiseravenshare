using System.Text.Json.Serialization;

namespace Wiseravenshare.Server.Entities;

public class UserBlock : BaseEntity
{
    public Guid BlockerId { get; set; }
    public Guid BlockedId { get; set; }

    [JsonIgnore]
    public virtual User Blocker { get; set; } = null!;

    [JsonIgnore]
    public virtual User Blocked { get; set; } = null!;
}
