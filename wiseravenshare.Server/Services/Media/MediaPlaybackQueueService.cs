using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.DTOs;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Infrastructure.Data;

namespace Wiseravenshare.Server.Services.Media;

public interface IMediaPlaybackQueueService
{
    Task<PlaybackQueueDto> GetMusicQueueAsync(Guid userId, CancellationToken cancellationToken = default);
    Task<PlaybackQueueDto> GetVideoQueueAsync(Guid userId, CancellationToken cancellationToken = default);
}

public sealed class MediaPlaybackQueueService : IMediaPlaybackQueueService
{
    private readonly AppDbContext _dbContext;
    private readonly IMediaBlobSignatureService _signatureService;

    public MediaPlaybackQueueService(AppDbContext dbContext, IMediaBlobSignatureService signatureService)
    {
        _dbContext = dbContext;
        _signatureService = signatureService;
    }

    public Task<PlaybackQueueDto> GetMusicQueueAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        return BuildQueueAsync(userId, MediaType.Music, "music", cancellationToken);
    }

    public Task<PlaybackQueueDto> GetVideoQueueAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        return BuildQueueAsync(userId, MediaType.Video, "video", cancellationToken);
    }

    private async Task<PlaybackQueueDto> BuildQueueAsync(Guid userId, MediaType mediaType, string kind, CancellationToken cancellationToken)
    {
        var items = await _dbContext.MediaItems
            .AsNoTracking()
            .Where(x =>
                x.UserId == userId &&
                !x.IsDeleted &&
                x.Status == MediaStatus.Ready &&
                x.MediaType == mediaType)
            .OrderBy(x => x.CreatedAt)
            .Select(x => new
            {
                x.Id,
                x.Title,
                x.Duration,
                x.MimeType,
                x.FileUrl,
                x.Metadata
            })
            .ToListAsync(cancellationToken);

        var entries = items
            .Select(item => new PlaybackEntryDto
            {
                MediaId = item.Id,
                Kind = kind,
                Title = item.Title,
                Artist = TryReadMetadataString(item.Metadata, "artist"),
                Album = TryReadMetadataString(item.Metadata, "album"),
                DurationSeconds = item.Duration ?? 0,
                MimeType = item.MimeType,
                Url = ResolvePlayableUrl(item.FileUrl, item.Metadata),
                ExpiresIn = 0
            })
            .ToList();

        return new PlaybackQueueDto
        {
            Kind = kind,
            Count = entries.Count,
            Entries = entries
        };
    }

    private string ResolvePlayableUrl(string fileUrl, JsonDocument? metadata)
    {
        var objectKey = TryReadMetadataString(metadata, "objectKey");
        if (string.IsNullOrWhiteSpace(objectKey))
        {
            return fileUrl;
        }

        var normalizedObjectKey = objectKey.Replace('\\', '/').Trim('/');
        if (string.IsNullOrWhiteSpace(normalizedObjectKey))
        {
            return fileUrl;
        }

        var signature = _signatureService.SignKey(normalizedObjectKey);
        if (string.IsNullOrWhiteSpace(signature))
        {
            return $"/api/media/blob/{normalizedObjectKey}";
        }

        return $"/api/media/blob/{normalizedObjectKey}?sig={Uri.EscapeDataString(signature)}";
    }

    private static string? TryReadMetadataString(JsonDocument? metadata, string propertyName)
    {
        if (metadata is null || metadata.RootElement.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        if (!metadata.RootElement.TryGetProperty(propertyName, out var value))
        {
            return null;
        }

        return value.ValueKind == JsonValueKind.String ? value.GetString() : value.ToString();
    }
}
