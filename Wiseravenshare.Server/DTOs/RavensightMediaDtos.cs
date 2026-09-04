using Microsoft.AspNetCore.Http;

namespace Wiseravenshare.Server.DTOs;

public sealed class SaveRavensightVideoDto
{
    public IFormFile? File { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string DestinationFolder { get; set; } = string.Empty;
    public string Privacy { get; set; } = "unlisted";
    public string StorageMode { get; set; } = "temporary";
    public bool IsPermanent { get; set; }
    public string MusicTrackId { get; set; } = string.Empty;
    public string MusicTrackTitle { get; set; } = string.Empty;
    public string MusicTrackUrl { get; set; } = string.Empty;
    public string MusicTrackArtist { get; set; } = string.Empty;
    public string MusicTrackAlbum { get; set; } = string.Empty;
    public string MusicTrackGenre { get; set; } = string.Empty;
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
    public string Artist { get; set; } = string.Empty;
    public string Album { get; set; } = string.Empty;
    public string Genre { get; set; } = string.Empty;
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
    public string UploadedAt { get; set; } = string.Empty;
    public long SizeBytes { get; set; }
}
