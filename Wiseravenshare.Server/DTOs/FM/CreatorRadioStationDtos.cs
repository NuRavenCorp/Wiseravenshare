using System.ComponentModel.DataAnnotations;

namespace Wiseravenshare.Server.DTOs.FM;

public class CreatorRadioStationDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string Frequency { get; set; } = string.Empty;
    public string Band { get; set; } = "Online";
    public string? Genre { get; set; }
    public string? SubGenre { get; set; }
    public string? LogoUrl { get; set; }
    public string? CoverImageUrl { get; set; }
    public string? StreamUrl { get; set; }
    public string? Website { get; set; }
    public string? SocialLinks { get; set; }
    public Guid CreatorId { get; set; }
    public string CreatorName { get; set; } = string.Empty;
    public string? CreatorAvatar { get; set; }
    public string Status { get; set; } = "Draft";
    public string Visibility { get; set; } = "Public";
    public bool IsLive { get; set; }
    public DateTime? LastLiveAt { get; set; }
    public DateTime? ScheduledLiveAt { get; set; }
    public DateTime? ScheduledEndAt { get; set; }
    public int Listeners { get; set; }
    public int TotalListeners { get; set; }
    public int PeakListeners { get; set; }
    public int FollowerCount { get; set; }
    public bool AllowChat { get; set; }
    public bool AllowRequests { get; set; }
    public bool AllowShoutouts { get; set; }
    public bool IsFollowing { get; set; }
    public bool IsProprietaryFrequency { get; set; }
    public DateTime? FrequencyLockedAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public List<RadioStationScheduleDto> Schedule { get; set; } = new();
    public List<RadioStationEpisodeDto> Episodes { get; set; } = new();
}

public class CreateCreatorRadioStationDto
{
    [Required, MaxLength(255)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Description { get; set; }

    public string? Frequency { get; set; }
    public string Band { get; set; } = "Online";

    [Required]
    public string Genre { get; set; } = string.Empty;

    public string? SubGenre { get; set; }
    public string? LogoUrl { get; set; }
    public string? CoverImageUrl { get; set; }
    public string? Website { get; set; }
    public string? SocialLinks { get; set; }
    public string Visibility { get; set; } = "Public";
    public bool AllowChat { get; set; } = true;
    public bool AllowRequests { get; set; } = true;
    public bool AllowShoutouts { get; set; } = true;
    public bool ClaimProprietaryFrequency { get; set; } = true;
}

public class UpdateCreatorRadioStationDto
{
    [MaxLength(255)]
    public string? Name { get; set; }

    [MaxLength(500)]
    public string? Description { get; set; }
    public string? Frequency { get; set; }
    public string? Band { get; set; }
    public string? Genre { get; set; }
    public string? SubGenre { get; set; }
    public string? LogoUrl { get; set; }
    public string? CoverImageUrl { get; set; }
    public string? Website { get; set; }
    public string? SocialLinks { get; set; }
    public string? Visibility { get; set; }
    public bool? AllowChat { get; set; }
    public bool? AllowRequests { get; set; }
    public bool? AllowShoutouts { get; set; }
    public string? StreamUrl { get; set; }
    public string? StreamKey { get; set; }
    public bool? IsProprietaryFrequency { get; set; }
}

public class RadioStationStatusUpdateDto
{
    [Required]
    public string Status { get; set; } = string.Empty;
}

public class RadioStationScheduleDto
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int DayOfWeek { get; set; }
    public string StartTime { get; set; } = string.Empty;
    public string EndTime { get; set; } = string.Empty;
    public string Timezone { get; set; } = "UTC";
    public bool IsRecurring { get; set; }
    public DateTime? SpecificDate { get; set; }
    public string? HostName { get; set; }
    public string? Genre { get; set; }
    public bool IsActive { get; set; }
}

public class CreateRadioStationScheduleDto
{
    [Required, MaxLength(255)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Description { get; set; }

    [Required]
    public int DayOfWeek { get; set; }

    [Required]
    public string StartTime { get; set; } = string.Empty;

    [Required]
    public string EndTime { get; set; } = string.Empty;

    public string Timezone { get; set; } = "UTC";
    public bool IsRecurring { get; set; } = true;
    public DateTime? SpecificDate { get; set; }
    public string? HostName { get; set; }
    public string? Genre { get; set; }
}

public class RadioStationEpisodeDto
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? AudioUrl { get; set; }
    public int Duration { get; set; }
    public DateTime BroadcastDate { get; set; }
    public int ListenCount { get; set; }
    public int LikeCount { get; set; }
    public int CommentCount { get; set; }
    public int ShareCount { get; set; }
    public bool IsLiveRecording { get; set; }
    public bool IsPublished { get; set; }
}

public class RadioStationFollowDto
{
    public Guid StationId { get; set; }
    public string StationName { get; set; } = string.Empty;
    public string? StationLogo { get; set; }
    public DateTime FollowedAt { get; set; }
    public bool IsNotified { get; set; }
}

public class RadioStationRequestDto
{
    public Guid Id { get; set; }
    public string SongTitle { get; set; } = string.Empty;
    public string? ArtistName { get; set; }
    public string? Message { get; set; }
    public string Status { get; set; } = "Pending";
    public DateTime RequestedAt { get; set; }
    public DateTime? PlayedAt { get; set; }
    public SimpleRequesterDto Requester { get; set; } = null!;
}

public class CreateRadioStationRequestDto
{
    [Required, MaxLength(255)]
    public string SongTitle { get; set; } = string.Empty;

    [MaxLength(255)]
    public string? ArtistName { get; set; }

    [MaxLength(500)]
    public string? Message { get; set; }
}

public class RadioStationShoutoutDto
{
    public Guid Id { get; set; }
    public string Message { get; set; } = string.Empty;
    public string Status { get; set; } = "Pending";
    public DateTime RequestedAt { get; set; }
    public SimpleRequesterDto User { get; set; } = null!;
}

public class CreateRadioStationShoutoutDto
{
    [Required, MaxLength(500)]
    public string Message { get; set; } = string.Empty;
}

public class RadioStationAnalyticsDto
{
    public Guid StationId { get; set; }
    public string StationName { get; set; } = string.Empty;
    public int TotalListeners { get; set; }
    public int PeakListeners { get; set; }
    public int AverageListeners { get; set; }
    public int TotalListeningHours { get; set; }
    public int FollowerCount { get; set; }
    public int TotalRequests { get; set; }
    public int TotalShoutouts { get; set; }
}

public class SimpleRequesterDto
{
    public Guid Id { get; set; }
    public string Username { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string? AvatarUrl { get; set; }
}
