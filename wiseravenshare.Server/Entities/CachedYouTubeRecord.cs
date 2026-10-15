using System.ComponentModel.DataAnnotations;

namespace Wiseravenshare.Server.Entities;

public class CachedYouTubeRecord : BaseEntity
{
    [MaxLength(512)]
    public string CacheKey { get; set; } = string.Empty;

    public string JsonData { get; set; } = string.Empty;

    public DateTime CachedAt { get; set; } = DateTime.UtcNow;

    public DateTime AbsoluteExpiration { get; set; }
}
