using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.DTOs;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Exceptions;
using Wiseravenshare.Server.Infrastructure.Data;
using Wiseravenshare.Server.Interfaces.Repositories;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Services.Media;

public interface IMediaService
{
    Task<MediaItemDto> UploadMediaAsync(UploadMediaRequest request, Guid userId, CancellationToken cancellationToken = default);
    Task<MediaItemDto> GetMediaAsync(Guid mediaId, Guid userId);
    Task<MediaItemDto> UpdateMediaAsync(Guid mediaId, UpdateMediaRequest request, Guid userId);
    Task<bool> DeleteMediaAsync(Guid mediaId, Guid userId);
    Task<IEnumerable<MediaItemDto>> GetUserMediaAsync(Guid userId, int page, int pageSize);
    Task<IEnumerable<MediaItemDto>> SearchMediaAsync(MediaSearchRequest searchRequest, Guid userId);
    Task<MediaStreamDto> GetMediaStreamAsync(Guid mediaId, long? startByte = null, long? endByte = null);
    Task<MediaItemDto> LikeMediaAsync(Guid mediaId, Guid userId);
    Task<bool> UnlikeMediaAsync(Guid mediaId, Guid userId);
    Task<bool> BookmarkMediaAsync(Guid mediaId, Guid userId);
    Task<bool> UnbookmarkMediaAsync(Guid mediaId, Guid userId);
    Task<PlaylistDto> CreatePlaylistAsync(CreatePlaylistRequest request, Guid userId);
    Task<PlaylistDto> GetPlaylistAsync(Guid playlistId, Guid userId);
    Task<PlaylistDto> UpdatePlaylistAsync(Guid playlistId, CreatePlaylistRequest request, Guid userId);
    Task<bool> DeletePlaylistAsync(Guid playlistId, Guid userId);
    Task<PlaylistDto> AddToPlaylistAsync(Guid playlistId, AddToPlaylistRequest request, Guid userId);
    Task<bool> RemoveFromPlaylistAsync(Guid playlistId, Guid mediaId, Guid userId);
    Task ReorderPlaylistAsync(Guid playlistId, ReorderPlaylistRequest request, Guid userId);
    Task<IEnumerable<PlaylistDto>> GetUserPlaylistsAsync(Guid userId);
    Task TrackMediaViewAsync(Guid mediaId, Guid userId, int? position = null);
    Task<MediaProgressDto> SaveProgressAsync(Guid mediaId, MediaProgressDto progress, Guid userId);
    Task<StreamingStatusDto> GetStreamingStatusAsync(Guid mediaId, Guid userId);
}

public sealed class MediaService : IMediaService
{
    private const long MaxFileSize = 500L * 1024 * 1024;

    private readonly IMediaRepository _mediaRepository;
    private readonly IPlaylistRepository _playlistRepository;
    private readonly IMediaTagRepository _tagRepository;
    private readonly IUserRepository _userRepository;
    private readonly AppDbContext _dbContext;
    private readonly IWebHostEnvironment _environment;
    private readonly IBlobStorageService _blobStorageService;
    private readonly ILogger<MediaService> _logger;

    public MediaService(
        IMediaRepository mediaRepository,
        IPlaylistRepository playlistRepository,
        IMediaTagRepository tagRepository,
        IUserRepository userRepository,
        AppDbContext dbContext,
        IWebHostEnvironment environment,
        IBlobStorageService blobStorageService,
        ILogger<MediaService> logger)
    {
        _mediaRepository = mediaRepository;
        _playlistRepository = playlistRepository;
        _tagRepository = tagRepository;
        _userRepository = userRepository;
        _dbContext = dbContext;
        _environment = environment;
        _blobStorageService = blobStorageService;
        _logger = logger;
    }

    public async Task<MediaItemDto> UploadMediaAsync(UploadMediaRequest request, Guid userId, CancellationToken cancellationToken = default)
    {
        if (request.File is null || request.File.Length == 0)
        {
            throw new BadRequestException("No file provided.");
        }

        if (request.File.Length > MaxFileSize)
        {
            throw new BadRequestException("File size exceeds 500MB.");
        }

        var user = await _userRepository.GetByIdAsync(userId) ?? throw new NotFoundException("User not found.");
        var mediaType = ResolveMediaType(request.MediaType, request.File.FileName, request.File.ContentType);
        var visibility = ResolveVisibility(request.Visibility);

        var extension = Path.GetExtension(request.File.FileName).ToLowerInvariant();
        var generatedFileName = $"{Guid.NewGuid():N}{extension}";
        var relativePath = Path.Combine(mediaType.ToString().ToLowerInvariant(), DateTime.UtcNow.ToString("yyyy"), DateTime.UtcNow.ToString("MM"), DateTime.UtcNow.ToString("dd"));
        var safeRelativePath = relativePath.Replace('\\', '/');
        var root = Path.Combine(_environment.ContentRootPath, "MediaStorage", "Library");
        var targetDirectory = Path.Combine(root, relativePath);
        Directory.CreateDirectory(targetDirectory);
        var absolutePath = Path.Combine(targetDirectory, generatedFileName);

        await using (var stream = new FileStream(absolutePath, FileMode.Create, FileAccess.Write, FileShare.None))
        {
            await request.File.CopyToAsync(stream, cancellationToken);
        }

        var objectKey = $"wiseravenshare/media/{safeRelativePath}/{generatedFileName}";
        string? publicUrl = null;
        if (_blobStorageService.IsConfigured)
        {
            try
            {
                await using var uploadStream = File.OpenRead(absolutePath);
                var blobResult = await _blobStorageService.UploadAsync(
                    objectKey,
                    uploadStream,
                    string.IsNullOrWhiteSpace(request.File.ContentType) ? "application/octet-stream" : request.File.ContentType,
                    cancellationToken);
                publicUrl = blobResult.PublicUrl;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Blob upload failed for media file {FileName}", generatedFileName);
            }
        }

        var metadata = BuildMetadata(request.Metadata, objectKey, request.File.ContentType, publicUrl);
        var media = new MediaItem
        {
            Title = request.Title.Trim(),
            Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim(),
            MediaType = mediaType,
            Status = MediaStatus.Ready,
            FileName = generatedFileName,
            FilePath = absolutePath,
            FileUrl = string.Empty,
            MimeType = string.IsNullOrWhiteSpace(request.File.ContentType) ? "application/octet-stream" : request.File.ContentType,
            FileSize = request.File.Length,
            Width = TryReadInt(metadata, "width"),
            Height = TryReadInt(metadata, "height"),
            Duration = TryReadInt(metadata, "duration"),
            ThumbnailPath = null,
            ThumbnailUrl = null,
            PreviewPath = null,
            PreviewUrl = null,
            Metadata = metadata,
            UserId = userId,
            Visibility = visibility
        };

        await _mediaRepository.AddAsync(media);
        media.FileUrl = MediaUrlResolver.CreateDatabaseMediaUrl(media.Id);
        media.Metadata = BuildMetadata(request.Metadata, objectKey, request.File.ContentType, publicUrl);
        await _mediaRepository.UpdateAsync(media);

        await SyncMediaTagsAsync(media, request.Tags);
        var hydrated = await _mediaRepository.GetWithDetailsAsync(media.Id) ?? media;
        return await MapToDtoAsync(hydrated, userId);
    }

    public async Task<MediaItemDto> GetMediaAsync(Guid mediaId, Guid userId)
    {
        var media = await _mediaRepository.GetWithDetailsAsync(mediaId);
        if (media == null || media.Status == MediaStatus.Deleted)
        {
            throw new NotFoundException("Media not found.");
        }

        if (media.Visibility == MediaVisibility.Private && media.UserId != userId)
        {
            throw new UnauthorizedException("You don't have permission to view this media.");
        }

        await _mediaRepository.TrackViewAsync(mediaId, userId);
        return await MapToDtoAsync(media, userId);
    }

    public async Task<MediaItemDto> UpdateMediaAsync(Guid mediaId, UpdateMediaRequest request, Guid userId)
    {
        var media = await _mediaRepository.GetWithDetailsAsync(mediaId);
        if (media == null || media.Status == MediaStatus.Deleted)
        {
            throw new NotFoundException("Media not found.");
        }

        if (media.UserId != userId)
        {
            throw new UnauthorizedException("You don't have permission to update this media.");
        }

        if (!string.IsNullOrWhiteSpace(request.Title))
        {
            media.Title = request.Title.Trim();
        }

        if (request.Description != null)
        {
            media.Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
        }

        if (!string.IsNullOrWhiteSpace(request.Visibility))
        {
            media.Visibility = ResolveVisibility(request.Visibility);
        }

        await _mediaRepository.UpdateAsync(media);
        await SyncMediaTagsAsync(media, request.Tags);

        var updated = await _mediaRepository.GetWithDetailsAsync(mediaId) ?? media;
        return await MapToDtoAsync(updated, userId);
    }

    public async Task<bool> DeleteMediaAsync(Guid mediaId, Guid userId)
    {
        var media = await _mediaRepository.GetByIdAsync(mediaId);
        if (media == null || media.IsDeleted)
        {
            throw new NotFoundException("Media not found.");
        }

        if (media.UserId != userId)
        {
            throw new UnauthorizedException("You don't have permission to delete this media.");
        }

        if (!string.IsNullOrWhiteSpace(media.FilePath) && File.Exists(media.FilePath))
        {
            File.Delete(media.FilePath);
        }

        var objectKey = TryReadString(media.Metadata, "objectKey");
        if (!string.IsNullOrWhiteSpace(objectKey))
        {
            await _blobStorageService.DeleteAsync(objectKey);
        }

        media.Status = MediaStatus.Deleted;
        await _mediaRepository.UpdateAsync(media);
        return true;
    }

    public async Task<IEnumerable<MediaItemDto>> GetUserMediaAsync(Guid userId, int page, int pageSize)
    {
        var mediaItems = await _mediaRepository.GetUserMediaAsync(userId, page, pageSize);
        var list = new List<MediaItemDto>(mediaItems.Count);
        foreach (var item in mediaItems)
        {
            list.Add(await MapToDtoAsync(item, userId));
        }

        return list;
    }

    public async Task<IEnumerable<MediaItemDto>> SearchMediaAsync(MediaSearchRequest searchRequest, Guid userId)
    {
        var mediaItems = await _mediaRepository.SearchAsync(searchRequest, userId);
        var list = new List<MediaItemDto>(mediaItems.Count);
        foreach (var item in mediaItems)
        {
            list.Add(await MapToDtoAsync(item, userId));
        }

        return list;
    }

    public async Task<MediaStreamDto> GetMediaStreamAsync(Guid mediaId, long? startByte = null, long? endByte = null)
    {
        var media = await _mediaRepository.GetByIdAsync(mediaId);
        if (media == null || media.Status != MediaStatus.Ready || media.IsDeleted)
        {
            throw new NotFoundException("Media not found.");
        }

        var streamDto = new MediaStreamDto
        {
            FilePath = media.FilePath,
            MimeType = media.MimeType,
            FileSize = media.FileSize,
            LastModified = media.UpdatedAt,
            Url = media.FileUrl,
            ObjectKey = TryReadString(media.Metadata, "objectKey"),
            PublicUrl = TryReadString(media.Metadata, "publicUrl")
        };

        if (startByte.HasValue && endByte.HasValue)
        {
            streamDto.ContentRange = $"bytes {startByte.Value}-{endByte.Value}/{media.FileSize}";
            streamDto.StartByte = startByte;
            streamDto.EndByte = endByte;
        }

        return streamDto;
    }

    public async Task<MediaItemDto> LikeMediaAsync(Guid mediaId, Guid userId)
    {
        var media = await _mediaRepository.GetWithDetailsAsync(mediaId) ?? throw new NotFoundException("Media not found.");
        await _mediaRepository.LikeAsync(mediaId, userId);
        return await MapToDtoAsync(media, userId);
    }

    public async Task<bool> UnlikeMediaAsync(Guid mediaId, Guid userId)
    {
        var media = await _mediaRepository.GetByIdAsync(mediaId) ?? throw new NotFoundException("Media not found.");
        await _mediaRepository.UnlikeAsync(media.Id, userId);
        return true;
    }

    public async Task<bool> BookmarkMediaAsync(Guid mediaId, Guid userId)
    {
        var media = await _mediaRepository.GetByIdAsync(mediaId) ?? throw new NotFoundException("Media not found.");
        await _mediaRepository.BookmarkAsync(media.Id, userId);
        return true;
    }

    public async Task<bool> UnbookmarkMediaAsync(Guid mediaId, Guid userId)
    {
        var media = await _mediaRepository.GetByIdAsync(mediaId) ?? throw new NotFoundException("Media not found.");
        await _mediaRepository.UnbookmarkAsync(media.Id, userId);
        return true;
    }

    public async Task<PlaylistDto> CreatePlaylistAsync(CreatePlaylistRequest request, Guid userId)
    {
        var user = await _userRepository.GetByIdAsync(userId) ?? throw new NotFoundException("User not found.");
        var playlist = new MediaPlaylist
        {
            Name = request.Name.Trim(),
            Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim(),
            UserId = userId,
            Type = PlaylistType.Custom,
            Visibility = ResolvePlaylistVisibility(request.Visibility),
            ItemCount = 0
        };

        await _playlistRepository.AddAsync(playlist);
        playlist.User = user;
        return await MapPlaylistToDtoAsync(playlist, userId);
    }

    public async Task<PlaylistDto> GetPlaylistAsync(Guid playlistId, Guid userId)
    {
        var playlist = await _playlistRepository.GetWithItemsAsync(playlistId) ?? throw new NotFoundException("Playlist not found.");
        if (playlist.Visibility == PlaylistVisibility.Private && playlist.UserId != userId)
        {
            throw new UnauthorizedException("You don't have permission to view this playlist.");
        }

        return await MapPlaylistToDtoAsync(playlist, userId);
    }

    public async Task<PlaylistDto> UpdatePlaylistAsync(Guid playlistId, CreatePlaylistRequest request, Guid userId)
    {
        var playlist = await _playlistRepository.GetWithItemsAsync(playlistId) ?? throw new NotFoundException("Playlist not found.");
        if (playlist.UserId != userId)
        {
            throw new UnauthorizedException("You don't have permission to update this playlist.");
        }

        playlist.Name = request.Name.Trim();
        playlist.Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
        playlist.Visibility = ResolvePlaylistVisibility(request.Visibility);
        await _playlistRepository.UpdateAsync(playlist);

        var updated = await _playlistRepository.GetWithItemsAsync(playlistId) ?? playlist;
        return await MapPlaylistToDtoAsync(updated, userId);
    }

    public async Task<bool> DeletePlaylistAsync(Guid playlistId, Guid userId)
    {
        var playlist = await _playlistRepository.GetByIdAsync(playlistId) ?? throw new NotFoundException("Playlist not found.");
        if (playlist.UserId != userId)
        {
            throw new UnauthorizedException("You don't have permission to delete this playlist.");
        }

        await _playlistRepository.DeleteAsync(playlist);
        return true;
    }

    public async Task<PlaylistDto> AddToPlaylistAsync(Guid playlistId, AddToPlaylistRequest request, Guid userId)
    {
        var playlist = await _playlistRepository.GetWithItemsAsync(playlistId) ?? throw new NotFoundException("Playlist not found.");
        if (playlist.UserId != userId)
        {
            throw new UnauthorizedException("You don't have permission to modify this playlist.");
        }

        var media = await _mediaRepository.GetByIdAsync(request.MediaId) ?? throw new NotFoundException("Media not found.");
        var existing = playlist.Items.FirstOrDefault(x => x.MediaId == request.MediaId && !x.IsDeleted);
        if (existing == null)
        {
            var nextIndex = playlist.Items.Count == 0 ? 0 : playlist.Items.Max(x => x.OrderIndex) + 1;
            var item = new MediaPlaylistItem
            {
                PlaylistId = playlistId,
                MediaId = request.MediaId,
                OrderIndex = nextIndex,
                AddedAt = DateTime.UtcNow
            };
            await _dbContext.MediaPlaylistItems.AddAsync(item);
            playlist.ItemCount += 1;
            playlist.UpdatedAt = DateTime.UtcNow;
            await _dbContext.SaveChangesAsync();
        }

        _ = media;
        var updated = await _playlistRepository.GetWithItemsAsync(playlistId) ?? playlist;
        return await MapPlaylistToDtoAsync(updated, userId);
    }

    public async Task<bool> RemoveFromPlaylistAsync(Guid playlistId, Guid mediaId, Guid userId)
    {
        var playlist = await _playlistRepository.GetWithItemsAsync(playlistId) ?? throw new NotFoundException("Playlist not found.");
        if (playlist.UserId != userId)
        {
            throw new UnauthorizedException("You don't have permission to modify this playlist.");
        }

        var item = playlist.Items.FirstOrDefault(x => x.MediaId == mediaId && !x.IsDeleted);
        if (item == null)
        {
            return true;
        }

        _dbContext.MediaPlaylistItems.Remove(item);
        playlist.ItemCount = Math.Max(0, playlist.ItemCount - 1);
        playlist.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync();
        return true;
    }

    public async Task ReorderPlaylistAsync(Guid playlistId, ReorderPlaylistRequest request, Guid userId)
    {
        var playlist = await _playlistRepository.GetWithItemsAsync(playlistId) ?? throw new NotFoundException("Playlist not found.");
        if (playlist.UserId != userId)
        {
            throw new UnauthorizedException("You don't have permission to modify this playlist.");
        }

        var activeItems = playlist.Items
            .Where(x => !x.IsDeleted)
            .OrderBy(x => x.OrderIndex)
            .ToList();
        var oldIndex = activeItems.FindIndex(x => x.MediaId == request.MediaId);
        if (oldIndex < 0)
        {
            throw new NotFoundException("Media item is not in the playlist.");
        }

        var newIndex = Math.Clamp(request.NewIndex, 0, activeItems.Count - 1);
        var target = activeItems[oldIndex];
        activeItems.RemoveAt(oldIndex);
        activeItems.Insert(newIndex, target);

        for (var i = 0; i < activeItems.Count; i++)
        {
            activeItems[i].OrderIndex = i;
            activeItems[i].UpdatedAt = DateTime.UtcNow;
        }

        playlist.UpdatedAt = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync();
    }

    public async Task<IEnumerable<PlaylistDto>> GetUserPlaylistsAsync(Guid userId)
    {
        var playlists = await _playlistRepository.GetByUserIdAsync(userId);
        var list = new List<PlaylistDto>(playlists.Count);
        foreach (var playlist in playlists)
        {
            list.Add(await MapPlaylistToDtoAsync(playlist, userId));
        }

        return list;
    }

    public Task TrackMediaViewAsync(Guid mediaId, Guid userId, int? position = null)
    {
        return _mediaRepository.TrackViewAsync(mediaId, userId, position);
    }

    public async Task<MediaProgressDto> SaveProgressAsync(Guid mediaId, MediaProgressDto progress, Guid userId)
    {
        if (progress.MediaId != mediaId)
        {
            throw new BadRequestException("Route media id and payload media id must match.");
        }

        await _mediaRepository.TrackViewAsync(mediaId, userId, progress.Position);
        return progress;
    }

    public async Task<StreamingStatusDto> GetStreamingStatusAsync(Guid mediaId, Guid userId)
    {
        var media = await _mediaRepository.GetByIdAsync(mediaId) ?? throw new NotFoundException("Media not found.");
        var view = await _mediaRepository.GetLatestViewAsync(mediaId, userId);
        var position = view?.PositionSeconds;
        var duration = media.Duration;
        var progress = duration.HasValue && duration > 0 && position.HasValue
            ? Math.Round((decimal)position.Value / duration.Value * 100m, 2)
            : 0m;

        return new StreamingStatusDto
        {
            Status = media.Status.ToString(),
            CurrentPosition = position,
            Duration = duration,
            IsPlaying = false,
            Progress = progress,
            CurrentTrack = media.Title
        };
    }

    private async Task SyncMediaTagsAsync(MediaItem media, IEnumerable<string>? tags)
    {
        if (tags == null)
        {
            return;
        }

        var current = await _dbContext.MediaItemTags
            .Where(x => x.MediaId == media.Id && !x.IsDeleted)
            .ToListAsync();
        if (current.Count > 0)
        {
            _dbContext.MediaItemTags.RemoveRange(current);
            await _dbContext.SaveChangesAsync();
        }

        var resolvedTags = await _tagRepository.ResolveTagsAsync(tags);
        foreach (var tag in resolvedTags)
        {
            await _dbContext.MediaItemTags.AddAsync(new MediaItemTag
            {
                MediaId = media.Id,
                TagId = tag.Id
            });
        }

        if (resolvedTags.Count > 0)
        {
            await _dbContext.SaveChangesAsync();
        }
    }

    private async Task<MediaItemDto> MapToDtoAsync(MediaItem media, Guid requestUserId)
    {
        var user = media.User;
        if (user == null && media.UserId != Guid.Empty)
        {
            user = await _userRepository.GetByIdAsync(media.UserId);
        }

        var tagNames = media.Tags
            .Where(x => !x.IsDeleted && x.MediaTag != null && !x.MediaTag.IsDeleted)
            .Select(x => x.MediaTag.Name)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        return new MediaItemDto
        {
            Id = media.Id,
            Title = media.Title,
            Description = media.Description,
            MediaType = media.MediaType.ToString(),
            Status = media.Status.ToString(),
            FileName = media.FileName,
            FileUrl = media.FileUrl,
            MimeType = media.MimeType,
            FileSize = media.FileSize,
            Width = media.Width,
            Height = media.Height,
            Duration = media.Duration,
            ThumbnailUrl = media.ThumbnailUrl,
            PreviewUrl = media.PreviewUrl,
            Visibility = media.Visibility.ToString(),
            Views = media.Views,
            Downloads = media.Downloads,
            Plays = media.Plays,
            UserId = media.UserId,
            UserName = user?.DisplayName ?? user?.Username ?? string.Empty,
            UserAvatar = user?.AvatarUrl,
            CreatedAt = media.CreatedAt,
            Tags = tagNames,
            CommentsCount = media.Comments.Count(x => !x.IsDeleted && !x.IsSoftDeleted),
            IsLiked = requestUserId != Guid.Empty && await _mediaRepository.IsLikedAsync(media.Id, requestUserId),
            IsBookmarked = requestUserId != Guid.Empty && await _mediaRepository.IsBookmarkedAsync(media.Id, requestUserId)
        };
    }

    private async Task<PlaylistDto> MapPlaylistToDtoAsync(MediaPlaylist playlist, Guid userId)
    {
        var owner = playlist.User;
        if (owner == null && playlist.UserId != Guid.Empty)
        {
            owner = await _userRepository.GetByIdAsync(playlist.UserId);
        }

        var orderedItems = playlist.Items
            .Where(x => !x.IsDeleted && !x.MediaItem.IsDeleted && x.MediaItem.Status == MediaStatus.Ready)
            .OrderBy(x => x.OrderIndex)
            .ToList();

        var mediaDtos = new List<MediaItemDto>(orderedItems.Count);
        foreach (var item in orderedItems)
        {
            mediaDtos.Add(await MapToDtoAsync(item.MediaItem, userId));
        }

        return new PlaylistDto
        {
            Id = playlist.Id,
            Name = playlist.Name,
            Description = playlist.Description,
            Type = playlist.Type.ToString(),
            Visibility = playlist.Visibility.ToString(),
            CoverImageUrl = playlist.CoverImageUrl,
            ItemCount = playlist.ItemCount,
            Plays = playlist.Plays,
            UserId = playlist.UserId,
            UserName = owner?.DisplayName ?? owner?.Username ?? string.Empty,
            CreatedAt = playlist.CreatedAt,
            Items = mediaDtos
        };
    }

    private static MediaType ResolveMediaType(string? mediaTypeRaw, string fileName, string? contentType)
    {
        if (!string.IsNullOrWhiteSpace(mediaTypeRaw) &&
            Enum.TryParse<MediaType>(mediaTypeRaw, true, out var parsed))
        {
            return parsed;
        }

        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        if (extension is ".jpg" or ".jpeg" or ".png" or ".webp" or ".gif")
        {
            return MediaType.Photo;
        }

        if (extension is ".mp4" or ".mov" or ".webm" or ".avi" or ".mkv")
        {
            return MediaType.Video;
        }

        if (extension is ".mp3" or ".wav" or ".m4a" or ".aac" or ".ogg" or ".flac")
        {
            return MediaType.Music;
        }

        if (!string.IsNullOrWhiteSpace(contentType) && contentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase))
        {
            return MediaType.Photo;
        }

        if (!string.IsNullOrWhiteSpace(contentType) && contentType.StartsWith("video/", StringComparison.OrdinalIgnoreCase))
        {
            return MediaType.Video;
        }

        if (!string.IsNullOrWhiteSpace(contentType) && contentType.StartsWith("audio/", StringComparison.OrdinalIgnoreCase))
        {
            return MediaType.Music;
        }

        return MediaType.Document;
    }

    private static MediaVisibility ResolveVisibility(string? visibilityRaw)
    {
        return Enum.TryParse<MediaVisibility>(visibilityRaw ?? string.Empty, true, out var visibility)
            ? visibility
            : MediaVisibility.Private;
    }

    private static PlaylistVisibility ResolvePlaylistVisibility(string? visibilityRaw)
    {
        return Enum.TryParse<PlaylistVisibility>(visibilityRaw ?? string.Empty, true, out var visibility)
            ? visibility
            : PlaylistVisibility.Private;
    }

    private static JsonDocument? BuildMetadata(JsonDocument? metadata, string objectKey, string? contentType, string? publicUrl = null)
    {
        var dictionary = new Dictionary<string, object?>
        {
            ["objectKey"] = objectKey,
            ["contentType"] = contentType
        };

        if (!string.IsNullOrWhiteSpace(publicUrl))
        {
            dictionary["publicUrl"] = publicUrl;
        }

        if (metadata != null && metadata.RootElement.ValueKind == JsonValueKind.Object)
        {
            foreach (var property in metadata.RootElement.EnumerateObject())
            {
                dictionary[property.Name] = property.Value.ValueKind switch
                {
                    JsonValueKind.String => property.Value.GetString(),
                    JsonValueKind.Number => property.Value.TryGetInt32(out var intValue) ? intValue : property.Value.GetDouble(),
                    JsonValueKind.True => true,
                    JsonValueKind.False => false,
                    _ => property.Value.ToString()
                };
            }
        }

        return JsonSerializer.SerializeToDocument(dictionary);
    }

    private static int? TryReadInt(JsonDocument? metadata, string propertyName)
    {
        if (metadata == null || metadata.RootElement.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        if (!metadata.RootElement.TryGetProperty(propertyName, out var value))
        {
            return null;
        }

        if (value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var intValue))
        {
            return intValue;
        }

        if (value.ValueKind == JsonValueKind.String && int.TryParse(value.GetString(), out var parsed))
        {
            return parsed;
        }

        return null;
    }

    private static string? TryReadString(JsonDocument? metadata, string propertyName)
    {
        if (metadata == null || metadata.RootElement.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        return metadata.RootElement.TryGetProperty(propertyName, out var value) ? value.ToString() : null;
    }
}
