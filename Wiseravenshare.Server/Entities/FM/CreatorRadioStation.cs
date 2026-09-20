using System.ComponentModel.DataAnnotations;
using System.Text.Json;

namespace Wiseravenshare.Server.Entities.FM;

public class CreatorRadioStation : BaseEntity
{
    [MaxLength(255)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Description { get; set; }

    [MaxLength(100)]
    public string Frequency { get; set; } = string.Empty;

    [MaxLength(128)]
    public string FrequencyKey { get; set; } = string.Empty;

    [MaxLength(50)]
    public string Band { get; set; } = "Online";

    [MaxLength(255)]
    public string? Genre { get; set; }

    [MaxLength(255)]
    public string? SubGenre { get; set; }

    [MaxLength(500)]
    public string? LogoUrl { get; set; }

    [MaxLength(500)]
    public string? CoverImageUrl { get; set; }

    [MaxLength(500)]
    public string? StreamUrl { get; set; }

    [MaxLength(500)]
    public string? StreamKey { get; set; }

    [MaxLength(500)]
    public string? Website { get; set; }

    [MaxLength(500)]
    public string? SocialLinks { get; set; }

    public Guid CreatorId { get; set; }
    public RadioStationStatus Status { get; set; } = RadioStationStatus.Draft;
    public RadioStationVisibility Visibility { get; set; } = RadioStationVisibility.Public;

    public bool IsLive { get; set; }
    public DateTime? LastLiveAt { get; set; }
    public DateTime? ScheduledLiveAt { get; set; }
    public DateTime? ScheduledEndAt { get; set; }

    public int Listeners { get; set; }
    public int TotalListeners { get; set; }
    public int PeakListeners { get; set; }
    public int FollowerCount { get; set; }

    public bool AllowChat { get; set; } = true;
    public bool AllowRequests { get; set; } = true;
    public bool AllowShoutouts { get; set; } = true;
    public bool RequireApproval { get; set; }

    public JsonDocument? Schedule { get; set; }
    public JsonDocument? Playlist { get; set; }
    public JsonDocument? Settings { get; set; }

    public bool IsMonetized { get; set; }
    public decimal? SubscriptionPrice { get; set; }
    public bool AllowDonations { get; set; }
    public string? DonationLink { get; set; }

    public bool IsProprietaryFrequency { get; set; } = true;
    public DateTime? FrequencyLockedAt { get; set; }

    public virtual User Creator { get; set; } = null!;
    public virtual ICollection<RadioStationFollow> Followers { get; set; } = new List<RadioStationFollow>();
    public virtual ICollection<RadioStationListen> ListenHistory { get; set; } = new List<RadioStationListen>();
    public virtual ICollection<RadioStationSchedule> ScheduledShows { get; set; } = new List<RadioStationSchedule>();
    public virtual ICollection<RadioStationEpisode> Episodes { get; set; } = new List<RadioStationEpisode>();
    public virtual ICollection<RadioStationRequest> Requests { get; set; } = new List<RadioStationRequest>();
    public virtual ICollection<RadioStationShoutout> Shoutouts { get; set; } = new List<RadioStationShoutout>();
    public virtual ICollection<RadioStationFrequencyClaim> FrequencyClaims { get; set; } = new List<RadioStationFrequencyClaim>();
}

public enum RadioStationStatus
{
    Draft = 0,
    PendingApproval = 1,
    Active = 2,
    Suspended = 3,
    Archived = 4
}

public enum RadioStationVisibility
{
    Public = 0,
    Unlisted = 1,
    Private = 2,
    SubscribersOnly = 3
}

public class RadioStationSchedule : BaseEntity
{
    public Guid StationId { get; set; }

    [MaxLength(255)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Description { get; set; }

    public DayOfWeek DayOfWeek { get; set; }
    public TimeSpan StartTime { get; set; }
    public TimeSpan EndTime { get; set; }

    [MaxLength(64)]
    public string Timezone { get; set; } = "UTC";

    public bool IsRecurring { get; set; } = true;
    public DateTime? SpecificDate { get; set; }

    [MaxLength(255)]
    public string? HostName { get; set; }

    [MaxLength(255)]
    public string? Genre { get; set; }

    public bool IsActive { get; set; } = true;

    public virtual CreatorRadioStation Station { get; set; } = null!;
}

public class RadioStationEpisode : BaseEntity
{
    public Guid StationId { get; set; }
    public Guid? ScheduleId { get; set; }

    [MaxLength(255)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(2000)]
    public string? Description { get; set; }

    [MaxLength(500)]
    public string? AudioUrl { get; set; }

    public int Duration { get; set; }
    public DateTime BroadcastDate { get; set; }

    public int ListenCount { get; set; }
    public int LikeCount { get; set; }
    public int CommentCount { get; set; }
    public int ShareCount { get; set; }

    public bool IsLiveRecording { get; set; }
    public bool IsPublished { get; set; }

    public virtual CreatorRadioStation Station { get; set; } = null!;
    public virtual RadioStationSchedule? Schedule { get; set; }
}

public class RadioStationFollow : BaseEntity
{
    public Guid StationId { get; set; }
    public Guid UserId { get; set; }
    public DateTime FollowedAt { get; set; } = DateTime.UtcNow;
    public bool IsNotified { get; set; } = true;

    public virtual CreatorRadioStation Station { get; set; } = null!;
    public virtual User User { get; set; } = null!;
}

public class RadioStationListen : BaseEntity
{
    public Guid StationId { get; set; }
    public Guid UserId { get; set; }
    public DateTime StartedAt { get; set; } = DateTime.UtcNow;
    public DateTime? EndedAt { get; set; }
    public int Duration { get; set; }

    [MaxLength(255)]
    public string? DeviceInfo { get; set; }

    [MaxLength(80)]
    public string? IPAddress { get; set; }

    public virtual CreatorRadioStation Station { get; set; } = null!;
    public virtual User User { get; set; } = null!;
}

public class RadioStationRequest : BaseEntity
{
    public Guid StationId { get; set; }
    public Guid UserId { get; set; }

    [MaxLength(255)]
    public string SongTitle { get; set; } = string.Empty;

    [MaxLength(255)]
    public string? ArtistName { get; set; }

    [MaxLength(500)]
    public string? Message { get; set; }

    public RequestStatus Status { get; set; } = RequestStatus.Pending;
    public DateTime RequestedAt { get; set; } = DateTime.UtcNow;
    public DateTime? PlayedAt { get; set; }
    public Guid? PlayedBy { get; set; }

    public virtual CreatorRadioStation Station { get; set; } = null!;
    public virtual User User { get; set; } = null!;
    public virtual User? PlayedByUser { get; set; }
}

public enum RequestStatus
{
    Pending = 0,
    Approved = 1,
    Played = 2,
    Rejected = 3,
    Cancelled = 4
}

public class RadioStationShoutout : BaseEntity
{
    public Guid StationId { get; set; }
    public Guid UserId { get; set; }

    [MaxLength(500)]
    public string Message { get; set; } = string.Empty;

    public ShoutoutStatus Status { get; set; } = ShoutoutStatus.Pending;
    public DateTime RequestedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ReadAt { get; set; }
    public DateTime? AcknowledgedAt { get; set; }

    public virtual CreatorRadioStation Station { get; set; } = null!;
    public virtual User User { get; set; } = null!;
}

public enum ShoutoutStatus
{
    Pending = 0,
    Read = 1,
    Acknowledged = 2,
    Skipped = 3
}

public class RadioStationFrequencyClaim : BaseEntity
{
    public Guid StationId { get; set; }
    public Guid CreatorId { get; set; }

    [MaxLength(100)]
    public string Frequency { get; set; } = string.Empty;

    [MaxLength(50)]
    public string Band { get; set; } = "Online";

    [MaxLength(128)]
    public string FrequencyKey { get; set; } = string.Empty;

    public bool IsLocked { get; set; } = true;
    public DateTime LockedAt { get; set; } = DateTime.UtcNow;

    public virtual CreatorRadioStation Station { get; set; } = null!;
    public virtual User Creator { get; set; } = null!;
}
