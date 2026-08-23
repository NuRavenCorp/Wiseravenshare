// Wiseravenshare.Server.Infrastructure/Data/Repositories/SocialCrossPostRepository.cs
using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Interfaces.Repositories;

namespace Wiseravenshare.Server.Infrastructure.Data.Repositories;

public class SocialCrossPostRepository : Repository<SocialCrossPost>, ISocialCrossPostRepository
{
    public SocialCrossPostRepository(AppDbContext context) : base(context)
    {
    }

    public async Task<IEnumerable<SocialCrossPost>> GetByPostIdAsync(Guid postId)
    {
        return await _dbSet
            .Where(c => c.PostId == postId && !c.IsDeleted)
            .OrderBy(c => c.Platform)
            .ToListAsync();
    }

    public async Task<IEnumerable<SocialCrossPost>> GetByUserIdAsync(Guid userId, int page = 1, int pageSize = 50)
    {
        return await _dbSet
            .Where(c => c.UserId == userId && !c.IsDeleted)
            .OrderByDescending(c => c.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();
    }

    public Task<SocialCrossPost?> GetByPostAndPlatformAsync(Guid postId, string platform)
    {
        return _dbSet.FirstOrDefaultAsync(c =>
            c.PostId == postId &&
            c.Platform == platform.ToLowerInvariant() &&
            !c.IsDeleted);
    }

    /// <summary>
    /// Insert-or-update keyed on (PostId, Platform) so repeated publish attempts
    /// for the same post/platform update the existing row instead of duplicating it.
    /// </summary>
    public async Task UpsertAsync(SocialCrossPost crossPost)
    {
        crossPost.Platform = crossPost.Platform.ToLowerInvariant();
        var existing = await GetByPostAndPlatformAsync(crossPost.PostId, crossPost.Platform);

        if (existing is null)
        {
            await AddAsync(crossPost);
            return;
        }

        existing.Status = crossPost.Status;
        existing.ExternalPostId = crossPost.ExternalPostId ?? existing.ExternalPostId;
        existing.ExternalPostUrl = crossPost.ExternalPostUrl ?? existing.ExternalPostUrl;
        existing.ErrorMessage = crossPost.ErrorMessage;
        existing.PublishedAt = crossPost.PublishedAt ?? existing.PublishedAt;
        existing.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();
    }
}
