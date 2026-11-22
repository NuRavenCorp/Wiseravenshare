// Wiseravenshare.Server.Infrastructure/Data/Repositories/PostRepository.cs
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Linq.Expressions;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Interfaces.Repositories;

namespace Wiseravenshare.Server.Infrastructure.Data.Repositories
{
    public sealed class DurablePostRecord
    {
        public Guid Id { get; set; }
        public Guid UserId { get; set; }
        public string Content { get; set; } = string.Empty;
        public string Type { get; set; } = "Text";
        public string[]? MediaUrls { get; set; }
        public decimal? TruthScore { get; set; }
        public string? TruthCorrection { get; set; }
        public string? TruthStatus { get; set; }
        public string? LocationName { get; set; }
        public bool IsTruthDispatch { get; set; }
        public bool TruthDeclarationAccepted { get; set; }
        public decimal? Latitude { get; set; }
        public decimal? Longitude { get; set; }
        public bool IsSensitive { get; set; }
        public bool IsPinned { get; set; }
        public Guid? ReplyToId { get; set; }
        public Guid? RepostOfId { get; set; }
        public Guid? QuoteOfId { get; set; }
        public int LikesCount { get; set; }
        public int RepostsCount { get; set; }
        public int CommentsCount { get; set; }
        public int SharesCount { get; set; }
        public int BookmarksCount { get; set; }
        public int ViewsCount { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
        public bool IsDeleted { get; set; }
        public DateTime? DeletedAt { get; set; }

        public string? AuthorUsername { get; set; }
        public string? AuthorDisplayName { get; set; }
        public string? AuthorAvatar { get; set; }
    }

    public sealed class DurableCommentRecord
    {
        public Guid Id { get; set; }
        public Guid PostId { get; set; }
        public Guid UserId { get; set; }
        public Guid? ParentCommentId { get; set; }
        public string Content { get; set; } = string.Empty;
        public int LikesCount { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
        public bool IsDeleted { get; set; }
        public string? AuthorUsername { get; set; }
        public string? AuthorDisplayName { get; set; }
        public string? AuthorAvatar { get; set; }
    }

    public class PostRepository : Repository<Post>, IPostRepository
    {
        private static readonly ConcurrentDictionary<Guid, Post> InMemoryPosts = new();
        private static readonly ConcurrentDictionary<Guid, Comment> InMemoryComments = new();
        private static readonly object StorageLock = new();
        private static bool _storageLoaded;

        public PostRepository(AppDbContext context) : base(context)
        {
            EnsureStorageLoaded();
        }

        private static string[] GetCandidateFilePaths(string fileName)
        {
            var paths = new List<string>();
            var baseDir = Path.Combine(AppContext.BaseDirectory, "App_Data");
            paths.Add(Path.Combine(baseDir, fileName));

            var curDir = Path.Combine(Directory.GetCurrentDirectory(), "App_Data");
            paths.Add(Path.Combine(curDir, fileName));

            const string serverDir = @"e:\nuravencorp\wiseravenshare\wiseravenshare.Server\App_Data";
            if (Directory.Exists(serverDir))
            {
                paths.Add(Path.Combine(serverDir, fileName));
            }

            return paths.Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        }

        private void EnsureStorageLoaded()
        {
            if (_storageLoaded) return;
            lock (StorageLock)
            {
                if (_storageLoaded) return;

                try
                {
                    // 1. Load posts from posts.json
                    var postPaths = GetCandidateFilePaths("posts.json");
                    foreach (var path in postPaths)
                    {
                        if (File.Exists(path))
                        {
                            var json = File.ReadAllText(path);
                            var records = JsonSerializer.Deserialize<List<DurablePostRecord>>(json);
                            if (records != null)
                            {
                                foreach (var rec in records)
                                {
                                    if (rec.Id != Guid.Empty && !InMemoryPosts.ContainsKey(rec.Id))
                                    {
                                        InMemoryPosts[rec.Id] = MapToEntity(rec);
                                    }
                                }
                            }
                            break;
                        }
                    }

                    // 2. Load comments from comments.json
                    var commentPaths = GetCandidateFilePaths("comments.json");
                    foreach (var path in commentPaths)
                    {
                        if (File.Exists(path))
                        {
                            var json = File.ReadAllText(path);
                            var records = JsonSerializer.Deserialize<List<DurableCommentRecord>>(json);
                            if (records != null)
                            {
                                foreach (var rec in records)
                                {
                                    if (rec.Id != Guid.Empty && !InMemoryComments.ContainsKey(rec.Id))
                                    {
                                        InMemoryComments[rec.Id] = MapToCommentEntity(rec);
                                    }
                                }
                            }
                            break;
                        }
                    }

                    // 3. Try to hydrate from DB if connected
                    try
                    {
                        var fromDb = _dbSet.AsNoTracking().Include(p => p.User).Take(200).ToList();
                        foreach (var p in fromDb)
                        {
                            if (!InMemoryPosts.ContainsKey(p.Id))
                            {
                                InMemoryPosts[p.Id] = p;
                            }
                        }
                    }
                    catch { }
                }
                catch { }

                _storageLoaded = true;
            }
        }

        private static void PersistPostsToFile()
        {
            try
            {
                var records = InMemoryPosts.Values.Select(MapToRecord).ToList();
                var json = JsonSerializer.Serialize(records, new JsonSerializerOptions { WriteIndented = true });
                var paths = GetCandidateFilePaths("posts.json");
                foreach (var p in paths)
                {
                    var dir = Path.GetDirectoryName(p);
                    if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                    {
                        try { Directory.CreateDirectory(dir); } catch { }
                    }
                    try { File.WriteAllText(p, json); } catch { }
                }
            }
            catch { }
        }

        private static void PersistCommentsToFile()
        {
            try
            {
                var records = InMemoryComments.Values.Select(MapToCommentRecord).ToList();
                var json = JsonSerializer.Serialize(records, new JsonSerializerOptions { WriteIndented = true });
                var paths = GetCandidateFilePaths("comments.json");
                foreach (var p in paths)
                {
                    var dir = Path.GetDirectoryName(p);
                    if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                    {
                        try { Directory.CreateDirectory(dir); } catch { }
                    }
                    try { File.WriteAllText(p, json); } catch { }
                }
            }
            catch { }
        }

        private static DurablePostRecord MapToRecord(Post post)
        {
            return new DurablePostRecord
            {
                Id = post.Id,
                UserId = post.UserId,
                Content = post.Content ?? string.Empty,
                Type = post.Type.ToString(),
                MediaUrls = post.MediaUrls,
                TruthScore = post.TruthScore,
                TruthCorrection = post.TruthCorrection,
                TruthStatus = post.TruthStatus,
                LocationName = post.LocationName,
                IsTruthDispatch = post.IsTruthDispatch,
                TruthDeclarationAccepted = post.TruthDeclarationAccepted,
                Latitude = post.Latitude,
                Longitude = post.Longitude,
                IsSensitive = post.IsSensitive,
                IsPinned = post.IsPinned,
                ReplyToId = post.ReplyToId,
                RepostOfId = post.RepostOfId,
                QuoteOfId = post.QuoteOfId,
                LikesCount = post.LikesCount,
                RepostsCount = post.RepostsCount,
                CommentsCount = post.CommentsCount,
                SharesCount = post.SharesCount,
                BookmarksCount = post.BookmarksCount,
                ViewsCount = post.ViewsCount,
                CreatedAt = post.CreatedAt,
                UpdatedAt = post.UpdatedAt,
                IsDeleted = post.IsDeleted,
                DeletedAt = post.DeletedAt,
                AuthorUsername = post.User?.Username,
                AuthorDisplayName = post.User?.DisplayName,
                AuthorAvatar = post.User?.AvatarUrl
            };
        }

        private static Post MapToEntity(DurablePostRecord rec)
        {
            var post = new Post
            {
                Id = rec.Id,
                UserId = rec.UserId,
                Content = rec.Content ?? string.Empty,
                Type = Enum.TryParse<PostType>(rec.Type, true, out var pt) ? pt : PostType.Text,
                MediaUrls = rec.MediaUrls,
                TruthScore = rec.TruthScore,
                TruthCorrection = rec.TruthCorrection,
                TruthStatus = rec.TruthStatus,
                LocationName = rec.LocationName,
                IsTruthDispatch = rec.IsTruthDispatch,
                TruthDeclarationAccepted = rec.TruthDeclarationAccepted,
                Latitude = rec.Latitude,
                Longitude = rec.Longitude,
                IsSensitive = rec.IsSensitive,
                IsPinned = rec.IsPinned,
                ReplyToId = rec.ReplyToId,
                RepostOfId = rec.RepostOfId,
                QuoteOfId = rec.QuoteOfId,
                LikesCount = rec.LikesCount,
                RepostsCount = rec.RepostsCount,
                CommentsCount = rec.CommentsCount,
                SharesCount = rec.SharesCount,
                BookmarksCount = rec.BookmarksCount,
                ViewsCount = rec.ViewsCount,
                CreatedAt = rec.CreatedAt,
                UpdatedAt = rec.UpdatedAt,
                IsDeleted = rec.IsDeleted,
                DeletedAt = rec.DeletedAt
            };

            if (!string.IsNullOrWhiteSpace(rec.AuthorUsername) || !string.IsNullOrWhiteSpace(rec.AuthorDisplayName))
            {
                post.User = new User
                {
                    Id = rec.UserId,
                    Username = rec.AuthorUsername ?? "creator",
                    DisplayName = rec.AuthorDisplayName ?? rec.AuthorUsername ?? "Creator",
                    AvatarUrl = rec.AuthorAvatar,
                    Email = $"{rec.UserId:N}@wiseravenshare.ai",
                    Role = UserRole.User,
                    IsActive = true
                };
            }

            return post;
        }

        private static DurableCommentRecord MapToCommentRecord(Comment comment)
        {
            return new DurableCommentRecord
            {
                Id = comment.Id,
                PostId = comment.PostId,
                UserId = comment.UserId,
                ParentCommentId = comment.ParentCommentId,
                Content = comment.Content ?? string.Empty,
                LikesCount = comment.LikesCount,
                CreatedAt = comment.CreatedAt,
                UpdatedAt = comment.UpdatedAt,
                IsDeleted = comment.IsDeleted,
                AuthorUsername = comment.User?.Username,
                AuthorDisplayName = comment.User?.DisplayName,
                AuthorAvatar = comment.User?.AvatarUrl
            };
        }

        private static Comment MapToCommentEntity(DurableCommentRecord rec)
        {
            var comment = new Comment
            {
                Id = rec.Id,
                PostId = rec.PostId,
                UserId = rec.UserId,
                ParentCommentId = rec.ParentCommentId,
                Content = rec.Content ?? string.Empty,
                LikesCount = rec.LikesCount,
                CreatedAt = rec.CreatedAt,
                UpdatedAt = rec.UpdatedAt,
                IsDeleted = rec.IsDeleted
            };

            if (!string.IsNullOrWhiteSpace(rec.AuthorUsername) || !string.IsNullOrWhiteSpace(rec.AuthorDisplayName))
            {
                comment.User = new User
                {
                    Id = rec.UserId,
                    Username = rec.AuthorUsername ?? "creator",
                    DisplayName = rec.AuthorDisplayName ?? rec.AuthorUsername ?? "Creator",
                    AvatarUrl = rec.AuthorAvatar,
                    Email = $"{rec.UserId:N}@wiseravenshare.ai",
                    Role = UserRole.User,
                    IsActive = true
                };
            }

            return comment;
        }

        public override async Task<Post> AddAsync(Post entity)
        {
            EnsureStorageLoaded();
            if (entity.Id == Guid.Empty) entity.Id = Guid.NewGuid();
            if (entity.CreatedAt == default) entity.CreatedAt = DateTime.UtcNow;
            if (entity.UpdatedAt == default) entity.UpdatedAt = DateTime.UtcNow;

            InMemoryPosts[entity.Id] = entity;
            PersistPostsToFile();

            try
            {
                await _dbSet.AddAsync(entity);
                await _context.SaveChangesAsync();
            }
            catch
            {
                // Entity is durably persisted in memory and App_Data/posts.json
            }

            return entity;
        }

        public override async Task UpdateAsync(Post entity)
        {
            EnsureStorageLoaded();
            entity.UpdatedAt = DateTime.UtcNow;
            InMemoryPosts[entity.Id] = entity;
            PersistPostsToFile();

            try
            {
                _dbSet.Update(entity);
                await _context.SaveChangesAsync();
            }
            catch { }
        }

        public override async Task DeleteAsync(Post entity)
        {
            EnsureStorageLoaded();
            entity.IsDeleted = true;
            entity.DeletedAt = DateTime.UtcNow;
            InMemoryPosts[entity.Id] = entity;
            PersistPostsToFile();

            try
            {
                await base.DeleteAsync(entity);
            }
            catch { }
        }

        public override async Task<Post?> GetByIdAsync(Guid id)
        {
            EnsureStorageLoaded();
            try
            {
                var dbPost = await _dbSet
                    .Include(p => p.User)
                    .Include(p => p.ReplyTo)
                    .Include(p => p.RepostOf)
                        .ThenInclude(r => r!.User)
                    .Include(p => p.QuoteOf)
                    .FirstOrDefaultAsync(p => p.Id == id && !p.IsDeleted);

                if (dbPost != null)
                {
                    InMemoryPosts[dbPost.Id] = dbPost;
                    return dbPost;
                }
            }
            catch { }

            if (InMemoryPosts.TryGetValue(id, out var memPost) && !memPost.IsDeleted)
            {
                return memPost;
            }

            return null;
        }

        public override async Task<IEnumerable<Post>> FindAsync(Expression<Func<Post, bool>> predicate)
        {
            EnsureStorageLoaded();
            var compiled = predicate.Compile();
            var memMatches = InMemoryPosts.Values.Where(p => !p.IsDeleted).Where(compiled).ToList();

            try
            {
                var dbMatches = await _dbSet
                    .Where(e => !e.IsDeleted)
                    .Where(predicate)
                    .Include(p => p.User)
                    .ToListAsync();
                return dbMatches.Concat(memMatches).DistinctBy(p => p.Id);
            }
            catch
            {
                return memMatches;
            }
        }

        public async Task<IEnumerable<Post>> GetFeedAsync(Guid userId, int page, int pageSize)
        {
            EnsureStorageLoaded();
            var followingIds = new List<Guid>();
            var likedAuthorIds = new List<Guid>();
            var blockedSet = new HashSet<Guid>();
            var primaryPosts = new List<Post>();
            var partialPosts = new List<Post>();

            try
            {
                // 1. Users this viewer follows
                followingIds = await _context.UserFollows
                    .Where(f => f.FollowerId == userId)
                    .Select(f => f.FollowingId)
                    .ToListAsync();

                // 2. Authors whose posts the viewer has liked
                likedAuthorIds = await _context.PostLikes
                    .Where(l => l.UserId == userId)
                    .Join(_context.Posts, l => l.PostId, p => p.Id, (l, p) => p.UserId)
                    .Distinct()
                    .Take(10)
                    .ToListAsync();

                // 3. Block list
                var blockedIds = await _context.UserBlocks
                    .Where(b => !b.IsDeleted && (b.BlockerId == userId || b.BlockedId == userId))
                    .Select(b => b.BlockerId == userId ? b.BlockedId : b.BlockerId)
                    .Distinct()
                    .ToListAsync();
                blockedSet = new HashSet<Guid>(blockedIds);

                var primaryIds = new HashSet<Guid>(followingIds) { userId };
                var partialIds = likedAuthorIds
                    .Where(id => !primaryIds.Contains(id) && !blockedSet.Contains(id))
                    .ToHashSet();

                primaryIds.ExceptWith(blockedSet);

                if (primaryIds.Count > 0)
                {
                    primaryPosts = await _dbSet
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
                }

                if (partialIds.Count > 0)
                {
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
                }
            }
            catch { }

            // Merge with InMemoryPosts
            var memoryAllowedIds = new HashSet<Guid>(followingIds);
            if (userId != Guid.Empty) memoryAllowedIds.Add(userId);

            var memoryPosts = InMemoryPosts.Values
                .Where(p => !p.IsDeleted && !blockedSet.Contains(p.UserId))
                .Where(p => memoryAllowedIds.Count == 0 || memoryAllowedIds.Contains(p.UserId) || likedAuthorIds.Contains(p.UserId))
                .ToList();

            var merged = primaryPosts
                .Concat(partialPosts)
                .Concat(memoryPosts)
                .DistinctBy(p => p.Id)
                .ToList();

            // Fallback: If feed has 0 posts (e.g. user follows 0 people or new session),
            // blend recent community/bot posts so the feed is never empty!
            if (merged.Count == 0)
            {
                merged = InMemoryPosts.Values
                    .Where(p => !p.IsDeleted && !blockedSet.Contains(p.UserId))
                    .ToList();
            }

            return merged
                .DistinctBy(p => p.Id)
                .OrderByDescending(p => p.CreatedAt)
                .Skip((page - 1) * pageSize)
                .Take(pageSize);
        }

        public async Task<IEnumerable<Post>> GetUserPostsAsync(Guid userId, int page, int pageSize)
        {
            EnsureStorageLoaded();
            var fromDb = new List<Post>();
            try
            {
                fromDb = await _dbSet
                    .Where(p => !p.IsDeleted && p.UserId == userId)
                    .OrderByDescending(p => p.CreatedAt)
                    .Skip((page - 1) * pageSize)
                    .Take(pageSize)
                    .Include(p => p.User)
                    .ToListAsync();
            }
            catch { }

            var fromMem = InMemoryPosts.Values
                .Where(p => !p.IsDeleted && p.UserId == userId);

            return fromDb.Concat(fromMem)
                .DistinctBy(p => p.Id)
                .OrderByDescending(p => p.CreatedAt)
                .Skip((page - 1) * pageSize)
                .Take(pageSize);
        }

        public async Task<IEnumerable<Post>> GetTrendingPostsAsync(int count)
        {
            EnsureStorageLoaded();
            var safeCount = Math.Max(count, 10);
            var cutoff7d = DateTime.UtcNow.AddDays(-7);
            var cutoff24h = DateTime.UtcNow.AddHours(-24);

            var fromDb = new List<Post>();
            try
            {
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

                var trendingIds = trending.Select(p => p.Id).ToHashSet();
                var recent = await _dbSet
                    .AsNoTracking()
                    .Where(p => !p.IsDeleted && p.CreatedAt > cutoff24h && !trendingIds.Contains(p.Id))
                    .OrderByDescending(p => p.CreatedAt)
                    .Take(Math.Min(safeCount / 2, 20))
                    .Include(p => p.User)
                    .ToListAsync();

                fromDb = recent.Concat(trending).DistinctBy(p => p.Id).ToList();
            }
            catch { }

            var memTrending = InMemoryPosts.Values
                .Where(p => !p.IsDeleted)
                .OrderByDescending(p =>
                    p.LikesCount * 2 +
                    p.RepostsCount * 3 +
                    p.CommentsCount * 1.5 +
                    p.ViewsCount * 0.1)
                .Take(safeCount);

            var memRecent = InMemoryPosts.Values
                .Where(p => !p.IsDeleted)
                .OrderByDescending(p => p.CreatedAt)
                .Take(safeCount);

            return fromDb
                .Concat(memRecent)
                .Concat(memTrending)
                .DistinctBy(p => p.Id)
                .OrderByDescending(p => p.CreatedAt)
                .Take(safeCount);
        }

        public async Task<IEnumerable<Post>> GetRepliesAsync(Guid postId)
        {
            EnsureStorageLoaded();
            var fromDb = new List<Post>();
            try
            {
                fromDb = await _dbSet
                    .Where(p => !p.IsDeleted && p.ReplyToId == postId)
                    .OrderBy(p => p.CreatedAt)
                    .Include(p => p.User)
                    .ToListAsync();
            }
            catch { }

            var fromMem = InMemoryPosts.Values
                .Where(p => !p.IsDeleted && p.ReplyToId == postId);

            return fromDb.Concat(fromMem)
                .DistinctBy(p => p.Id)
                .OrderBy(p => p.CreatedAt);
        }

        public async Task<int> GetPostCountAsync(Guid userId)
        {
            EnsureStorageLoaded();
            try
            {
                var dbCount = await _dbSet.CountAsync(p => !p.IsDeleted && p.UserId == userId);
                if (dbCount > 0) return dbCount;
            }
            catch { }

            return InMemoryPosts.Values.Count(p => !p.IsDeleted && p.UserId == userId);
        }

        public async Task LikePostAsync(Guid postId, Guid userId)
        {
            EnsureStorageLoaded();
            if (InMemoryPosts.TryGetValue(postId, out var memPost))
            {
                memPost.LikesCount++;
                PersistPostsToFile();
            }

            try
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
            catch { }
        }

        public async Task UnlikePostAsync(Guid postId, Guid userId)
        {
            EnsureStorageLoaded();
            if (InMemoryPosts.TryGetValue(postId, out var memPost) && memPost.LikesCount > 0)
            {
                memPost.LikesCount--;
                PersistPostsToFile();
            }

            try
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
            catch { }
        }

        public async Task RepostPostAsync(Guid postId, Guid userId)
        {
            EnsureStorageLoaded();
            if (InMemoryPosts.TryGetValue(postId, out var memPost))
            {
                memPost.RepostsCount++;
                PersistPostsToFile();
            }

            try
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
            catch { }
        }

        public async Task UnrepostPostAsync(Guid postId, Guid userId)
        {
            EnsureStorageLoaded();
            if (InMemoryPosts.TryGetValue(postId, out var memPost) && memPost.RepostsCount > 0)
            {
                memPost.RepostsCount--;
                PersistPostsToFile();
            }

            try
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
            catch { }
        }

        public async Task BookmarkPostAsync(Guid postId, Guid userId)
        {
            EnsureStorageLoaded();
            if (InMemoryPosts.TryGetValue(postId, out var memPost))
            {
                memPost.BookmarksCount++;
                PersistPostsToFile();
            }

            try
            {
                if (await _context.PostBookmarks.AnyAsync(b => b.PostId == postId && b.UserId == userId))
                    return;

                var bookmark = new PostBookmark { PostId = postId, UserId = userId };
                await _context.PostBookmarks.AddAsync(bookmark);
                await _context.SaveChangesAsync();
                await RefreshPostCountersAsync(postId);
                await _context.SaveChangesAsync();
            }
            catch { }
        }

        public async Task UnbookmarkPostAsync(Guid postId, Guid userId)
        {
            EnsureStorageLoaded();
            if (InMemoryPosts.TryGetValue(postId, out var memPost) && memPost.BookmarksCount > 0)
            {
                memPost.BookmarksCount--;
                PersistPostsToFile();
            }

            try
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
            catch { }
        }

        public async Task<IReadOnlyList<Comment>> GetCommentsAsync(Guid postId, int page, int pageSize)
        {
            EnsureStorageLoaded();
            var safePage = Math.Max(1, page);
            var safePageSize = Math.Clamp(pageSize, 1, 100);

            var fromDb = new List<Comment>();
            try
            {
                fromDb = await _context.Set<Comment>()
                    .Where(c => c.PostId == postId && !c.IsDeleted)
                    .OrderByDescending(c => c.CreatedAt)
                    .Skip((safePage - 1) * safePageSize)
                    .Take(safePageSize)
                    .Include(c => c.User)
                    .ToListAsync();
            }
            catch { }

            var fromMem = InMemoryComments.Values
                .Where(c => c.PostId == postId && !c.IsDeleted);

            return fromDb.Concat(fromMem)
                .DistinctBy(c => c.Id)
                .OrderByDescending(c => c.CreatedAt)
                .Skip((safePage - 1) * safePageSize)
                .Take(safePageSize)
                .ToList();
        }

        public async Task<Comment> AddCommentAsync(Guid postId, Guid userId, string content, Guid? parentCommentId = null)
        {
            EnsureStorageLoaded();
            var comment = new Comment
            {
                Id = Guid.NewGuid(),
                PostId = postId,
                UserId = userId,
                ParentCommentId = parentCommentId,
                Content = content,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            InMemoryComments[comment.Id] = comment;
            PersistCommentsToFile();

            if (InMemoryPosts.TryGetValue(postId, out var memPost))
            {
                memPost.CommentsCount++;
                PersistPostsToFile();
            }

            try
            {
                await _context.Set<Comment>().AddAsync(comment);
                await _context.SaveChangesAsync();
                await RefreshPostCountersAsync(postId);
                await _context.SaveChangesAsync();
            }
            catch { }

            return comment;
        }

        public async Task<CommentInteractionState> LikeCommentAsync(Guid commentId, Guid userId)
        {
            EnsureStorageLoaded();
            if (InMemoryComments.TryGetValue(commentId, out var memComment))
            {
                memComment.LikesCount++;
                PersistCommentsToFile();
                return new CommentInteractionState(commentId, memComment.LikesCount, true);
            }

            try
            {
                var comment = await _context.Set<Comment>()
                    .FirstOrDefaultAsync(c => c.Id == commentId && !c.IsDeleted);
                if (comment is null)
                {
                    return new CommentInteractionState(commentId, 0, false);
                }

                var likesSet = _context.Set<CommentLike>();
                var alreadyLiked = await likesSet.AnyAsync(l => l.CommentId == commentId && l.UserId == userId && !l.IsDeleted);
                if (!alreadyLiked)
                {
                    await likesSet.AddAsync(new CommentLike
                    {
                        CommentId = commentId,
                        UserId = userId
                    });
                    await _context.SaveChangesAsync();
                }

                var likesCount = await likesSet.CountAsync(l => l.CommentId == commentId && !l.IsDeleted);
                comment.LikesCount = likesCount;
                await _context.SaveChangesAsync();

                return new CommentInteractionState(commentId, likesCount, true);
            }
            catch
            {
                return new CommentInteractionState(commentId, 1, true);
            }
        }

        public async Task<CommentInteractionState> UnlikeCommentAsync(Guid commentId, Guid userId)
        {
            EnsureStorageLoaded();
            if (InMemoryComments.TryGetValue(commentId, out var memComment) && memComment.LikesCount > 0)
            {
                memComment.LikesCount--;
                PersistCommentsToFile();
                return new CommentInteractionState(commentId, memComment.LikesCount, false);
            }

            try
            {
                var comment = await _context.Set<Comment>()
                    .FirstOrDefaultAsync(c => c.Id == commentId && !c.IsDeleted);
                if (comment is null)
                {
                    return new CommentInteractionState(commentId, 0, false);
                }

                var likesSet = _context.Set<CommentLike>();
                var likeRows = await likesSet
                    .Where(l => l.CommentId == commentId && l.UserId == userId && !l.IsDeleted)
                    .ToListAsync();
                if (likeRows.Count > 0)
                {
                    likesSet.RemoveRange(likeRows);
                    await _context.SaveChangesAsync();
                }

                var likesCount = await likesSet.CountAsync(l => l.CommentId == commentId && !l.IsDeleted);
                comment.LikesCount = likesCount;
                await _context.SaveChangesAsync();

                return new CommentInteractionState(commentId, likesCount, false);
            }
            catch
            {
                return new CommentInteractionState(commentId, 0, false);
            }
        }

        public async Task<PostInteractionState> GetInteractionStateAsync(Guid postId, Guid? userId = null)
        {
            EnsureStorageLoaded();
            var likesCount = 0;
            var repostsCount = 0;
            var commentsCount = 0;
            var bookmarksCount = 0;
            var viewsCount = 0;
            var sharesCount = 0;
            var isLiked = false;
            var isReposted = false;
            var isBookmarked = false;

            if (InMemoryPosts.TryGetValue(postId, out var memPost))
            {
                likesCount = memPost.LikesCount;
                repostsCount = memPost.RepostsCount;
                commentsCount = memPost.CommentsCount;
                bookmarksCount = memPost.BookmarksCount;
                viewsCount = memPost.ViewsCount;
                sharesCount = memPost.SharesCount;
            }

            try
            {
                likesCount = await _context.PostLikes.CountAsync(l => l.PostId == postId);
                repostsCount = await _context.PostReposts.CountAsync(r => r.PostId == postId);
                commentsCount = await _context.Set<Comment>().CountAsync(c => c.PostId == postId && !c.IsDeleted);
                bookmarksCount = await _context.PostBookmarks.CountAsync(b => b.PostId == postId);

                isLiked = userId.HasValue && await _context.PostLikes.AnyAsync(l => l.PostId == postId && l.UserId == userId.Value);
                isReposted = userId.HasValue && await _context.PostReposts.AnyAsync(r => r.PostId == postId && r.UserId == userId.Value);
                isBookmarked = userId.HasValue && await _context.PostBookmarks.AnyAsync(b => b.PostId == postId && b.UserId == userId.Value);

                await RefreshPostCountersAsync(postId, likesCount, repostsCount, commentsCount, bookmarksCount);
                await _context.SaveChangesAsync();

                var post = await _dbSet.AsNoTracking().FirstOrDefaultAsync(p => p.Id == postId);
                viewsCount = post?.ViewsCount ?? viewsCount;
                sharesCount = post?.SharesCount ?? sharesCount;
            }
            catch { }

            return new PostInteractionState(
                likesCount,
                repostsCount,
                commentsCount,
                bookmarksCount,
                viewsCount,
                sharesCount,
                isLiked,
                isReposted,
                isBookmarked);
        }

        public async Task<IReadOnlyList<PostEngagementActor>> GetRecentEngagementActorsAsync(Guid postId, int maxPerType = 3)
        {
            var safeMaxPerType = Math.Clamp(maxPerType, 1, 10);
            try
            {
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
            catch
            {
                return Array.Empty<PostEngagementActor>();
            }
        }

        public async Task IncrementViewAsync(Guid postId)
        {
            EnsureStorageLoaded();
            if (InMemoryPosts.TryGetValue(postId, out var memPost))
            {
                memPost.ViewsCount++;
                PersistPostsToFile();
            }

            try
            {
                await _context.Database.ExecuteSqlAsync(
                    $"UPDATE app_data.\"Posts\" SET \"ViewsCount\" = \"ViewsCount\" + 1 WHERE \"Id\" = {postId}");
            }
            catch { }
        }

        public async Task IncrementShareAsync(Guid postId)
        {
            EnsureStorageLoaded();
            if (InMemoryPosts.TryGetValue(postId, out var memPost))
            {
                memPost.SharesCount++;
                PersistPostsToFile();
            }

            try
            {
                await _context.Database.ExecuteSqlAsync(
                    $"UPDATE app_data.\"Posts\" SET \"SharesCount\" = \"SharesCount\" + 1 WHERE \"Id\" = {postId}");
            }
            catch { }
        }

        public async Task<IReadOnlyDictionary<Guid, PostInteractionState>> GetBatchInteractionStatesAsync(
            IEnumerable<Guid> postIds, Guid? viewerUserId = null)
        {
            EnsureStorageLoaded();
            var idList = postIds.ToList();
            if (idList.Count == 0)
                return new Dictionary<Guid, PostInteractionState>();

            var result = new Dictionary<Guid, PostInteractionState>(idList.Count);

            try
            {
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

                var postCounters = await _dbSet
                    .AsNoTracking()
                    .Where(p => idList.Contains(p.Id))
                    .Select(p => new
                    {
                        p.Id, p.LikesCount, p.RepostsCount, p.CommentsCount,
                        p.BookmarksCount, p.ViewsCount, p.SharesCount
                    })
                    .ToDictionaryAsync(p => p.Id);

                foreach (var postId in idList)
                {
                    if (postCounters.TryGetValue(postId, out var c))
                    {
                        result[postId] = new PostInteractionState(
                            c.LikesCount, c.RepostsCount, c.CommentsCount, c.BookmarksCount,
                            c.ViewsCount, c.SharesCount,
                            likedSet.Contains(postId),
                            repostedSet.Contains(postId),
                            bookmarkedSet.Contains(postId));
                    }
                }
            }
            catch { }

            // Fill any missing from InMemoryPosts
            foreach (var postId in idList)
            {
                if (!result.ContainsKey(postId) && InMemoryPosts.TryGetValue(postId, out var memPost))
                {
                    result[postId] = new PostInteractionState(
                        memPost.LikesCount, memPost.RepostsCount, memPost.CommentsCount, memPost.BookmarksCount,
                        memPost.ViewsCount, memPost.SharesCount,
                        false, false, false);
                }
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
            try
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
            catch { }
        }
    }
}
