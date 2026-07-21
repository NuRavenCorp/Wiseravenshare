// Wiseravenshare.Core/Entities/User.cs
using System.Text.Json.Serialization;

namespace Wiseravenshare.Server.Entities
{

    public class User : BaseEntity
    {
        public string Email { get; set; } = string.Empty;
        public string Username { get; set; } = string.Empty;
        public string DisplayName { get; set; } = string.Empty;
        public string PasswordHash { get; set; } = string.Empty;
        public string? Bio { get; set; }
        public string? AvatarUrl { get; set; }
        public string? CoverPhotoUrl { get; set; }
        public string? Location { get; set; }
        public string? Website { get; set; }
        public bool IsVerified { get; set; }
        public bool IsActive { get; set; } = true;
        public bool IsPrivate { get; set; }
        public UserRole Role { get; set; } = UserRole.User;
        public decimal TruthScore { get; set; } = 50.00m;
        public int ReputationPoints { get; set; }
        public DateTime? LastLoginAt { get; set; }
        public DateTime? LastActiveAt { get; set; }
        public DateTime? DeletedAt { get; set; }

        // Navigation Properties
        public virtual ICollection<Post> Posts { get; set; } = new List<Post>();
        public virtual ICollection<Follow> Followers { get; set; } = new List<Follow>();
        public virtual ICollection<Follow> Following { get; set; } = new List<Follow>();
        public virtual UserSettings Settings { get; set; } = null!;
    }

    public enum UserRole
    {
        User,
        Moderator,
        Admin,
        TruthGuardian,
        AIAgent
    }
}