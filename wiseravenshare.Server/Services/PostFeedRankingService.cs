using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Entities.Personalization;
using Wiseravenshare.Server.Infrastructure.Data;

namespace Wiseravenshare.Server.Services;

public interface IPostFeedRankingService
{
    Task<IReadOnlyList<Post>> GenerateFeedAsync(Guid userId, int page, int pageSize, CancellationToken cancellationToken = default);
}

public sealed class PostFeedRankingService : IPostFeedRankingService
{
    private static readonly Regex HashtagRegex = new(@"#([a-zA-Z0-9_]{2,64})", RegexOptions.Compiled);
    private static readonly HashSet<string> StopWords = new(StringComparer.OrdinalIgnoreCase)
    {
        "the", "and", "for", "with", "this", "that", "from", "have", "will", "your", "about", "into",
        "just", "they", "them", "there", "their", "then", "than", "when", "what", "where", "which",
        "been", "were", "also", "more", "most", "some", "very", "over", "such", "only", "than", "into"
    };

    private readonly AppDbContext _db;
    private readonly ILogger<PostFeedRankingService> _logger;

    public PostFeedRankingService(AppDbContext db, ILogger<PostFeedRankingService> logger)
    {
        _db = db;
        _logger = logger;
    }

    public async Task<IReadOnlyList<Post>> GenerateFeedAsync(Guid userId, int page, int pageSize, CancellationToken cancellationToken = default)
    {
        var safePage = Math.Max(1, page);
        var safePageSize = Math.Clamp(pageSize, 1, 100);

        var nowUtc = DateTime.UtcNow;
        var ctx = await BuildViewerContextAsync(userId, nowUtc, cancellationToken);
        var candidates = await GatherCandidatesAsync(userId, ctx, nowUtc, cancellationToken);
        if (candidates.NewPosts.Count == 0 && candidates.OldPosts.Count == 0)
        {
            return Array.Empty<Post>();
        }

        var allCandidates = candidates.NewPosts
            .Concat(candidates.OldPosts)
            .DistinctBy(p => p.Id)
            .ToList();
        var candidatePostIds = allCandidates.Select(post => post.Id).ToList();

        var completionCountByPost = await _db.UserInteractionEvents
            .AsNoTracking()
            .Where(e =>
                e.TargetId.HasValue &&
                e.TargetType == "post" &&
                e.Type == InteractionEventType.Complete &&
                candidatePostIds.Contains(e.TargetId.Value))
            .GroupBy(e => e.TargetId!.Value)
            .Select(group => new { PostId = group.Key, Count = group.Count() })
            .ToDictionaryAsync(item => item.PostId, item => item.Count, cancellationToken);

        var userFollowingSet = ctx.FollowingIds;
        var authorIds = allCandidates.Select(post => post.UserId).Distinct().ToList();
        var mutualConnectionsByAuthor = await _db.UserFollows
            .AsNoTracking()
            .Where(f => authorIds.Contains(f.FollowerId) && userFollowingSet.Contains(f.FollowingId))
            .GroupBy(f => f.FollowerId)
            .Select(group => new { AuthorId = group.Key, Count = group.Count() })
            .ToDictionaryAsync(item => item.AuthorId, item => item.Count, cancellationToken);

        var scoredNew = new List<ScoredPost>();
        var scoredOld = new List<ScoredPost>();

        foreach (var post in allCandidates)
        {
            var postTopics = ExtractTopics(post);
            var postVector = ToUnitVector(postTopics);

            var userPostSignals = BuildUserPostSignals(ctx, post, postTopics);
            var acquaintanceSignals = BuildAcquaintanceSignals(ctx, post.UserId, mutualConnectionsByAuthor);
            var qualitySignals = BuildQualitySignals(post, postTopics, completionCountByPost, nowUtc, candidates.TrendingTopics);
            var interestSignals = BuildInterestSignals(ctx, post, postTopics, postVector);

            var predictions = Predict(userPostSignals, acquaintanceSignals, qualitySignals, interestSignals);
            var isOld = post.CreatedAt < nowUtc.AddDays(-7);
            var feedScore = ComputeFeedScore(predictions, qualitySignals, isOld);
            var resurfacingScore = ComputeResurfacingScore(post, predictions, nowUtc);

            var scored = new ScoredPost(post, feedScore, resurfacingScore, predictions.WillHideOrReport);
            if (isOld)
            {
                scoredOld.Add(scored);
            }
            else
            {
                scoredNew.Add(scored);
            }
        }

        var rankedNew = scoredNew
            .OrderByDescending(item => item.Score)
            .ThenByDescending(item => item.Post.CreatedAt)
            .Select(item => item.Post)
            .ToList();

        var rankedOld = scoredOld
            .Where(item => item.ResurfacingScore >= 0.45d && item.NegativeRisk < 0.85d)
            .OrderByDescending(item => item.ResurfacingScore)
            .ThenByDescending(item => item.Post.CreatedAt)
            .ToList();

        var merged = ApplyResurfacing(rankedNew, rankedOld);
        var diversified = ApplyDiversity(merged);

        return diversified
            .Skip((safePage - 1) * safePageSize)
            .Take(safePageSize)
            .ToList();
    }

    private async Task<ViewerContext> BuildViewerContextAsync(Guid userId, DateTime nowUtc, CancellationToken cancellationToken)
    {
        var followingIds = await _db.UserFollows
            .AsNoTracking()
            .Where(f => f.FollowerId == userId)
            .Select(f => f.FollowingId)
            .ToHashSetAsync(cancellationToken);

        var blockedIds = await _db.UserBlocks
            .AsNoTracking()
            .Where(b => !b.IsDeleted && (b.BlockerId == userId || b.BlockedId == userId))
            .Select(b => b.BlockerId == userId ? b.BlockedId : b.BlockerId)
            .Distinct()
            .ToHashSetAsync(cancellationToken);

        var likedPostIds = await _db.PostLikes
            .AsNoTracking()
            .Where(l => l.UserId == userId)
            .Select(l => l.PostId)
            .ToHashSetAsync(cancellationToken);

        var repostedPostIds = await _db.PostReposts
            .AsNoTracking()
            .Where(r => r.UserId == userId)
            .Select(r => r.PostId)
            .ToHashSetAsync(cancellationToken);

        var bookmarkedPostIds = await _db.PostBookmarks
            .AsNoTracking()
            .Where(b => b.UserId == userId)
            .Select(b => b.PostId)
            .ToHashSetAsync(cancellationToken);

        var commentedPostIds = await _db.Set<Comment>()
            .AsNoTracking()
            .Where(c => c.UserId == userId && !c.IsDeleted)
            .Select(c => c.PostId)
            .ToHashSetAsync(cancellationToken);

        var interactionEvents = await _db.UserInteractionEvents
            .AsNoTracking()
            .Where(e => e.UserId == userId && e.CreatedAt >= nowUtc.AddDays(-180))
            .OrderByDescending(e => e.CreatedAt)
            .Take(5000)
            .ToListAsync(cancellationToken);

        var viewedPostIds = interactionEvents
            .Where(e => e.Type == InteractionEventType.View && e.TargetType == "post" && e.TargetId.HasValue)
            .Select(e => e.TargetId!.Value)
            .ToHashSet();

        var dismissedPostIds = interactionEvents
            .Where(e =>
                e.TargetId.HasValue &&
                e.TargetType == "post" &&
                (e.Type == InteractionEventType.Dislike || e.Type == InteractionEventType.Dismiss))
            .Select(e => e.TargetId!.Value)
            .ToHashSet();

        var hiddenAuthorIds = interactionEvents
            .Where(e =>
                e.TargetId.HasValue &&
                e.TargetType == "author" &&
                (e.Type == InteractionEventType.Dislike || e.Type == InteractionEventType.Dismiss))
            .Select(e => e.TargetId!.Value)
            .ToHashSet();

        var currentEvents = interactionEvents.Where(e => e.CreatedAt >= nowUtc.AddDays(-21)).ToList();
        var historicalEvents = interactionEvents
            .Where(e => e.CreatedAt < nowUtc.AddDays(-21) && e.CreatedAt >= nowUtc.AddDays(-180))
            .ToList();

        var currentInterestVector = BuildInterestVector(currentEvents);
        var historicalInterestVector = BuildInterestVector(historicalEvents);
        var formatPreference = BuildFormatPreference(interactionEvents);
        var topicDwellSeconds = BuildTopicAverageDuration(currentEvents);
        var topicCompletionRate = BuildTopicCompletionRate(currentEvents);
        var topicAffinity = NormalizeTopicAffinity(currentInterestVector);

        var authorInteractionRows = await BuildAuthorInteractionRowsAsync(userId, nowUtc, cancellationToken);
        var recentInteractions14d = authorInteractionRows
            .Where(row => row.Timestamp >= nowUtc.AddDays(-14))
            .GroupBy(row => row.AuthorId)
            .ToDictionary(group => group.Key, group => group.Count());
        var priorInteractions14d = authorInteractionRows
            .Where(row => row.Timestamp >= nowUtc.AddDays(-28) && row.Timestamp < nowUtc.AddDays(-14))
            .GroupBy(row => row.AuthorId)
            .ToDictionary(group => group.Key, group => group.Count());
        var interactionFrequency30d = authorInteractionRows
            .Where(row => row.Timestamp >= nowUtc.AddDays(-30))
            .GroupBy(row => row.AuthorId)
            .ToDictionary(group => group.Key, group => group.Count());
        var lastInteractionUtc = authorInteractionRows
            .GroupBy(row => row.AuthorId)
            .ToDictionary(group => group.Key, group => group.Max(row => row.Timestamp));

        var trendingTopics = await ResolveTrendingTopicsAsync(nowUtc, cancellationToken);

        return new ViewerContext(
            followingIds,
            blockedIds,
            likedPostIds,
            repostedPostIds,
            bookmarkedPostIds,
            commentedPostIds,
            viewedPostIds,
            dismissedPostIds,
            hiddenAuthorIds,
            currentInterestVector,
            historicalInterestVector,
            formatPreference,
            topicDwellSeconds,
            topicCompletionRate,
            topicAffinity,
            recentInteractions14d,
            priorInteractions14d,
            interactionFrequency30d,
            lastInteractionUtc,
            trendingTopics);
    }

    private async Task<CandidateSet> GatherCandidatesAsync(Guid userId, ViewerContext ctx, DateTime nowUtc, CancellationToken cancellationToken)
    {
        var seedAuthors = new HashSet<Guid>(ctx.FollowingIds) { userId };

        var likedAuthorIds = await _db.PostLikes
            .AsNoTracking()
            .Where(l => l.UserId == userId)
            .Join(_db.Posts.AsNoTracking(), l => l.PostId, p => p.Id, (l, p) => p.UserId)
            .Distinct()
            .Take(100)
            .ToListAsync(cancellationToken);

        foreach (var authorId in likedAuthorIds)
        {
            seedAuthors.Add(authorId);
        }

        var commentedAuthorIds = await _db.Set<Comment>()
            .AsNoTracking()
            .Where(c => c.UserId == userId && !c.IsDeleted)
            .Join(_db.Posts.AsNoTracking(), c => c.PostId, p => p.Id, (c, p) => p.UserId)
            .Distinct()
            .Take(100)
            .ToListAsync(cancellationToken);

        foreach (var authorId in commentedAuthorIds)
        {
            seedAuthors.Add(authorId);
        }

        seedAuthors.ExceptWith(ctx.BlockedAuthorIds);
        seedAuthors.ExceptWith(ctx.HiddenAuthorIds);

        var newCutoff = nowUtc.AddDays(-7);
        var oldCutoff = nowUtc.AddDays(-365);

        var newPosts = await _db.Posts
            .AsNoTracking()
            .Where(p =>
                !p.IsDeleted &&
                p.CreatedAt >= newCutoff &&
                seedAuthors.Contains(p.UserId) &&
                !ctx.BlockedAuthorIds.Contains(p.UserId))
            .OrderByDescending(p => p.CreatedAt)
            .Take(700)
            .Include(p => p.User)
            .ToListAsync(cancellationToken);

        var oldPool = await _db.Posts
            .AsNoTracking()
            .Where(p =>
                !p.IsDeleted &&
                p.CreatedAt < newCutoff &&
                p.CreatedAt >= oldCutoff &&
                (seedAuthors.Contains(p.UserId) || (p.LikesCount + p.CommentsCount + p.RepostsCount + p.SharesCount) >= 6) &&
                !ctx.BlockedAuthorIds.Contains(p.UserId))
            .OrderByDescending(p => p.UpdatedAt)
            .Take(1200)
            .Include(p => p.User)
            .ToListAsync(cancellationToken);

        var oldCandidates = new List<Post>(oldPool.Count);
        foreach (var post in oldPool)
        {
            if (ctx.DismissedPostIds.Contains(post.Id))
            {
                continue;
            }

            if (InterestDriftTrigger(post, ctx)
                || ExternalEngagementSurge(post, nowUtc)
                || TopicTrendingTrigger(post, ctx.TrendingTopics)
                || AcquaintanceGrowthTrigger(post.UserId, ctx))
            {
                oldCandidates.Add(post);
            }
        }

        return new CandidateSet(
            newPosts.DistinctBy(post => post.Id).ToList(),
            oldCandidates.DistinctBy(post => post.Id).ToList(),
            ctx.TrendingTopics);
    }

    private UserPostSignals BuildUserPostSignals(ViewerContext ctx, Post post, IReadOnlyCollection<string> postTopics)
    {
        var dwell = postTopics.Count == 0
            ? 0d
            : postTopics.Select(topic => ctx.TopicDwellSeconds.GetValueOrDefault(topic, 0d)).DefaultIfEmpty(0d).Average();
        var dwellNorm = Clamp01(dwell / 120d);

        var completion = postTopics.Count == 0
            ? 0d
            : postTopics.Select(topic => ctx.TopicCompletionRate.GetValueOrDefault(topic, 0d)).DefaultIfEmpty(0d).Average();

        var viewedWithoutInteraction = ctx.ViewedPostIds.Contains(post.Id)
            && !ctx.LikedPostIds.Contains(post.Id)
            && !ctx.CommentedPostIds.Contains(post.Id)
            && !ctx.RepostedPostIds.Contains(post.Id)
            && !ctx.BookmarkedPostIds.Contains(post.Id);

        return new UserPostSignals(
            ctx.LikedPostIds.Contains(post.Id),
            ctx.CommentedPostIds.Contains(post.Id),
            ctx.RepostedPostIds.Contains(post.Id),
            dwellNorm,
            Clamp01(completion),
            viewedWithoutInteraction,
            ctx.DismissedPostIds.Contains(post.Id),
            ctx.HiddenAuthorIds.Contains(post.UserId));
    }

    private AcquaintanceSignals BuildAcquaintanceSignals(
        ViewerContext ctx,
        Guid authorId,
        IReadOnlyDictionary<Guid, int> mutualConnectionsByAuthor)
    {
        var interactionFrequency30d = Clamp01(ctx.InteractionFrequency30d.GetValueOrDefault(authorId, 0) / 20d);
        var mutualConnections = Clamp01(mutualConnectionsByAuthor.GetValueOrDefault(authorId, 0) / 25d);
        var seenFromAuthor = Math.Max(1, ctx.InteractionFrequency30d.GetValueOrDefault(authorId, 0) + 2);
        var contentConsumptionRatio = Clamp01(ctx.InteractionFrequency30d.GetValueOrDefault(authorId, 0) / (double)seenFromAuthor);

        var recencyDays = ctx.LastAuthorInteractionUtc.TryGetValue(authorId, out var lastSeen)
            ? Math.Max(0d, (DateTime.UtcNow - lastSeen).TotalDays)
            : 365d;
        var recencySignal = 1d - Clamp01(recencyDays / 90d);

        var acquaintanceScore =
            interactionFrequency30d * 0.4d +
            mutualConnections * 0.2d +
            contentConsumptionRatio * 0.2d +
            recencySignal * 0.2d;

        return new AcquaintanceSignals(
            interactionFrequency30d,
            mutualConnections,
            contentConsumptionRatio,
            recencyDays,
            Clamp01(acquaintanceScore));
    }

    private static QualitySignals BuildQualitySignals(
        Post post,
        IReadOnlyCollection<string> postTopics,
        IReadOnlyDictionary<Guid, int> completionCountByPost,
        DateTime nowUtc,
        IReadOnlyCollection<string> trendingTopics)
    {
        var engagementRate = (post.LikesCount + post.CommentsCount + post.RepostsCount + post.SharesCount) / Math.Max(1d, post.ViewsCount);
        var commentDepth = post.CommentsCount / Math.Max(1d, post.LikesCount + post.RepostsCount + 1d);
        var completionGlobal = completionCountByPost.GetValueOrDefault(post.Id, 0) / Math.Max(1d, post.ViewsCount);
        var ageDays = Math.Max(0d, (nowUtc - post.CreatedAt).TotalDays);
        var recencyDecay = 1d / (1d + ageDays * 0.05d);

        var overlap = postTopics.Count == 0
            ? 0
            : postTopics.Count(topic => trendingTopics.Contains(topic, StringComparer.OrdinalIgnoreCase));
        var trendingOverlap = Clamp01(overlap / 3d);

        return new QualitySignals(
            Clamp01(engagementRate),
            Clamp01(commentDepth),
            Clamp01(completionGlobal),
            Clamp01(recencyDecay),
            trendingOverlap,
            ageDays);
    }

    private static InterestSignals BuildInterestSignals(
        ViewerContext ctx,
        Post post,
        IReadOnlyCollection<string> postTopics,
        IReadOnlyDictionary<string, double> postVector)
    {
        var cosine = CosineSimilarity(ctx.CurrentInterestVector, postVector);
        var topicAffinity = postTopics.Count == 0
            ? 0d
            : postTopics.Select(topic => ctx.TopicAffinity.GetValueOrDefault(topic, 0d)).DefaultIfEmpty(0d).Average();

        var formatPref = ctx.FormatPreference.GetValueOrDefault(post.Type, 0.2d);

        return new InterestSignals(
            Clamp01(cosine),
            Clamp01(topicAffinity),
            Clamp01(formatPref));
    }

    private static PredictionSignals Predict(
        UserPostSignals userPost,
        AcquaintanceSignals acquaintance,
        QualitySignals quality,
        InterestSignals interest)
    {
        var willLike = Clamp01(interest.InterestCosineSimilarity * 0.6d + acquaintance.InteractionFrequency30d * 0.4d);
        var willComment = Clamp01(userPost.UserDwellTimeOnSimilar * 0.3d + quality.CommentDepth * 0.5d + interest.TopicAffinity * 0.2d);
        var willShare = Clamp01(quality.CompletionRateGlobal * 0.4d + (userPost.UserSharedBefore ? 0.3d : 0d) + quality.GlobalEngagementRate * 0.2d);
        var dwellSeconds = Math.Max(0d, userPost.UserDwellTimeOnSimilar * 90d + quality.CompletionRateGlobal * 30d);
        var meaningful = Clamp01(interest.TopicAffinity * 0.5d + (userPost.UserViewedButNotInteracted ? 0d : 0.2d) + interest.FormatPreference * 0.2d);

        var hideOrReport = userPost.UserMarkedNotInterested || userPost.UserHiddenAuthor
            ? 1d
            : Clamp01((userPost.UserViewedButNotInteracted ? 0.1d : 0.02d) + (1d - quality.RecencyDecay) * 0.05d);

        return new PredictionSignals(
            willLike,
            willComment,
            willShare,
            dwellSeconds,
            meaningful,
            hideOrReport,
            interest.InterestCosineSimilarity,
            acquaintance.AcquaintanceScore);
    }

    private static double ComputeFeedScore(PredictionSignals preds, QualitySignals quality, bool isOld)
    {
        var baseScore =
            preds.WillFindMeaningful * 0.28d +
            Clamp01(preds.PredictedDwellTimeSeconds / 120d) * 0.22d +
            preds.WillLike * 0.15d +
            preds.WillComment * 0.12d +
            preds.WillShare * 0.08d +
            quality.CompletionRateGlobal * 0.08d +
            preds.AcquaintanceScore * 0.07d;

        var agePenalty = isOld ? RecencyPenalty(quality.AgeDays) * 0.12d : 0d;
        var negative = preds.WillHideOrReport * 0.8d + agePenalty;
        return Math.Max(0d, baseScore - negative);
    }

    private static double ComputeResurfacingScore(Post post, PredictionSignals preds, DateTime nowUtc)
    {
        var positive =
            preds.WillFindMeaningful * 0.35d +
            preds.WillLike * 0.20d +
            preds.WillComment * 0.15d +
            Math.Min(preds.PredictedDwellTimeSeconds / 60d, 1d) * 0.20d +
            preds.InterestCosineSimilarity * 0.10d;

        var ageDays = Math.Max(0d, (nowUtc - post.CreatedAt).TotalDays);
        var negative =
            preds.WillHideOrReport * 0.80d +
            RecencyPenalty(ageDays) * 0.15d;

        var acquaintanceBonus = preds.AcquaintanceScore * 0.10d;
        return Math.Max(0d, positive - negative + acquaintanceBonus);
    }

    private static List<Post> ApplyResurfacing(IReadOnlyList<Post> rankedNewPosts, IReadOnlyList<ScoredPost> rankedOldPosts)
    {
        if (rankedNewPosts.Count == 0)
        {
            return rankedOldPosts.Select(item => item.Post).Take(20).ToList();
        }

        var result = new List<Post>(rankedNewPosts.Count + Math.Max(1, rankedNewPosts.Count / 5));
        var oldQueue = rankedOldPosts.ToList();
        var oldIndex = 0;
        Guid? lastOldAuthor = null;
        var seen = new HashSet<Guid>();

        for (var i = 0; i < rankedNewPosts.Count; i++)
        {
            var post = rankedNewPosts[i];
            if (seen.Add(post.Id))
            {
                result.Add(post);
            }

            if ((i + 1) % 5 != 0 || oldIndex >= oldQueue.Count)
            {
                continue;
            }

            while (oldIndex < oldQueue.Count)
            {
                var candidate = oldQueue[oldIndex].Post;
                oldIndex++;

                if (seen.Contains(candidate.Id))
                {
                    continue;
                }

                if (lastOldAuthor.HasValue && candidate.UserId == lastOldAuthor.Value)
                {
                    continue;
                }

                result.Add(candidate);
                seen.Add(candidate.Id);
                lastOldAuthor = candidate.UserId;
                break;
            }
        }

        return result;
    }

    private static IReadOnlyList<Post> ApplyDiversity(IReadOnlyList<Post> posts)
    {
        if (posts.Count <= 2)
        {
            return posts;
        }

        var result = new List<Post>(posts.Count);
        var heldBack = new Queue<Post>();
        Guid? previousAuthor = null;

        foreach (var post in posts)
        {
            if (previousAuthor.HasValue && post.UserId == previousAuthor.Value)
            {
                heldBack.Enqueue(post);
                continue;
            }

            result.Add(post);
            previousAuthor = post.UserId;

            if (heldBack.Count > 0)
            {
                var next = heldBack.Dequeue();
                if (next.UserId != previousAuthor)
                {
                    result.Add(next);
                    previousAuthor = next.UserId;
                }
                else
                {
                    heldBack.Enqueue(next);
                }
            }
        }

        while (heldBack.Count > 0)
        {
            result.Add(heldBack.Dequeue());
        }

        return result;
    }

    private bool InterestDriftTrigger(Post post, ViewerContext ctx)
    {
        var topics = ExtractTopics(post);
        if (topics.Count == 0)
        {
            return false;
        }

        var vector = ToUnitVector(topics);
        var current = CosineSimilarity(ctx.CurrentInterestVector, vector);
        var historical = CosineSimilarity(ctx.HistoricalInterestVector, vector);
        return current >= 0.18d && (current - historical) >= 0.05d;
    }

    private static bool ExternalEngagementSurge(Post post, DateTime nowUtc)
    {
        if (post.UpdatedAt < nowUtc.AddHours(-48))
        {
            return false;
        }

        var interactions = post.LikesCount + post.CommentsCount + post.RepostsCount + post.SharesCount;
        var rate = interactions / Math.Max(20d, post.ViewsCount);
        return interactions >= 8 && rate >= 0.08d;
    }

    private bool TopicTrendingTrigger(Post post, IReadOnlyCollection<string> trendingTopics)
    {
        if (trendingTopics.Count == 0)
        {
            return false;
        }

        var overlap = ExtractTopics(post)
            .Count(topic => trendingTopics.Contains(topic, StringComparer.OrdinalIgnoreCase));
        return overlap >= 2;
    }

    private static bool AcquaintanceGrowthTrigger(Guid authorId, ViewerContext ctx)
    {
        var recent = ctx.RecentInteractions14d.GetValueOrDefault(authorId, 0);
        var prior = ctx.PriorInteractions14d.GetValueOrDefault(authorId, 0);
        return recent >= 3 || (recent - prior) >= 2;
    }

    private async Task<List<AuthorInteractionRow>> BuildAuthorInteractionRowsAsync(Guid userId, DateTime nowUtc, CancellationToken cancellationToken)
    {
        var since = nowUtc.AddDays(-90);

        var likeRows = await _db.PostLikes
            .AsNoTracking()
            .Where(l => l.UserId == userId && l.CreatedAt >= since)
            .Join(_db.Posts.AsNoTracking(), l => l.PostId, p => p.Id, (l, p) => new AuthorInteractionRow(p.UserId, l.CreatedAt))
            .ToListAsync(cancellationToken);

        var repostRows = await _db.PostReposts
            .AsNoTracking()
            .Where(r => r.UserId == userId && r.CreatedAt >= since)
            .Join(_db.Posts.AsNoTracking(), r => r.PostId, p => p.Id, (r, p) => new AuthorInteractionRow(p.UserId, r.CreatedAt))
            .ToListAsync(cancellationToken);

        var commentRows = await _db.Set<Comment>()
            .AsNoTracking()
            .Where(c => c.UserId == userId && !c.IsDeleted && c.CreatedAt >= since)
            .Join(_db.Posts.AsNoTracking(), c => c.PostId, p => p.Id, (c, p) => new AuthorInteractionRow(p.UserId, c.CreatedAt))
            .ToListAsync(cancellationToken);

        return likeRows.Concat(repostRows).Concat(commentRows).ToList();
    }

    private async Task<IReadOnlyList<string>> ResolveTrendingTopicsAsync(DateTime nowUtc, CancellationToken cancellationToken)
    {
        var fromEvents = await _db.UserInteractionEvents
            .AsNoTracking()
            .Where(e => e.CreatedAt >= nowUtc.AddHours(-48) && !string.IsNullOrWhiteSpace(e.TargetTags))
            .Select(e => e.TargetTags!)
            .ToListAsync(cancellationToken);

        var tags = fromEvents
            .SelectMany(value => value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            .Select(NormalizeToken)
            .Where(token => !string.IsNullOrWhiteSpace(token))
            .GroupBy(token => token)
            .OrderByDescending(group => group.Count())
            .Take(20)
            .Select(group => group.Key)
            .ToList();

        if (tags.Count > 0)
        {
            return tags;
        }

        var latestSnapshot = await _db.RegionalTrendSnapshots
            .AsNoTracking()
            .Where(snapshot => snapshot.CountryCode == "GLOBAL" && snapshot.ExpiresAt > nowUtc)
            .OrderByDescending(snapshot => snapshot.SnapshotAt)
            .FirstOrDefaultAsync(cancellationToken);

        if (latestSnapshot is null || string.IsNullOrWhiteSpace(latestSnapshot.TopicsJson))
        {
            return Array.Empty<string>();
        }

        try
        {
            var topics = JsonSerializer.Deserialize<List<RegionalTrendItem>>(latestSnapshot.TopicsJson);
            if (topics is null || topics.Count == 0)
            {
                return Array.Empty<string>();
            }

            return topics
                .Select(topic => NormalizeToken(topic.Topic))
                .Where(topic => !string.IsNullOrWhiteSpace(topic))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Take(20)
                .ToList();
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Could not parse regional trend snapshot topics.");
            return Array.Empty<string>();
        }
    }

    private static Dictionary<string, double> BuildInterestVector(IEnumerable<UserInteractionEvent> events)
    {
        var vector = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase);
        foreach (var evt in events)
        {
            if (string.IsNullOrWhiteSpace(evt.TargetTags))
            {
                continue;
            }

            var eventWeight = evt.Type switch
            {
                InteractionEventType.Complete => 2.6d,
                InteractionEventType.Comment => 2.4d,
                InteractionEventType.Share => 2.2d,
                InteractionEventType.Bookmark => 2.0d,
                InteractionEventType.Like => 1.6d,
                InteractionEventType.View => 0.4d,
                InteractionEventType.Dislike or InteractionEventType.Dismiss => -1.8d,
                _ => 1.0d
            };

            foreach (var rawTag in evt.TargetTags.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            {
                var tag = NormalizeToken(rawTag);
                if (string.IsNullOrWhiteSpace(tag))
                {
                    continue;
                }

                vector[tag] = vector.GetValueOrDefault(tag) + eventWeight;
            }
        }

        var normalized = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase);
        var max = vector.Count == 0 ? 1d : vector.Values.Max(value => Math.Abs(value));
        foreach (var (key, value) in vector)
        {
            normalized[key] = Clamp01((value / max + 1d) / 2d);
        }

        return normalized;
    }

    private static Dictionary<PostType, double> BuildFormatPreference(IEnumerable<UserInteractionEvent> events)
    {
        var weights = new Dictionary<PostType, double>();

        foreach (var evt in events)
        {
            if (!Enum.TryParse<PostType>(evt.TargetType, true, out var postType))
            {
                continue;
            }

            var delta = evt.Type switch
            {
                InteractionEventType.Complete => 2d,
                InteractionEventType.Comment => 1.8d,
                InteractionEventType.Share => 1.7d,
                InteractionEventType.Like => 1.3d,
                InteractionEventType.View => 0.5d,
                InteractionEventType.Dislike or InteractionEventType.Dismiss => -1.5d,
                _ => 0.8d
            };

            weights[postType] = weights.GetValueOrDefault(postType, 0d) + delta;
        }

        if (weights.Count == 0)
        {
            return new Dictionary<PostType, double>();
        }

        var min = weights.Values.Min();
        var max = weights.Values.Max();
        var range = Math.Max(0.0001d, max - min);

        return weights.ToDictionary(
            pair => pair.Key,
            pair => Clamp01((pair.Value - min) / range));
    }

    private static Dictionary<string, double> BuildTopicAverageDuration(IEnumerable<UserInteractionEvent> events)
    {
        return events
            .Where(evt => !string.IsNullOrWhiteSpace(evt.TargetTags) && evt.DurationSeconds.HasValue && evt.DurationSeconds.Value > 0)
            .SelectMany(evt =>
                evt.TargetTags!
                    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                    .Select(tag => new { Tag = NormalizeToken(tag), Duration = (double)evt.DurationSeconds!.Value }))
            .Where(item => !string.IsNullOrWhiteSpace(item.Tag))
            .GroupBy(item => item.Tag)
            .ToDictionary(group => group.Key, group => group.Average(item => item.Duration), StringComparer.OrdinalIgnoreCase);
    }

    private static Dictionary<string, double> BuildTopicCompletionRate(IEnumerable<UserInteractionEvent> events)
    {
        var rows = events
            .Where(evt => !string.IsNullOrWhiteSpace(evt.TargetTags))
            .SelectMany(evt =>
                evt.TargetTags!
                    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                    .Select(tag => new { Tag = NormalizeToken(tag), evt.Type }))
            .Where(item => !string.IsNullOrWhiteSpace(item.Tag))
            .ToList();

        var grouped = rows.GroupBy(item => item.Tag, StringComparer.OrdinalIgnoreCase);
        var map = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase);

        foreach (var group in grouped)
        {
            var total = group.Count();
            if (total == 0)
            {
                continue;
            }

            var completes = group.Count(item => item.Type == InteractionEventType.Complete);
            map[group.Key] = Clamp01(completes / (double)total);
        }

        return map;
    }

    private static Dictionary<string, double> NormalizeTopicAffinity(Dictionary<string, double> vector)
    {
        if (vector.Count == 0)
        {
            return new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase);
        }

        var min = vector.Values.Min();
        var max = vector.Values.Max();
        var range = Math.Max(0.0001d, max - min);

        return vector.ToDictionary(
            pair => pair.Key,
            pair => Clamp01((pair.Value - min) / range),
            StringComparer.OrdinalIgnoreCase);
    }

    private static IReadOnlyCollection<string> ExtractTopics(Post post)
    {
        var topics = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (!string.IsNullOrWhiteSpace(post.Content))
        {
            foreach (Match match in HashtagRegex.Matches(post.Content))
            {
                var token = NormalizeToken(match.Groups[1].Value);
                if (!string.IsNullOrWhiteSpace(token))
                {
                    topics.Add(token);
                }
            }

            foreach (var token in post.Content
                         .Split([' ', '\n', '\r', '\t', '.', ',', ';', ':', '!', '?', '/', '\\', '|', '-', '(', ')', '[', ']', '{', '}', '"', '\''],
                             StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            {
                var normalized = NormalizeToken(token);
                if (!string.IsNullOrWhiteSpace(normalized) && normalized.Length > 2 && !StopWords.Contains(normalized))
                {
                    topics.Add(normalized);
                }
            }
        }

        return topics.Take(24).ToArray();
    }

    private static Dictionary<string, double> ToUnitVector(IEnumerable<string> topics)
    {
        var keys = topics
            .Select(NormalizeToken)
            .Where(token => !string.IsNullOrWhiteSpace(token))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (keys.Count == 0)
        {
            return new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase);
        }

        var value = 1d / Math.Sqrt(keys.Count);
        return keys.ToDictionary(key => key, _ => value, StringComparer.OrdinalIgnoreCase);
    }

    private static double CosineSimilarity(
        IReadOnlyDictionary<string, double> userVector,
        IReadOnlyDictionary<string, double> postVector)
    {
        if (userVector.Count == 0 || postVector.Count == 0)
        {
            return 0d;
        }

        var dot = 0d;
        foreach (var (key, value) in postVector)
        {
            if (userVector.TryGetValue(key, out var userWeight))
            {
                dot += value * userWeight;
            }
        }

        var userNorm = Math.Sqrt(userVector.Values.Sum(value => value * value));
        var postNorm = Math.Sqrt(postVector.Values.Sum(value => value * value));
        if (userNorm <= 0d || postNorm <= 0d)
        {
            return 0d;
        }

        return Clamp01(dot / (userNorm * postNorm));
    }

    private static string NormalizeToken(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return string.Empty;
        }

        var cleaned = raw.Trim().TrimStart('#').Trim().ToLowerInvariant();
        return cleaned.Length > 64 ? cleaned[..64] : cleaned;
    }

    private static double RecencyPenalty(double ageDays)
    {
        return Math.Min(0.5d, Math.Max(0d, (ageDays - 30d) / 180d));
    }

    private static double Clamp01(double value)
    {
        if (value < 0d) return 0d;
        if (value > 1d) return 1d;
        return value;
    }

    private sealed record CandidateSet(
        List<Post> NewPosts,
        List<Post> OldPosts,
        IReadOnlyList<string> TrendingTopics);

    private sealed record ViewerContext(
        HashSet<Guid> FollowingIds,
        HashSet<Guid> BlockedAuthorIds,
        HashSet<Guid> LikedPostIds,
        HashSet<Guid> RepostedPostIds,
        HashSet<Guid> BookmarkedPostIds,
        HashSet<Guid> CommentedPostIds,
        HashSet<Guid> ViewedPostIds,
        HashSet<Guid> DismissedPostIds,
        HashSet<Guid> HiddenAuthorIds,
        Dictionary<string, double> CurrentInterestVector,
        Dictionary<string, double> HistoricalInterestVector,
        Dictionary<PostType, double> FormatPreference,
        Dictionary<string, double> TopicDwellSeconds,
        Dictionary<string, double> TopicCompletionRate,
        Dictionary<string, double> TopicAffinity,
        Dictionary<Guid, int> RecentInteractions14d,
        Dictionary<Guid, int> PriorInteractions14d,
        Dictionary<Guid, int> InteractionFrequency30d,
        Dictionary<Guid, DateTime> LastAuthorInteractionUtc,
        IReadOnlyList<string> TrendingTopics);

    private sealed record UserPostSignals(
        bool UserLikedThisPost,
        bool UserCommentedBefore,
        bool UserSharedBefore,
        double UserDwellTimeOnSimilar,
        double UserCompletionRateOnSimilar,
        bool UserViewedButNotInteracted,
        bool UserMarkedNotInterested,
        bool UserHiddenAuthor);

    private sealed record AcquaintanceSignals(
        double InteractionFrequency30d,
        double MutualConnections,
        double ContentConsumptionRatio,
        double LastInteractionRecencyDays,
        double AcquaintanceScore);

    private sealed record QualitySignals(
        double GlobalEngagementRate,
        double CommentDepth,
        double CompletionRateGlobal,
        double RecencyDecay,
        double AiNewsTopicOverlap,
        double AgeDays);

    private sealed record InterestSignals(
        double InterestCosineSimilarity,
        double TopicAffinity,
        double FormatPreference);

    private sealed record PredictionSignals(
        double WillLike,
        double WillComment,
        double WillShare,
        double PredictedDwellTimeSeconds,
        double WillFindMeaningful,
        double WillHideOrReport,
        double InterestCosineSimilarity,
        double AcquaintanceScore);

    private sealed record ScoredPost(Post Post, double Score, double ResurfacingScore, double NegativeRisk);

    private sealed record AuthorInteractionRow(Guid AuthorId, DateTime Timestamp);

    private sealed record RegionalTrendItem(string Topic, decimal Score, string Source, string Category);
}
