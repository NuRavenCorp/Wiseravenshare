using Microsoft.AspNetCore.Http;

namespace Wiseravenshare.Server.DTOs;

public sealed class SaveRavensightVideoDto
{
    public IFormFile? File { get; set; }
    public string? Title { get; set; }
    public string? Description { get; set; }
    public string? DestinationFolder { get; set; }
    public string? Privacy { get; set; }
    public string? StorageMode { get; set; }
    public bool IsPermanent { get; set; }
    public string? MusicTrackId { get; set; }
    public string? MusicTrackTitle { get; set; }
    public string? MusicTrackUrl { get; set; }
    public string? MusicTrackArtist { get; set; }
    public string? MusicTrackAlbum { get; set; }
    public string? MusicTrackGenre { get; set; }
}

public sealed class SaveRavensightPhotoDto
{
    public IFormFile? File { get; set; }
    public string Caption { get; set; } = string.Empty;
    public string DestinationFolder { get; set; } = string.Empty;
}

public sealed class SaveRavensightMusicDto
{
    public IFormFile? File { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Artist { get; set; }
    public string? Album { get; set; }
    public string? Genre { get; set; }
    public string DestinationFolder { get; set; } = string.Empty;
    public string? Fingerprint { get; set; }
}

public sealed class RavensightSavedMediaDto
{
    public string FileName { get; set; } = string.Empty;
    public string RelativePath { get; set; } = string.Empty;
    public string DestinationFolder { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long SizeBytes { get; set; }
    public DateTime SavedAtUtc { get; set; }
    public string MediaUrl { get; set; } = string.Empty;
}

public sealed class UserMusicTrackDto
{
    public string Id { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Artist { get; set; } = string.Empty;
    public string Album { get; set; } = string.Empty;
    public string Genre { get; set; } = string.Empty;
    public string? Fingerprint { get; set; }
    public string MediaUrl { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public string RelativePath { get; set; } = string.Empty;
    public string ObjectKey { get; set; } = string.Empty;
    public string UploadedAt { get; set; } = string.Empty;
    public long SizeBytes { get; set; }
    public bool Archived { get; set; }
    public bool Protected { get; set; }
}

public sealed class UpdateRavensightMediaStateRequest
{
    public bool? Archived { get; set; }
    public bool? Protected { get; set; }
}

public sealed class UpdateMusicTrackInfoRequest
{
    public string? Title { get; set; }
    public string? Artist { get; set; }
    public string? Album { get; set; }
    public string? Genre { get; set; }
}

public sealed class MusicPlayerStateUpsertRequest
{
    public string? ActivePlaylistId { get; set; }
    public string? LastTrackId { get; set; }
    public double LastPositionSeconds { get; set; }
    public List<string> QueueTrackIds { get; set; } = new();
    public List<string> FavoriteTrackIds { get; set; } = new();
    public List<MusicPlaylistStateDto> Playlists { get; set; } = new();
    public List<MusicHistoryEntryDto> RecentHistory { get; set; } = new();
}

public sealed class MusicPlayerStateDto
{
    public string? ActivePlaylistId { get; set; }
    public string? LastTrackId { get; set; }
    public double LastPositionSeconds { get; set; }
    public List<string> QueueTrackIds { get; set; } = new();
    public List<string> FavoriteTrackIds { get; set; } = new();
    public List<MusicPlaylistStateDto> Playlists { get; set; } = new();
    public List<MusicHistoryEntryDto> RecentHistory { get; set; } = new();
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class MusicPlaylistStateDto
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public List<string> TrackIds { get; set; } = new();
    public string CreatedAt { get; set; } = DateTime.UtcNow.ToString("O");
}

public sealed class MusicHistoryEntryDto
{
    public string TrackId { get; set; } = string.Empty;
    public string PlayedAt { get; set; } = DateTime.UtcNow.ToString("O");
    public double PositionSeconds { get; set; }
    public bool Completed { get; set; }
}
