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
            // 1. Users this viewer follows
            var followingIds = await _context.UserFollows
                .Where(f => f.FollowerId == userId)
                .Select(f => f.FollowingId)
                .ToListAsync();

            // 2. Authors whose posts the viewer has liked (partial source — up to 10)
            var likedAuthorIds = await _context.PostLikes
                .Where(l => l.UserId == userId)
                .Join(_context.Posts, l => l.PostId, p => p.Id, (l, p) => p.UserId)
                .Distinct()
                .Take(10)
                .ToListAsync();

            // 3. Block list (both directions — hide blocked users' content AND content from users who blocked the viewer)
            var blockedIds = await _context.UserBlocks
                .Where(b => !b.IsDeleted && (b.BlockerId == userId || b.BlockedId == userId))
                .Select(b => b.BlockerId == userId ? b.BlockedId : b.BlockerId)
                .Distinct()
                .ToListAsync();
            var blockedSet = new HashSet<Guid>(blockedIds);

            // 4. Build the inclusive set: own posts + followed + partial liked-author (if not blocked)
            var primaryIds = new HashSet<Guid>(followingIds) { userId };
            var partialIds = likedAuthorIds
                .Where(id => !primaryIds.Contains(id) && !blockedSet.Contains(id))
                .ToHashSet();

            // Remove any primary source that is blocked
            primaryIds.ExceptWith(blockedSet);

            // Combined allowed authors
            var allAllowedIds = primaryIds.Concat(partialIds).ToHashSet();

            if (allAllowedIds.Count == 0)
            {
                return Enumerable.Empty<Post>();
            }

            // 5. For partial (liked-author) sources, limit to 2 posts each to avoid domination
            var primaryPosts = await _dbSet
                .AsNoTracking()
                .Where(p => !p.IsDeleted && primaryIds.Contains(p.UserId))
                .OrderByDescending(p => p.CreatedAt)
                .Take(pageSize * page)
                .Include(p => p.User)
                .Include(p => p.ReplyTo)
                .Include(p => p.RepostOf)
                    .ThenInclude(r => r!.User)
                .Include(p => p.QuoteOf)
                .ToListAsync();

            IEnumerable<Post> partialPosts = Enumerable.Empty<Post>();
            if (partialIds.Count > 0)
            {
                // Fetch up to 2 recent posts per liked author, total capped
                partialPosts = await _dbSet
                    .AsNoTracking()
                    .Where(p => !p.IsDeleted && partialIds.Contains(p.UserId))
                    .OrderByDescending(p => p.CreatedAt)
                    .Take(partialIds.Count * 2)
                    .Include(p => p.User)
                    .Include(p => p.ReplyTo)
                    .Include(p => p.RepostOf)
                        .ThenInclude(r => r!.User)
                    .Include(p => p.QuoteOf)
                    .ToListAsync();

                // Enforce max 2 per author
                partialPosts = partialPosts
                    .GroupBy(p => p.UserId)
                    .SelectMany(g => g.Take(2));
            }

            // Merge, sort, paginate
            return primaryPosts
                .Concat(partialPosts)
                .DistinctBy(p => p.Id)
                .OrderByDescending(p => p.CreatedAt)
                .Skip((page - 1) * pageSize)
                .Take(pageSize);
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
            var safeCount = Math.Max(count, 10);
            var cutoff7d = DateTime.UtcNow.AddDays(-7);
            var cutoff24h = DateTime.UtcNow.AddHours(-24);

            // Trending: engagement-scored posts from the last 7 days
            var trending = await _dbSet
                .AsNoTracking()
                .Where(p => !p.IsDeleted && p.CreatedAt > cutoff7d)
                .OrderByDescending(p =>
                    p.LikesCount * 2 +
                    p.RepostsCount * 3 +
                    p.CommentsCount * 1.5 +
                    p.ViewsCount * 0.1)
                .Take(safeCount)
                .Include(p => p.User)
                .ToListAsync();

            // Always pull the most recent posts from last 24 h that aren't already in trending,
            // so brand-new zero-engagement posts are never invisible.
            var trendingIds = trending.Select(p => p.Id).ToHashSet();
            var recent = await _dbSet
                .AsNoTracking()
                .Where(p => !p.IsDeleted && p.CreatedAt > cutoff24h && !trendingIds.Contains(p.Id))
                .OrderByDescending(p => p.CreatedAt)
                .Take(Math.Min(safeCount / 2, 20))
                .Include(p => p.User)
                .ToListAsync();

            return recent
                .Concat(trending)
                .DistinctBy(p => p.Id)
                .OrderByDescending(p => p.CreatedAt)
                .Take(safeCount);
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
            {
                await RefreshPostCountersAsync(postId);
                await _context.SaveChangesAsync();
                return;
            }

            var like = new PostLike { PostId = postId, UserId = userId };
            await _context.PostLikes.AddAsync(like);
            await _context.SaveChangesAsync();
            await RefreshPostCountersAsync(postId);
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

            await RefreshPostCountersAsync(postId);
            await _context.SaveChangesAsync();
        }

        public async Task RepostPostAsync(Guid postId, Guid userId)
        {
            if (await _context.PostReposts.AnyAsync(r => r.PostId == postId && r.UserId == userId))
            {
                await RefreshPostCountersAsync(postId);
                await _context.SaveChangesAsync();
                return;
            }

            var repost = new PostRepost { PostId = postId, UserId = userId };
            await _context.PostReposts.AddAsync(repost);
            await _context.SaveChangesAsync();
            await RefreshPostCountersAsync(postId);
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

            await RefreshPostCountersAsync(postId);
            await _context.SaveChangesAsync();
        }

        public async Task BookmarkPostAsync(Guid postId, Guid userId)
        {
            if (await _context.PostBookmarks.AnyAsync(b => b.PostId == postId && b.UserId == userId))
                return;

            var bookmark = new PostBookmark { PostId = postId, UserId = userId };
            await _context.PostBookmarks.AddAsync(bookmark);
            await _context.SaveChangesAsync();
            await RefreshPostCountersAsync(postId);
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
                await RefreshPostCountersAsync(postId);
                await _context.SaveChangesAsync();
            }
        }

        public async Task<IReadOnlyList<Comment>> GetCommentsAsync(Guid postId, int page, int pageSize)
        {
            var safePage = Math.Max(1, page);
            var safePageSize = Math.Clamp(pageSize, 1, 100);

            return await _context.Set<Comment>()
                .Where(c => c.PostId == postId && !c.IsDeleted)
                .OrderByDescending(c => c.CreatedAt)
                .Skip((safePage - 1) * safePageSize)
                .Take(safePageSize)
                .Include(c => c.User)
                .ToListAsync();
        }

        public async Task<Comment> AddCommentAsync(Guid postId, Guid userId, string content, Guid? parentCommentId = null)
        {
            var comment = new Comment
            {
                PostId = postId,
                UserId = userId,
                ParentCommentId = parentCommentId,
                Content = content
            };

            await _context.Set<Comment>().AddAsync(comment);
            await _context.SaveChangesAsync();
            await RefreshPostCountersAsync(postId);
            await _context.SaveChangesAsync();

            await _context.Entry(comment).Reference(c => c.User).LoadAsync();
            return comment;
        }

        public async Task<PostInteractionState> GetInteractionStateAsync(Guid postId, Guid? userId = null)
        {
            var likesCount = await _context.PostLikes.CountAsync(l => l.PostId == postId);
            var repostsCount = await _context.PostReposts.CountAsync(r => r.PostId == postId);
            var commentsCount = await _context.Set<Comment>().CountAsync(c => c.PostId == postId && !c.IsDeleted);
            var bookmarksCount = await _context.PostBookmarks.CountAsync(b => b.PostId == postId);

            var isLiked = userId.HasValue && await _context.PostLikes.AnyAsync(l => l.PostId == postId && l.UserId == userId.Value);
            var isReposted = userId.HasValue && await _context.PostReposts.AnyAsync(r => r.PostId == postId && r.UserId == userId.Value);
            var isBookmarked = userId.HasValue && await _context.PostBookmarks.AnyAsync(b => b.PostId == postId && b.UserId == userId.Value);

            await RefreshPostCountersAsync(postId, likesCount, repostsCount, commentsCount, bookmarksCount);
            await _context.SaveChangesAsync();

            var post = await _dbSet.AsNoTracking().FirstOrDefaultAsync(p => p.Id == postId);

            return new PostInteractionState(
                likesCount,
                repostsCount,
                commentsCount,
                bookmarksCount,
                post?.ViewsCount ?? 0,
                post?.SharesCount ?? 0,
                isLiked,
                isReposted,
                isBookmarked);
        }

        public async Task<IReadOnlyList<PostEngagementActor>> GetRecentEngagementActorsAsync(Guid postId, int maxPerType = 3)
        {
            var safeMaxPerType = Math.Clamp(maxPerType, 1, 10);

            var likes = await _context.PostLikes
                .Where(l => l.PostId == postId)
                .OrderByDescending(l => l.CreatedAt)
                .Take(safeMaxPerType)
                .Select(l => new PostEngagementActor(l.UserId, "like", l.CreatedAt))
                .ToListAsync();

            var comments = await _context.Set<Comment>()
                .Where(c => c.PostId == postId && !c.IsDeleted)
                .OrderByDescending(c => c.CreatedAt)
                .Take(safeMaxPerType)
                .Select(c => new PostEngagementActor(c.UserId, "comment", c.CreatedAt))
                .ToListAsync();

            var reposts = await _context.PostReposts
                .Where(r => r.PostId == postId)
                .OrderByDescending(r => r.CreatedAt)
                .Take(safeMaxPerType)
                .Select(r => new PostEngagementActor(r.UserId, "repost", r.CreatedAt))
                .ToListAsync();

            return likes
                .Concat(comments)
                .Concat(reposts)
                .OrderByDescending(actor => actor.CreatedAt)
                .DistinctBy(actor => new { actor.UserId, actor.EngagementType })
                .ToList();
        }

        public async Task IncrementViewAsync(Guid postId)
        {
            await _context.Database.ExecuteSqlAsync(
                $"UPDATE app_data.\"Posts\" SET \"ViewsCount\" = \"ViewsCount\" + 1 WHERE \"Id\" = {postId}");
        }

        public async Task IncrementShareAsync(Guid postId)
        {
            await _context.Database.ExecuteSqlAsync(
                $"UPDATE app_data.\"Posts\" SET \"SharesCount\" = \"SharesCount\" + 1 WHERE \"Id\" = {postId}");
        }

        public async Task<IReadOnlyDictionary<Guid, PostInteractionState>> GetBatchInteractionStatesAsync(
            IEnumerable<Guid> postIds, Guid? viewerUserId = null)
        {
            var idList = postIds.ToList();
            if (idList.Count == 0)
                return new Dictionary<Guid, PostInteractionState>();

            // 3 viewer-specific queries instead of 6+ per post; no SaveChangesAsync
            var likedSet = viewerUserId.HasValue
                ? new HashSet<Guid>(await _context.PostLikes
                    .Where(l => l.UserId == viewerUserId.Value && idList.Contains(l.PostId))
                    .Select(l => l.PostId).ToListAsync())
                : new HashSet<Guid>();

            var repostedSet = viewerUserId.HasValue
                ? new HashSet<Guid>(await _context.PostReposts
                    .Where(r => r.UserId == viewerUserId.Value && idList.Contains(r.PostId))
                    .Select(r => r.PostId).ToListAsync())
                : new HashSet<Guid>();

            var bookmarkedSet = viewerUserId.HasValue
                ? new HashSet<Guid>(await _context.PostBookmarks
                    .Where(b => b.UserId == viewerUserId.Value && idList.Contains(b.PostId))
                    .Select(b => b.PostId).ToListAsync())
                : new HashSet<Guid>();

            // Read denormalized counters from the Post rows; no counter refresh needed for reads
            var postCounters = await _dbSet
                .AsNoTracking()
                .Where(p => idList.Contains(p.Id))
                .Select(p => new
                {
                    p.Id, p.LikesCount, p.RepostsCount, p.CommentsCount,
                    p.BookmarksCount, p.ViewsCount, p.SharesCount
                })
                .ToDictionaryAsync(p => p.Id);

            var result = new Dictionary<Guid, PostInteractionState>(idList.Count);
            foreach (var postId in idList)
            {
                if (!postCounters.TryGetValue(postId, out var c)) continue;
                result[postId] = new PostInteractionState(
                    c.LikesCount, c.RepostsCount, c.CommentsCount, c.BookmarksCount,
                    c.ViewsCount, c.SharesCount,
                    likedSet.Contains(postId),
                    repostedSet.Contains(postId),
                    bookmarkedSet.Contains(postId));
            }
            return result;
        }

        private async Task RefreshPostCountersAsync(
            Guid postId,
            int? likesCount = null,
            int? repostsCount = null,
            int? commentsCount = null,
            int? bookmarksCount = null)
        {
            var post = await _dbSet.FirstOrDefaultAsync(p => p.Id == postId);
            if (post == null)
            {
                return;
            }

            var resolvedLikesCount = likesCount ?? await _context.PostLikes.CountAsync(l => l.PostId == postId);
            var resolvedRepostsCount = repostsCount ?? await _context.PostReposts.CountAsync(r => r.PostId == postId);
            var resolvedCommentsCount = commentsCount ?? await _context.Set<Comment>().CountAsync(c => c.PostId == postId && !c.IsDeleted);
            var resolvedBookmarksCount = bookmarksCount ?? await _context.PostBookmarks.CountAsync(b => b.PostId == postId);

            post.LikesCount = resolvedLikesCount;
            post.RepostsCount = resolvedRepostsCount;
            post.CommentsCount = resolvedCommentsCount;
            post.BookmarksCount = resolvedBookmarksCount;
        }
    }
}