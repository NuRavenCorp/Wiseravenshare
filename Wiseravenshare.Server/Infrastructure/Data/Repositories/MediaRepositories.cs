using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.DTOs;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Interfaces.Repositories;

namespace Wiseravenshare.Server.Infrastructure.Data.Repositories;

public sealed class MediaRepository : Repository<MediaItem>, IMediaRepository
{
    public MediaRepository(AppDbContext context) : base(context)
    {
    }

    public Task<MediaItem?> GetWithDetailsAsync(Guid mediaId)
    {
        return _dbSet
            .Include(x => x.User)
            .Include(x => x.Comments)
            .Include(x => x.Tags)
            .ThenInclude(x => x.MediaTag)
            .FirstOrDefaultAsync(x => x.Id == mediaId && !x.IsDeleted);
    }

    public async Task<IReadOnlyList<MediaItem>> GetUserMediaAsync(Guid userId, int page, int pageSize)
    {
        var safePage = Math.Max(1, page);
        var safePageSize = Math.Clamp(pageSize, 1, 100);

        return await _dbSet
            .AsNoTracking()
            .Include(x => x.User)
            .Include(x => x.Tags)
            .ThenInclude(x => x.MediaTag)
            .Where(x => x.UserId == userId && !x.IsDeleted && x.Status != MediaStatus.Deleted)
            .OrderByDescending(x => x.CreatedAt)
            .Skip((safePage - 1) * safePageSize)
            .Take(safePageSize)
            .ToListAsync();
    }

    public async Task<IReadOnlyList<MediaItem>> SearchAsync(MediaSearchRequest searchRequest, Guid requestingUserId)
    {
        var safePage = Math.Max(1, searchRequest.Page);
        var safePageSize = Math.Clamp(searchRequest.PageSize, 1, 100);
        var query = _dbSet
            .AsNoTracking()
            .Include(x => x.User)
            .Include(x => x.Tags)
            .ThenInclude(x => x.MediaTag)
            .Where(x => !x.IsDeleted && x.Status == MediaStatus.Ready);

        query = query.Where(x =>
            x.UserId == requestingUserId
            || x.Visibility == MediaVisibility.Public
            || x.Visibility == MediaVisibility.Unlisted
            || x.Visibility == MediaVisibility.Shared);

        if (!string.IsNullOrWhiteSpace(searchRequest.Query))
        {
            var term = searchRequest.Query.Trim().ToLowerInvariant();
            query = query.Where(x =>
                x.Title.ToLower().Contains(term)
                || (x.Description != null && x.Description.ToLower().Contains(term)));
        }

        if (!string.IsNullOrWhiteSpace(searchRequest.MediaType) &&
            Enum.TryParse<MediaType>(searchRequest.MediaType, true, out var mediaType))
        {
            query = query.Where(x => x.MediaType == mediaType);
        }

        if (!string.IsNullOrWhiteSpace(searchRequest.Visibility) &&
            Enum.TryParse<MediaVisibility>(searchRequest.Visibility, true, out var visibility))
        {
            query = query.Where(x => x.Visibility == visibility);
        }

        if (searchRequest.UserId.HasValue)
        {
            query = query.Where(x => x.UserId == searchRequest.UserId.Value);
        }

        if (searchRequest.FromDate.HasValue)
        {
            query = query.Where(x => x.CreatedAt >= searchRequest.FromDate.Value);
        }

        if (searchRequest.ToDate.HasValue)
        {
            query = query.Where(x => x.CreatedAt <= searchRequest.ToDate.Value);
        }

        if (searchRequest.Tags is { Count: > 0 })
        {
            var loweredTags = searchRequest.Tags
                .Where(t => !string.IsNullOrWhiteSpace(t))
                .Select(t => t.Trim().ToLowerInvariant())
                .Distinct()
                .ToArray();

            if (loweredTags.Length > 0)
            {
                query = query.Where(x => x.Tags.Any(t => loweredTags.Contains(t.MediaTag.Name.ToLower())));
            }
        }

        var sortBy = searchRequest.SortBy?.Trim();
        var descending = string.Equals(searchRequest.SortOrder, "desc", StringComparison.OrdinalIgnoreCase);

        query = (sortBy, descending) switch
        {
            ("Title", true) => query.OrderByDescending(x => x.Title),
            ("Title", false) => query.OrderBy(x => x.Title),
            ("Views", true) => query.OrderByDescending(x => x.Views),
            ("Views", false) => query.OrderBy(x => x.Views),
            ("FileSize", true) => query.OrderByDescending(x => x.FileSize),
            ("FileSize", false) => query.OrderBy(x => x.FileSize),
            (_, true) => query.OrderByDescending(x => x.CreatedAt),
            _ => query.OrderBy(x => x.CreatedAt)
        };

        return await query
            .Skip((safePage - 1) * safePageSize)
            .Take(safePageSize)
            .ToListAsync();
    }

    public async Task LikeAsync(Guid mediaId, Guid userId)
    {
        var existing = await _context.MediaLikes.FirstOrDefaultAsync(x => x.MediaId == mediaId && x.UserId == userId);
        if (existing is { IsDeleted: false })
        {
            return;
        }

        if (existing is { IsDeleted: true })
        {
            existing.IsDeleted = false;
            existing.DeletedAt = null;
            existing.UpdatedAt = DateTime.UtcNow;
        }
        else
        {
            await _context.MediaLikes.AddAsync(new MediaLike
            {
                MediaId = mediaId,
                UserId = userId
            });
        }

        await _context.SaveChangesAsync();
    }

    public async Task UnlikeAsync(Guid mediaId, Guid userId)
    {
        var likes = await _context.MediaLikes
            .Where(x => x.MediaId == mediaId && x.UserId == userId && !x.IsDeleted)
            .ToListAsync();
        if (likes.Count == 0)
        {
            return;
        }

        foreach (var like in likes)
        {
            like.IsDeleted = true;
            like.DeletedAt = DateTime.UtcNow;
            like.UpdatedAt = DateTime.UtcNow;
        }

        await _context.SaveChangesAsync();
    }

    public async Task BookmarkAsync(Guid mediaId, Guid userId)
    {
        var existing = await _context.MediaBookmarks.FirstOrDefaultAsync(x => x.MediaId == mediaId && x.UserId == userId);
        if (existing is { IsDeleted: false })
        {
            return;
        }

        if (existing is { IsDeleted: true })
        {
            existing.IsDeleted = false;
            existing.DeletedAt = null;
            existing.UpdatedAt = DateTime.UtcNow;
        }
        else
        {
            await _context.MediaBookmarks.AddAsync(new MediaBookmark
            {
                MediaId = mediaId,
                UserId = userId
            });
        }

        await _context.SaveChangesAsync();
    }

    public async Task UnbookmarkAsync(Guid mediaId, Guid userId)
    {
        var bookmarks = await _context.MediaBookmarks
            .Where(x => x.MediaId == mediaId && x.UserId == userId && !x.IsDeleted)
            .ToListAsync();
        if (bookmarks.Count == 0)
        {
            return;
        }

        foreach (var bookmark in bookmarks)
        {
            bookmark.IsDeleted = true;
            bookmark.DeletedAt = DateTime.UtcNow;
            bookmark.UpdatedAt = DateTime.UtcNow;
        }

        await _context.SaveChangesAsync();
    }

    public Task<bool> IsLikedAsync(Guid mediaId, Guid userId)
    {
        return _context.MediaLikes.AnyAsync(x => x.MediaId == mediaId && x.UserId == userId && !x.IsDeleted);
    }

    public Task<bool> IsBookmarkedAsync(Guid mediaId, Guid userId)
    {
        return _context.MediaBookmarks.AnyAsync(x => x.MediaId == mediaId && x.UserId == userId && !x.IsDeleted);
    }

    public async Task TrackViewAsync(Guid mediaId, Guid userId, int? positionSeconds = null)
    {
        var now = DateTime.UtcNow;
        var history = new MediaViewHistory
        {
            MediaId = mediaId,
            UserId = userId,
            PositionSeconds = positionSeconds,
            ViewedAt = now
        };
        await _context.MediaViewHistories.AddAsync(history);

        var media = await _dbSet.FirstOrDefaultAsync(x => x.Id == mediaId && !x.IsDeleted);
        if (media != null)
        {
            media.Views += 1;
            if (media.MediaType is MediaType.Video or MediaType.Music)
            {
                media.Plays += 1;
            }
            media.UpdatedAt = now;
        }

        await _context.SaveChangesAsync();
    }

    public Task<MediaViewHistory?> GetLatestViewAsync(Guid mediaId, Guid userId)
    {
        return _context.MediaViewHistories
            .AsNoTracking()
            .Where(x => x.MediaId == mediaId && x.UserId == userId && !x.IsDeleted)
            .OrderByDescending(x => x.ViewedAt)
            .FirstOrDefaultAsync();
    }
}

public sealed class PlaylistRepository : Repository<MediaPlaylist>, IPlaylistRepository
{
    public PlaylistRepository(AppDbContext context) : base(context)
    {
    }

    public Task<MediaPlaylist?> GetWithItemsAsync(Guid playlistId)
    {
        return _dbSet
            .Include(x => x.User)
            .Include(x => x.Items)
            .ThenInclude(x => x.MediaItem)
            .ThenInclude(x => x.User)
            .Include(x => x.Items)
            .ThenInclude(x => x.MediaItem)
            .ThenInclude(x => x.Tags)
            .ThenInclude(x => x.MediaTag)
            .FirstOrDefaultAsync(x => x.Id == playlistId && !x.IsDeleted);
    }

    public async Task<IReadOnlyList<MediaPlaylist>> GetByUserIdAsync(Guid userId)
    {
        return await _dbSet
            .AsNoTracking()
            .Include(x => x.User)
            .Include(x => x.Items)
            .ThenInclude(x => x.MediaItem)
            .Where(x => x.UserId == userId && !x.IsDeleted)
            .OrderByDescending(x => x.CreatedAt)
            .ToListAsync();
    }
}

public sealed class MediaTagRepository : Repository<MediaTag>, IMediaTagRepository
{
    public MediaTagRepository(AppDbContext context) : base(context)
    {
    }

    public async Task<IReadOnlyList<MediaTag>> ResolveTagsAsync(IEnumerable<string> tagNames)
    {
        var normalizedTags = tagNames
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(25)
            .ToArray();

        if (normalizedTags.Length == 0)
        {
            return [];
        }

        var lowered = normalizedTags.Select(x => x.ToLowerInvariant()).ToArray();
        var existing = await _dbSet
            .Where(x => !x.IsDeleted && lowered.Contains(x.Name.ToLower()))
            .ToListAsync();

        var toCreate = normalizedTags
            .Where(tag => existing.All(e => !string.Equals(e.Name, tag, StringComparison.OrdinalIgnoreCase)))
            .ToArray();

        foreach (var tag in existing)
        {
            tag.UsageCount += 1;
            tag.UpdatedAt = DateTime.UtcNow;
        }

        var created = new List<MediaTag>();
        foreach (var name in toCreate)
        {
            var tag = new MediaTag
            {
                Name = name,
                Type = TagType.User,
                UsageCount = 1
            };
            await _dbSet.AddAsync(tag);
            created.Add(tag);
        }

        if (existing.Count > 0 || created.Count > 0)
        {
            await _context.SaveChangesAsync();
        }

        return existing.Concat(created).ToArray();
    }
}
