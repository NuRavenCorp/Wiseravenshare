using Microsoft.AspNetCore.Http;

namespace Wiseravenshare.Server.DTOs;

public sealed class SaveRavensightVideoDto
{
    public IFormFile? File { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string DestinationFolder { get; set; } = string.Empty;
    public string Privacy { get; set; } = "unlisted";
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
