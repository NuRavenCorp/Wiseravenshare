// Wiseravenshare.Server.Infrastructure/Data/Repositories/PostRepository.cs
using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Interfaces.Repositories;

namespace Wiseravenshare.Server.Infrastructure.Data.Repositories
{

    public class PostRepository : Repository<Post>, IPostRepository
    {
        public PostRepository(AppDbContext context) : base(context)
        {
        }

        public async Task<IEnumerable<Post>> GetFeedAsync(Guid userId, int page, int pageSize)
        {
            // Get posts from followed users and the user's own posts
            var followingIds = await _context.UserFollows
                .Where(f => f.FollowerId == userId)
                .Select(f => f.FollowingId)
                .ToListAsync();

            followingIds.Add(userId);

            return await _dbSet
                .Where(p => !p.IsDeleted && followingIds.Contains(p.UserId))
                .OrderByDescending(p => p.CreatedAt)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Include(p => p.User)
                .Include(p => p.ReplyTo)
                .Include(p => p.RepostOf)
                .Include(p => p.QuoteOf)
                .ToListAsync();
        }

        public async Task<IEnumerable<Post>> GetUserPostsAsync(Guid userId, int page, int pageSize)
        {
            return await _dbSet
                .Where(p => !p.IsDeleted && p.UserId == userId)
                .OrderByDescending(p => p.CreatedAt)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Include(p => p.User)
                .ToListAsync();
        }

        public async Task<IEnumerable<Post>> GetTrendingPostsAsync(int count)
        {
            return await _dbSet
                .Where(p => !p.IsDeleted && p.CreatedAt > DateTime.UtcNow.AddDays(-7))
                .OrderByDescending(p =>
                    p.LikesCount * 2 +
                    p.RepostsCount * 3 +
                    p.CommentsCount * 1.5 +
                    p.ViewsCount * 0.1)
                .Take(count)
                .Include(p => p.User)
                .ToListAsync();
        }

        public async Task<IEnumerable<Post>> GetRepliesAsync(Guid postId)
        {
            return await _dbSet
                .Where(p => !p.IsDeleted && p.ReplyToId == postId)
                .OrderBy(p => p.CreatedAt)
                .Include(p => p.User)
                .ToListAsync();
        }

        public async Task<int> GetPostCountAsync(Guid userId)
        {
            return await _dbSet
                .CountAsync(p => !p.IsDeleted && p.UserId == userId);
        }

        public async Task LikePostAsync(Guid postId, Guid userId)
        {
            if (await _context.PostLikes.AnyAsync(l => l.PostId == postId && l.UserId == userId))
                return;

            var like = new PostLike { PostId = postId, UserId = userId };
            await _context.PostLikes.AddAsync(like);
            await _context.SaveChangesAsync();
        }

        public async Task UnlikePostAsync(Guid postId, Guid userId)
        {
            var like = await _context.PostLikes
                .FirstOrDefaultAsync(l => l.PostId == postId && l.UserId == userId);

            if (like != null)
            {
                _context.PostLikes.Remove(like);
                await _context.SaveChangesAsync();
            }
        }

        public async Task RepostPostAsync(Guid postId, Guid userId)
        {
            if (await _context.PostReposts.AnyAsync(r => r.PostId == postId && r.UserId == userId))
                return;

            var repost = new PostRepost { PostId = postId, UserId = userId };
            await _context.PostReposts.AddAsync(repost);
            await _context.SaveChangesAsync();
        }

        public async Task UnrepostPostAsync(Guid postId, Guid userId)
        {
            var repost = await _context.PostReposts
                .FirstOrDefaultAsync(r => r.PostId == postId && r.UserId == userId);

            if (repost != null)
            {
                _context.PostReposts.Remove(repost);
                await _context.SaveChangesAsync();
            }
        }

        public async Task BookmarkPostAsync(Guid postId, Guid userId)
        {
            if (await _context.PostBookmarks.AnyAsync(b => b.PostId == postId && b.UserId == userId))
                return;

            var bookmark = new PostBookmark { PostId = postId, UserId = userId };
            await _context.PostBookmarks.AddAsync(bookmark);
            await _context.SaveChangesAsync();
        }

        public async Task UnbookmarkPostAsync(Guid postId, Guid userId)
        {
            var bookmark = await _context.PostBookmarks
                .FirstOrDefaultAsync(b => b.PostId == postId && b.UserId == userId);

            if (bookmark != null)
            {
                _context.PostBookmarks.Remove(bookmark);
                await _context.SaveChangesAsync();
            }
        }
    }
}