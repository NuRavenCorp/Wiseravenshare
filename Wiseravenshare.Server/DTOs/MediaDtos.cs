using System.ComponentModel.DataAnnotations;
using System.Text.Json;

namespace Wiseravenshare.Server.DTOs;

public sealed class MediaItemDto
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string MediaType { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public string FileUrl { get; set; } = string.Empty;
    public string MimeType { get; set; } = string.Empty;
    public long FileSize { get; set; }
    public int? Width { get; set; }
    public int? Height { get; set; }
    public int? Duration { get; set; }
    public string? ThumbnailUrl { get; set; }
    public string? PreviewUrl { get; set; }
    public string Visibility { get; set; } = string.Empty;
    public int Views { get; set; }
    public int Downloads { get; set; }
    public int Plays { get; set; }
    public Guid UserId { get; set; }
    public string UserName { get; set; } = string.Empty;
    public string? UserAvatar { get; set; }
    public DateTime CreatedAt { get; set; }
    public List<string> Tags { get; set; } = [];
    public int CommentsCount { get; set; }
    public bool IsLiked { get; set; }
    public bool IsBookmarked { get; set; }
}

public sealed class UploadMediaRequest
{
    [Required]
    public IFormFile? File { get; set; }

    [Required]
    [MaxLength(255)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(2000)]
    public string? Description { get; set; }

    public string MediaType { get; set; } = "Photo";
    public string Visibility { get; set; } = "Private";
    public List<string>? Tags { get; set; }
    public JsonDocument? Metadata { get; set; }
}

public sealed class UpdateMediaRequest
{
    [MaxLength(255)]
    public string? Title { get; set; }

    [MaxLength(2000)]
    public string? Description { get; set; }

    public string? Visibility { get; set; }
    public List<string>? Tags { get; set; }
}

public sealed class MediaSearchRequest
{
    public string? Query { get; set; }
    public string? MediaType { get; set; }
    public string? Visibility { get; set; }
    public List<string>? Tags { get; set; }
    public Guid? UserId { get; set; }
    public DateTime? FromDate { get; set; }
    public DateTime? ToDate { get; set; }
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 20;
    public string SortBy { get; set; } = "CreatedAt";
    public string SortOrder { get; set; } = "Desc";
}

public sealed class PlaylistDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string Type { get; set; } = string.Empty;
    public string Visibility { get; set; } = string.Empty;
    public string? CoverImageUrl { get; set; }
    public int ItemCount { get; set; }
    public int Plays { get; set; }
    public Guid UserId { get; set; }
    public string UserName { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public List<MediaItemDto> Items { get; set; } = [];
}

public sealed class CreatePlaylistRequest
{
    [Required]
    [MaxLength(255)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Description { get; set; }

    public string Visibility { get; set; } = "Private";
}

public sealed class AddToPlaylistRequest
{
    [Required]
    public Guid MediaId { get; set; }
}

public sealed class ReorderPlaylistRequest
{
    [Required]
    public Guid MediaId { get; set; }

    [Required]
    public int NewIndex { get; set; }
}

public sealed class MediaStreamDto
{
    public string FilePath { get; set; } = string.Empty;
    public string MimeType { get; set; } = "application/octet-stream";
    public long FileSize { get; set; }
    public DateTime LastModified { get; set; }
    public string? ContentRange { get; set; }
    public long? StartByte { get; set; }
    public long? EndByte { get; set; }
}

public sealed class StreamingStatusDto
{
    public string Status { get; set; } = "Ready";
    public int? CurrentPosition { get; set; }
    public int? Duration { get; set; }
    public bool IsPlaying { get; set; }
    public decimal Progress { get; set; }
    public string? CurrentTrack { get; set; }
}

public sealed class MediaProgressDto
{
    [Required]
    public Guid MediaId { get; set; }

    [Required]
    [Range(0, int.MaxValue)]
    public int Position { get; set; }

    public bool IsPlaying { get; set; }
}
