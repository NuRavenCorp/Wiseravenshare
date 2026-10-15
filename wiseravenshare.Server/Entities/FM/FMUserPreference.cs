using System.Text.Json;

namespace Wiseravenshare.Server.Entities.FM;

public class FMUserPreference : BaseEntity
{
    public Guid UserId { get; set; }

    public string[]? FavoriteGenres { get; set; }
    public string[]? FavoriteLanguages { get; set; }
    public JsonDocument? RecentStations { get; set; }

    public int Volume { get; set; } = 80;
    public bool AutoPlay { get; set; }
    public bool ShowLyrics { get; set; }
    public bool ShowAlbumArt { get; set; } = true;
    public bool LowQualityMode { get; set; }

    public virtual User User { get; set; } = null!;
}
