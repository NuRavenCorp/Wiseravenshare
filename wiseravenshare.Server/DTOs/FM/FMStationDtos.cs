using System.ComponentModel.DataAnnotations;

namespace Wiseravenshare.Server.DTOs.FM;

public class FMStationDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string Frequency { get; set; } = string.Empty;
    public string Band { get; set; } = "FM";
    public string? City { get; set; }
    public string? Country { get; set; }
    public string? State { get; set; }
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
    public string StreamUrl { get; set; } = string.Empty;
    public string? Website { get; set; }
    public string? LogoUrl { get; set; }
    public string? CoverImageUrl { get; set; }
    public string Genre { get; set; } = "General";
    public string Language { get; set; } = "English";
    public int Listeners { get; set; }
    public bool IsActive { get; set; }
    public bool IsFeatured { get; set; }
    public int Bitrate { get; set; }
    public string? Codec { get; set; }
    public bool IsLiked { get; set; }
    public bool IsBookmarked { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class CreateFMStationDto
{
    [Required, MaxLength(255)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Description { get; set; }

    [Required, MaxLength(100)]
    public string Frequency { get; set; } = string.Empty;

    [MaxLength(50)]
    public string Band { get; set; } = "FM";

    public string? City { get; set; }
    public string? Country { get; set; }
    public string? State { get; set; }
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }

    [Required, MaxLength(500)]
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

    public int Bitrate { get; set; } = 128;

    [MaxLength(50)]
    public string? Codec { get; set; }

    public bool IsFeatured { get; set; }
}

public class UpdateFMStationDto
{
    [MaxLength(255)]
    public string? Name { get; set; }

    [MaxLength(500)]
    public string? Description { get; set; }

    [MaxLength(100)]
    public string? Frequency { get; set; }

    [MaxLength(50)]
    public string? Band { get; set; }
    public string? City { get; set; }
    public string? Country { get; set; }
    public string? State { get; set; }
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }

    [MaxLength(500)]
    public string? StreamUrl { get; set; }

    [MaxLength(500)]
    public string? Website { get; set; }

    [MaxLength(500)]
    public string? LogoUrl { get; set; }

    [MaxLength(500)]
    public string? CoverImageUrl { get; set; }

    [MaxLength(50)]
    public string? Genre { get; set; }

    [MaxLength(100)]
    public string? Language { get; set; }

    public int? Bitrate { get; set; }

    [MaxLength(50)]
    public string? Codec { get; set; }

    public bool? IsActive { get; set; }
    public bool? IsFeatured { get; set; }
}

public class FMStationSearchDto
{
    public string? Query { get; set; }
    public string? Genre { get; set; }
    public string? Language { get; set; }
    public string? City { get; set; }
    public string? Country { get; set; }
    public string? Band { get; set; }
    public bool? IsFeatured { get; set; }
    public bool? IsActive { get; set; }
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 20;
    public string? SortBy { get; set; } = "Listeners";
    public string? SortOrder { get; set; } = "Desc";
}

public class FMStationPlaybackDto
{
    public Guid StationId { get; set; }
    public string StreamUrl { get; set; } = string.Empty;
    public string StationName { get; set; } = string.Empty;
    public string? LogoUrl { get; set; }
    public string Genre { get; set; } = string.Empty;
    public int Listeners { get; set; }
    public int Bitrate { get; set; }
    public string? Codec { get; set; }
}

public class FMPlayerStateDto
{
    public Guid CurrentStationId { get; set; }
    public string CurrentStationName { get; set; } = string.Empty;
    public string CurrentStationLogo { get; set; } = string.Empty;
    public bool IsPlaying { get; set; }
    public int Volume { get; set; } = 80;
    public string? Genre { get; set; }
    public int ListenerCount { get; set; }
    public string StreamUrl { get; set; } = string.Empty;
    public int Bitrate { get; set; }
}

public class FMUserPreferenceDto
{
    public string[]? FavoriteGenres { get; set; }
    public string[]? FavoriteLanguages { get; set; }
    public int Volume { get; set; } = 80;
    public bool AutoPlay { get; set; }
    public bool ShowLyrics { get; set; }
    public bool ShowAlbumArt { get; set; } = true;
    public bool LowQualityMode { get; set; }
}

public class FMNowPlayingDto
{
    public Guid StationId { get; set; }
    public string StationName { get; set; } = string.Empty;
    public string? SongTitle { get; set; }
    public string? ArtistName { get; set; }
    public string? AlbumName { get; set; }
    public string? CoverArtUrl { get; set; }
    public DateTime StartedAt { get; set; }
    public int Duration { get; set; }
}
