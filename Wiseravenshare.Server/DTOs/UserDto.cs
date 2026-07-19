// Wiseravenshare.Server/DTOs/User/UserDto.cs
using System.ComponentModel.DataAnnotations;

namespace Wiseravenshare.Server.DTOs.User
{

    public class UserDto
    {
        public Guid Id { get; set; }
        public string Email { get; set; } = string.Empty;
        public string Username { get; set; } = string.Empty;
        public string DisplayName { get; set; } = string.Empty;
        public string? Bio { get; set; }
        public string? AvatarUrl { get; set; }
        public string? CoverPhotoUrl { get; set; }
        public string? Location { get; set; }
        public string? Website { get; set; }
        public bool IsVerified { get; set; }
        public bool IsPrivate { get; set; }
        public string Role { get; set; } = "User";
        public decimal TruthScore { get; set; }
        public int ReputationPoints { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime? LastActiveAt { get; set; }
        public int FollowersCount { get; set; }
        public int FollowingCount { get; set; }
        public int PostsCount { get; set; }
        public bool IsFollowing { get; set; }
    }

    public class UpdateProfileDto
    {
        [MaxLength(100)]
        public string? DisplayName { get; set; }

        [MaxLength(500)]
        public string? Bio { get; set; }

        [MaxLength(100)]
        public string? Location { get; set; }

        [MaxLength(255)]
        [Url]
        public string? Website { get; set; }

        public bool? IsPrivate { get; set; }

        [MaxLength(500)]
        public string? AvatarUrl { get; set; }

        [MaxLength(500)]
        public string? CoverPhotoUrl { get; set; }
    }

    public class UserSettingsDto
    {
        public string Theme { get; set; } = "dark";
        public string Language { get; set; } = "en";
        public bool EmailNotifications { get; set; } = true;
        public bool PushNotifications { get; set; } = true;
        public bool DmFromAnyone { get; set; }
        public bool ShowOnlineStatus { get; set; } = true;
        public bool ShowReadReceipts { get; set; } = true;
        public string TruthDetectionLevel { get; set; } = "balanced";
        public string ContentFilterLevel { get; set; } = "moderate";
    }
}