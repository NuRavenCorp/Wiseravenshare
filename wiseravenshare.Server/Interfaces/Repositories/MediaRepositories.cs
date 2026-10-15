using Wiseravenshare.Server.DTOs;
using Wiseravenshare.Server.Entities;

namespace Wiseravenshare.Server.Interfaces.Repositories;

public interface IMediaRepository : IRepository<MediaItem>
{
    Task<MediaItem?> GetWithDetailsAsync(Guid mediaId);
    Task<IReadOnlyList<MediaItem>> GetUserMediaAsync(Guid userId, int page, int pageSize);
    Task<IReadOnlyList<MediaItem>> SearchAsync(MediaSearchRequest searchRequest, Guid requestingUserId);
    Task<int> CountUserMediaAsync(Guid userId);
    Task<int> CountSearchAsync(MediaSearchRequest searchRequest, Guid requestingUserId);
    Task<int> CountUserMediaByTypeAsync(Guid userId, MediaType mediaType);
    Task LikeAsync(Guid mediaId, Guid userId);
    Task UnlikeAsync(Guid mediaId, Guid userId);
    Task BookmarkAsync(Guid mediaId, Guid userId);
    Task UnbookmarkAsync(Guid mediaId, Guid userId);
    Task<bool> IsLikedAsync(Guid mediaId, Guid userId);
    Task<bool> IsBookmarkedAsync(Guid mediaId, Guid userId);
    Task TrackViewAsync(Guid mediaId, Guid userId, int? positionSeconds = null);
    Task<MediaViewHistory?> GetLatestViewAsync(Guid mediaId, Guid userId);
    Task UpsertPlaybackStateAsync(Guid mediaId, Guid userId, int positionSeconds, bool isPlaying);
    Task<IReadOnlyDictionary<Guid, int>> GetPlaybackPositionsAsync(Guid userId, IReadOnlyCollection<Guid> mediaIds);
    Task<MediaPlaybackState?> GetPlaybackStateAsync(Guid mediaId, Guid userId);
    Task ClearPlaybackStateAsync(Guid mediaId, Guid userId);
}

public interface IPlaylistRepository : IRepository<MediaPlaylist>
{
    Task<MediaPlaylist?> GetWithItemsAsync(Guid playlistId);
    Task<IReadOnlyList<MediaPlaylist>> GetByUserIdAsync(Guid userId);
}

public interface IMediaTagRepository : IRepository<MediaTag>
{
    Task<IReadOnlyList<MediaTag>> ResolveTagsAsync(IEnumerable<string> tagNames);
}
