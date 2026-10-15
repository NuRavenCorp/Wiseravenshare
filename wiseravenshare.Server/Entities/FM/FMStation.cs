using System.ComponentModel.DataAnnotations;

namespace Wiseravenshare.Server.Entities.FM;

public class FMStation : BaseEntity
{
    [MaxLength(255)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Description { get; set; }

    [MaxLength(100)]
    public string Frequency { get; set; } = string.Empty;

    [MaxLength(128)]
    public string? FrequencyKey { get; set; }

    [MaxLength(50)]
    public string Band { get; set; } = "FM";

    [MaxLength(255)]
    public string? City { get; set; }

    [MaxLength(255)]
    public string? Country { get; set; }

    [MaxLength(50)]
    public string? State { get; set; }

    public double? Latitude { get; set; }
    public double? Longitude { get; set; }

    [MaxLength(500)]
    public string StreamUrl { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Website { get; set; }

    [MaxLength(500)]
    public string? LogoUrl { get; set; }

    [MaxLength(500)]
    public string? CoverImageUrl { get; set; }

    [MaxLength(50)]
    public string Genre { get; set; } = "General";

    [MaxLength(100)]
    public string Language { get; set; } = "English";

    public int Listeners { get; set; }
    public bool IsActive { get; set; } = true;
    public bool IsFeatured { get; set; }
    public int Bitrate { get; set; } = 128;

    [MaxLength(50)]
    public string? Codec { get; set; }

    public Guid? CreatedBy { get; set; }
    public bool IsVerified { get; set; }
    public DateTime? VerifiedAt { get; set; }

    public virtual User? Creator { get; set; }
    public virtual ICollection<FMStationLike> Likes { get; set; } = new List<FMStationLike>();
    public virtual ICollection<FMStationBookmark> Bookmarks { get; set; } = new List<FMStationBookmark>();
    public virtual ICollection<FMStationHistory> History { get; set; } = new List<FMStationHistory>();
}

public class FMStationLike : BaseEntity
{
    public Guid StationId { get; set; }
    public Guid UserId { get; set; }

    public virtual FMStation Station { get; set; } = null!;
    public virtual User User { get; set; } = null!;
}

public class FMStationBookmark : BaseEntity
{
    public Guid StationId { get; set; }
    public Guid UserId { get; set; }

    public virtual FMStation Station { get; set; } = null!;
    public virtual User User { get; set; } = null!;
}

public class FMStationHistory : BaseEntity
{
    public Guid StationId { get; set; }
    public Guid UserId { get; set; }
    public DateTime ListenedAt { get; set; }
    public int Duration { get; set; }

    public virtual FMStation Station { get; set; } = null!;
    public virtual User User { get; set; } = null!;
}
