using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
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
    private readonly RankingThresholds _thresholds;

    public PostFeedRankingService(AppDbContext db, ILogger<PostFeedRankingService> logger, IConfiguration configuration)
    {
        _db = db;
        _logger = logger;
        _thresholds = RankingThresholds.FromConfiguration(configuration);
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
            var interestSignals = BuildInterestSignals(ctx, post, postTopics, postVector, nowUtc);

            var predictions = Predict(userPostSignals, acquaintanceSignals, qualitySignals, interestSignals);
            var isOld = post.CreatedAt < nowUtc.AddDays(-7);
            var feedScore = ComputeFeedScore(predictions, qualitySignals, isOld);
            feedScore += ComputeFreshnessBoost(post, userId, nowUtc);
            var resurfacingScore = ComputeResurfacingScore(post, predictions, nowUtc);

            if (isOld && !ShouldResurfaceOldPost(predictions, _thresholds))
            {
                continue;
            }

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

        if (safePage == 1)
        {
            rankedNew = EnsureRecentAuthorVisibility(rankedNew, userId, nowUtc);
        }

        // Implicit fatigue circuit breaker: dynamically raises threshold from 0.45 to 0.70
        var resurfacingThreshold = ctx.Fatigue.Threshold;
        var rankedOld = scoredOld
            .Where(item => item.ResurfacingScore >= resurfacingThreshold && item.NegativeRisk < 0.85d)
            .OrderByDescending(item => item.ResurfacingScore)
            .ThenByDescending(item => item.Post.CreatedAt)
            .ToList();

        var merged = ApplyResurfacing(rankedNew, rankedOld, ctx.Fatigue);
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

        var skippedPostIds = interactionEvents
            .Where(e =>
                e.TargetId.HasValue &&
                e.TargetType == "post" &&
                (e.Type == InteractionEventType.Skip || (e.DurationSeconds.HasValue && e.DurationSeconds.Value <= 2)))
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

        var actualDwellSecondsByPost = interactionEvents
            .Where(e => e.TargetType == "post" && e.TargetId.HasValue && e.DurationSeconds.HasValue)
            .GroupBy(e => e.TargetId!.Value)
            .ToDictionary(g => g.Key, g => (double)g.Average(e => e.DurationSeconds!.Value));

        var actualCompletionByPost = interactionEvents
            .Where(e => e.TargetType == "post" && e.TargetId.HasValue)
            .GroupBy(e => e.TargetId!.Value)
            .ToDictionary(g => g.Key, g => (double)g.Count(e => e.Type == InteractionEventType.Complete) / Math.Max(1, g.Count()));

        var authorDwellCounts = interactionEvents
            .Where(e => e.TargetType == "post" && e.TargetId.HasValue && e.DurationSeconds.GetValueOrDefault() >= 10)
            .GroupBy(e => e.TargetId!.Value)
            .ToDictionary(g => g.Key, g => g.Count());

        var currentInterestVector = BuildInterestVector(currentEvents);
        var historicalInterestVector = BuildInterestVector(historicalEvents);
        var preferenceClusters = BuildPreferenceClusters(currentInterestVector);
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

        var fatigueState = DetectResurfacingFatigue(interactionEvents, nowUtc, _thresholds);
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
            skippedPostIds,
            hiddenAuthorIds,
            currentInterestVector,
            historicalInterestVector,
            preferenceClusters,
            formatPreference,
            topicDwellSeconds,
            topicCompletionRate,
            topicAffinity,
            recentInteractions14d,
            priorInteractions14d,
            interactionFrequency30d,
            lastInteractionUtc,
            actualDwellSecondsByPost,
            actualCompletionByPost,
            authorDwellCounts,
            fatigueState,
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
                (seedAuthors.Contains(p.UserId) || (p.LikesCount + p.CommentsCount + p.RepostsCount + p.SharesCount + p.BookmarksCount) >= 6) &&
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

            // Trigger A: Interest drift with counterfactual debiasing
            // Trigger B: Velocity surge (comment velocity weighted over likes)
            // Trigger C: Topic trending trigger
            // Trigger D: Acquaintance growth / behavioral coupling
            // Trigger E: Implicit session imputation (unrecorded high-dwell engagement)
            if (InterestDriftTrigger(post, ctx, nowUtc)
                || ExternalEngagementSurge(post, nowUtc)
                || TopicTrendingTrigger(post, ctx.TrendingTopics)
                || AcquaintanceGrowthTrigger(post.UserId, ctx)
                || SessionImputationTrigger(post, ctx))
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
        var expectedDwell = postTopics.Count == 0
            ? 15d
            : postTopics.Select(topic => ctx.TopicDwellSeconds.GetValueOrDefault(topic, 15d)).DefaultIfEmpty(15d).Average();
        var expectedDwellNorm = Clamp01(expectedDwell / 120d);

        var expectedCompletion = postTopics.Count == 0
            ? 0.25d
            : postTopics.Select(topic => ctx.TopicCompletionRate.GetValueOrDefault(topic, 0.25d)).DefaultIfEmpty(0.25d).Average();

        var actualDwell = ctx.ActualDwellSecondsByPost.GetValueOrDefault(post.Id, 0d);
        var actualCompletion = ctx.ActualCompletionByPost.GetValueOrDefault(post.Id, 0d);

        // Implicit residuals = actual behavior - expected behavior
        var dwellResidual = actualDwell - expectedDwell;
        var completionResidual = actualCompletion - expectedCompletion;

        // Silent interest: user quietly dwelled and completed well beyond expected, without clicking like
        var silentInterest = actualDwell > Math.Max(12d, expectedDwell * 1.5d)
            && actualCompletion > Math.Max(0.5d, expectedCompletion * 1.2d)
            && !ctx.LikedPostIds.Contains(post.Id);

        // Silent aversion: user quickly skipped or dwelled far below expected, without explicitly hiding
        var silentAversion = ((actualDwell > 0 && actualDwell < expectedDwell * 0.3d) || ctx.SkippedPostIds.Contains(post.Id))
            && !ctx.DismissedPostIds.Contains(post.Id);

        var viewedWithoutInteraction = ctx.ViewedPostIds.Contains(post.Id)
            && !ctx.LikedPostIds.Contains(post.Id)
            && !ctx.CommentedPostIds.Contains(post.Id)
            && !ctx.RepostedPostIds.Contains(post.Id)
            && !ctx.BookmarkedPostIds.Contains(post.Id);

        return new UserPostSignals(
            ctx.LikedPostIds.Contains(post.Id),
            ctx.CommentedPostIds.Contains(post.Id),
            ctx.RepostedPostIds.Contains(post.Id),
            expectedDwellNorm,
            Clamp01(expectedCompletion),
            viewedWithoutInteraction,
            ctx.DismissedPostIds.Contains(post.Id),
            ctx.HiddenAuthorIds.Contains(post.UserId),
            dwellResidual,
            completionResidual,
            silentInterest,
            silentAversion);
    }

    private AcquaintanceSignals BuildAcquaintanceSignals(
        ViewerContext ctx,
        Guid authorId,
        IReadOnlyDictionary<Guid, int> mutualConnectionsByAuthor)
    {
        var (implicitScore, isSilentFollower) = ComputeImplicitAcquaintance(authorId, ctx, mutualConnectionsByAuthor);
        var interactionFrequency30d = Clamp01(ctx.InteractionFrequency30d.GetValueOrDefault(authorId, 0) / 20d);
        var mutualConnections = Clamp01(mutualConnectionsByAuthor.GetValueOrDefault(authorId, 0) / 25d);
        var seenFromAuthor = Math.Max(1, ctx.InteractionFrequency30d.GetValueOrDefault(authorId, 0) + 2);
        var contentConsumptionRatio = Clamp01(ctx.InteractionFrequency30d.GetValueOrDefault(authorId, 0) / (double)seenFromAuthor);

        var recencyDays = ctx.LastAuthorInteractionUtc.TryGetValue(authorId, out var lastSeen)
            ? Math.Max(0d, (DateTime.UtcNow - lastSeen).TotalDays)
            : 365d;

        return new AcquaintanceSignals(
            interactionFrequency30d,
            mutualConnections,
            contentConsumptionRatio,
            recencyDays,
            implicitScore,
            isSilentFollower);
    }

    private static QualitySignals BuildQualitySignals(
        Post post,
        IReadOnlyCollection<string> postTopics,
        IReadOnlyDictionary<Guid, int> completionCountByPost,
        DateTime nowUtc,
        IReadOnlyCollection<string> trendingTopics)
    {
        var engagementRate = CalculateAffirmationScore(post) / Math.Max(1d, post.ViewsCount);
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
        IReadOnlyDictionary<string, double> postVector,
        DateTime nowUtc)
    {
        // 1. Monolithic cosine similarity
        var monolithicCosine = CosineSimilarity(ctx.CurrentInterestVector, postVector);

        // 2. Heterogeneous preference score (80th percentile across topic sub-clusters)
        var heterogeneousCosine = ComputeHeterogeneousScore(ctx.PreferenceClusters, postVector);

        // 3. Counterfactual debiasing for observed interaction vs exposure propensity
        var observed = monolithicCosine;
        var contentEstimate = heterogeneousCosine > 0 ? heterogeneousCosine : monolithicCosine;
        var debiasedCosine = ComputeCounterfactualInterest(post, ctx, observed, contentEstimate, nowUtc);

        var topicAffinity = postTopics.Count == 0
            ? 0d
            : postTopics.Select(topic => ctx.TopicAffinity.GetValueOrDefault(topic, 0d)).DefaultIfEmpty(0d).Average();

        var formatPref = ctx.FormatPreference.GetValueOrDefault(post.Type, 0.2d);

        return new InterestSignals(
            Clamp01(debiasedCosine),
            Clamp01(heterogeneousCosine),
            Clamp01(topicAffinity),
            Clamp01(formatPref));
    }

    private static PredictionSignals Predict(
        UserPostSignals userPost,
        AcquaintanceSignals acquaintance,
        QualitySignals quality,
        InterestSignals interest)
    {
        // Incorporate silent interest: positive residual boosts predicted like/meaningful
        var silentBoost = userPost.SilentInterest ? 0.25d : 0d;
        var silentAversionPenalty = userPost.SilentAversion ? 0.35d : 0d;

        var willLike = Clamp01(interest.InterestCosineSimilarity * 0.55d + acquaintance.InteractionFrequency30d * 0.30d + silentBoost);
        var willComment = Clamp01(userPost.UserDwellTimeOnSimilar * 0.25d + quality.CommentDepth * 0.45d + interest.TopicAffinity * 0.20d + (userPost.SilentInterest ? 0.15d : 0d));
        var willShare = Clamp01(quality.CompletionRateGlobal * 0.40d + (userPost.UserSharedBefore ? 0.30d : 0d) + quality.GlobalEngagementRate * 0.20d);
        var dwellSeconds = Math.Max(0d, userPost.UserDwellTimeOnSimilar * 90d + quality.CompletionRateGlobal * 30d + (userPost.SilentInterest ? 25d : 0d));
        var predictedCompletion = Clamp01(userPost.UserCompletionRateOnSimilar * 0.55d + quality.CompletionRateGlobal * 0.45d + (userPost.SilentInterest ? 0.10d : 0d));
        var meaningful = Clamp01(interest.HeterogeneousCosineSimilarity * 0.45d + interest.TopicAffinity * 0.30d + (acquaintance.IsSilentFollower ? 0.15d : 0d) + interest.FormatPreference * 0.10d + silentBoost);
        var sparkDiscussionIfComment = Clamp01(quality.CommentDepth * 0.55d + willComment * 0.25d + quality.GlobalEngagementRate * 0.20d);

        var hideOrReport = userPost.UserMarkedNotInterested || userPost.UserHiddenAuthor
            ? 1d
            : Clamp01((userPost.UserViewedButNotInteracted ? 0.08d : 0.02d) + (1d - quality.RecencyDecay) * 0.05d + silentAversionPenalty);

        return new PredictionSignals(
            willLike,
            willComment,
            willShare,
            dwellSeconds,
            predictedCompletion,
            meaningful,
            sparkDiscussionIfComment,
            hideOrReport,
            interest.HeterogeneousCosineSimilarity,
            acquaintance.AcquaintanceScore);
    }

    private static double ComputeFeedScore(PredictionSignals preds, QualitySignals quality, bool isOld)
    {
        var baseScore =
            preds.WillFindMeaningful * 0.30d +
            Clamp01(preds.PredictedDwellTimeSeconds / 120d) * 0.22d +
            preds.WillLike * 0.14d +
            preds.WillComment * 0.12d +
            preds.WillShare * 0.08d +
            quality.CompletionRateGlobal * 0.07d +
            preds.AcquaintanceScore * 0.07d;

        var agePenalty = isOld ? RecencyPenalty(quality.AgeDays) * 0.12d : 0d;
        var negative = preds.WillHideOrReport * 0.85d + agePenalty;
        return Math.Max(0d, baseScore - negative);
    }

    private static double ComputeFreshnessBoost(Post post, Guid viewerUserId, DateTime nowUtc)
    {
        var ageHours = Math.Max(0d, (nowUtc - post.CreatedAt).TotalHours);
        if (ageHours > 24d)
        {
            return 0d;
        }

        var freshness = 1d - Clamp01(ageHours / 24d);
        var authorBoost = post.UserId == viewerUserId
            ? 0.45d
            : 0.15d;

        return freshness * authorBoost;
    }

    private static double ComputeResurfacingScore(Post post, PredictionSignals preds, DateTime nowUtc)
    {
        var positive =
            preds.WillFindMeaningful * 0.35d +
            preds.PredictedCompletion * 0.28d +
            preds.SparkDiscussionIfComment * 0.22d +
            Math.Min(preds.PredictedDwellTimeSeconds / 60d, 1d) * 0.10d +
            preds.InterestCosineSimilarity * 0.05d;

        var ageDays = Math.Max(0d, (nowUtc - post.CreatedAt).TotalDays);
        var negative =
            preds.WillHideOrReport * 1.00d +
            RecencyPenalty(ageDays) * 0.15d;

        var acquaintanceBonus = preds.AcquaintanceScore * 0.10d;
        return Math.Max(0d, positive - negative + acquaintanceBonus);
    }

    private static bool ShouldResurfaceOldPost(PredictionSignals preds, RankingThresholds thresholds)
    {
        // Gate 1 (hard veto): negative risk
        if (preds.WillHideOrReport > thresholds.NegativeVetoThreshold)
        {
            return false;
        }

        // Gate 2: attention prediction
        var attentionOk = preds.PredictedCompletion > thresholds.AttentionCompletionThreshold
            || preds.PredictedDwellTimeSeconds > thresholds.AttentionDwellSecondsThreshold;
        if (!attentionOk)
        {
            return false;
        }

        // Gate 3: meaningful interaction
        if (preds.WillFindMeaningful <= thresholds.MeaningfulThreshold)
        {
            return false;
        }

        // Gate 4: long-term value (comment/discussion + completion)
        var longTermValue =
            preds.WillComment * 0.30d +
            preds.PredictedCompletion * 0.40d +
            preds.SparkDiscussionIfComment * 0.30d;

        return longTermValue > thresholds.LongTermValueThreshold;
    }

    private static List<Post> ApplyResurfacing(IReadOnlyList<Post> rankedNewPosts, IReadOnlyList<ScoredPost> rankedOldPosts, FatigueState fatigue)
    {
        // Severe implicit fatigue: automatic circuit breaker kicks in and skips older content
        if (fatigue.IsFatigued && fatigue.Score > 0.80d)
        {
            return rankedNewPosts.ToList();
        }

        if (rankedNewPosts.Count == 0)
        {
            return rankedOldPosts.Select(item => item.Post).Take(20).ToList();
        }

        // Adaptive cadence: 1 per 10 when fatigued, 1 per 5 normally
        var cadence = fatigue.IsFatigued ? 10 : 5;
        var result = new List<Post>(rankedNewPosts.Count + Math.Max(1, rankedNewPosts.Count / cadence));
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

            if ((i + 1) % cadence != 0 || oldIndex >= oldQueue.Count)
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

    private static List<Post> EnsureRecentAuthorVisibility(IReadOnlyList<Post> rankedNewPosts, Guid viewerUserId, DateTime nowUtc)
    {
        var mustKeep = rankedNewPosts
            .Where(post => post.UserId == viewerUserId && post.CreatedAt >= nowUtc.AddHours(-24))
            .OrderByDescending(post => post.CreatedAt)
            .Take(5)
            .ToList();

        if (mustKeep.Count == 0)
        {
            return rankedNewPosts.ToList();
        }

        return mustKeep
            .Concat(rankedNewPosts)
            .DistinctBy(post => post.Id)
            .ToList();
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

    private bool InterestDriftTrigger(Post post, ViewerContext ctx, DateTime nowUtc)
    {
        var topics = ExtractTopics(post);
        if (topics.Count == 0)
        {
            return false;
        }

        var vector = ToUnitVector(topics);
        var current = CosineSimilarity(ctx.CurrentInterestVector, vector);
        var historical = CosineSimilarity(ctx.HistoricalInterestVector, vector);

        // Counterfactually debias the current interest estimate to avoid MNAR
        var debiased = ComputeCounterfactualInterest(post, ctx, current, current, nowUtc);
        return debiased >= 0.16d && (debiased - historical) >= 0.04d;
    }

    private static bool ExternalEngagementSurge(Post post, DateTime nowUtc)
    {
        if (post.UpdatedAt < nowUtc.AddHours(-48))
        {
            return false;
        }

        // Empirical refinement: comment velocity indicates active discussion, while likes are passive.
        // Weight comment velocity 2.5x higher than like velocity.
        var commentVelocity = post.CommentsCount;
        var likeVelocity = post.LikesCount;
        var weightedSurge = (commentVelocity * 2.5d) + (likeVelocity * 1.0d) + (post.RepostsCount * 1.5d) + (post.SharesCount * 2.0d);
        var rate = weightedSurge / Math.Max(20d, post.ViewsCount);

        return (commentVelocity >= 3 || weightedSurge >= 12d) && rate >= 0.08d;
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
        var dwellCount = ctx.AuthorDwellCounts.GetValueOrDefault(authorId, 0);

        // Either explicit growth or implicit dwell coupling (> 3 recent dwell sessions)
        return recent >= 3 || (recent - prior) >= 2 || dwellCount >= 4;
    }

    private static bool SessionImputationTrigger(Post post, ViewerContext ctx)
    {
        // Trigger E: If user dwelled significantly on this post in a recent session (> 25s)
        // without recording an explicit like/comment, impute it as a high-intent unrecorded candidate.
        if (ctx.ActualDwellSecondsByPost.TryGetValue(post.Id, out var dwell) && dwell >= 25d)
        {
            if (!ctx.LikedPostIds.Contains(post.Id) && !ctx.CommentedPostIds.Contains(post.Id))
            {
                return true;
            }
        }
        return false;
    }

    public static double EstimateExposurePropensity(Post post, ViewerContext ctx, DateTime nowUtc)
    {
        var propensity = 0.50d;

        if (ctx.FollowingIds.Contains(post.UserId))
        {
            propensity += 0.25d;
        }
        else
        {
            propensity -= 0.15d;
        }

        // Off-peak posting time (01:00 to 06:00 UTC) has lower organic discovery
        var postHour = post.CreatedAt.Hour;
        if (postHour >= 1 && postHour <= 6)
        {
            propensity *= 0.75d;
        }

        if (post.ViewsCount > 100)
        {
            propensity += 0.15d;
        }
        else if (post.ViewsCount < 10)
        {
            propensity -= 0.15d;
        }

        return Math.Clamp(propensity, 0.05d, 0.95d);
    }

    public static double ComputeCounterfactualInterest(Post post, ViewerContext ctx, double observedInteraction, double contentEstimate, DateTime nowUtc)
    {
        var propensity = EstimateExposurePropensity(post, ctx, nowUtc);
        if (propensity < 0.30d)
        {
            // Low exposure propensity: absence of interaction is uninformative (MNAR).
            // Back off heavily to content-based similarity.
            return 0.40d * observedInteraction + 0.60d * contentEstimate;
        }

        // Sufficient exposure propensity: observed interaction is trustworthy; apply inverse probability weighting.
        return Math.Clamp(observedInteraction / Math.Max(propensity, 0.10d), 0d, 1d);
    }

    public static (double Score, bool IsSilentFollower) ComputeImplicitAcquaintance(
        Guid authorId,
        ViewerContext ctx,
        IReadOnlyDictionary<Guid, int> mutualConnectionsByAuthor)
    {
        var dwellCount = ctx.AuthorDwellCounts.GetValueOrDefault(authorId, 0);
        var hasExplicitFollow = ctx.FollowingIds.Contains(authorId);
        var hasExplicitInteraction = ctx.InteractionFrequency30d.GetValueOrDefault(authorId, 0) > 0;

        // Silent follow: viewer frequently dwells on author's posts (> 3 dwell sessions) with 0 explicit follow/like
        var isSilentFollower = dwellCount >= 3 && !hasExplicitFollow && !hasExplicitInteraction;
        var silentFollowWeight = isSilentFollower ? 1.0d : 0.0d;

        var interactionFrequency = Clamp01(ctx.InteractionFrequency30d.GetValueOrDefault(authorId, 0) / 20d);
        var mutualConnections = Clamp01(mutualConnectionsByAuthor.GetValueOrDefault(authorId, 0) / 25d);

        var recencyDays = ctx.LastAuthorInteractionUtc.TryGetValue(authorId, out var lastSeen)
            ? Math.Max(0d, (DateTime.UtcNow - lastSeen).TotalDays)
            : 365d;
        var recencySignal = 1d - Clamp01(recencyDays / 90d);

        // Behavioral coupling score:
        // 0.35 * explicit interaction + 0.25 * mutual connections + 0.20 * recency + 0.20 * silent follow
        var score = interactionFrequency * 0.35d +
                    mutualConnections * 0.25d +
                    recencySignal * 0.20d +
                    silentFollowWeight * 0.20d;

        return (Clamp01(score), isSilentFollower);
    }

    public static FatigueState DetectResurfacingFatigue(IEnumerable<UserInteractionEvent> interactionEvents, DateTime nowUtc, RankingThresholds thresholds)
    {
        var olderPostEvents = interactionEvents
            .Where(e => e.CreatedAt >= nowUtc.AddDays(-7) && e.TargetType == "post" && e.DurationSeconds.HasValue)
            .OrderBy(e => e.CreatedAt)
            .ToList();

        if (olderPostEvents.Count < 4)
        {
            return new FatigueState(false, 0d, thresholds.BaseResurfacingThreshold);
        }

        var dwells = olderPostEvents.Select(e => (double)e.DurationSeconds!.Value).ToList();
        var skips = olderPostEvents.Count(e => e.DurationSeconds!.Value <= 2 || e.Type == InteractionEventType.Skip);
        var skipRate = skips / (double)olderPostEvents.Count;

        var recentEvents = olderPostEvents.Where(e => e.CreatedAt >= nowUtc.AddDays(-3)).ToList();
        var priorEvents = olderPostEvents.Where(e => e.CreatedAt < nowUtc.AddDays(-3)).ToList();
        var recentCompletion = recentEvents.Count == 0
            ? 0d
            : recentEvents.Count(e => e.Type == InteractionEventType.Complete) / (double)recentEvents.Count;
        var priorCompletion = priorEvents.Count == 0
            ? 0d
            : priorEvents.Count(e => e.Type == InteractionEventType.Complete) / (double)priorEvents.Count;
        var completionDrop = Math.Max(0d, priorCompletion - recentCompletion);

        // Linear regression slope of dwell times
        var n = dwells.Count;
        var sumX = 0d;
        var sumY = 0d;
        var sumXy = 0d;
        var sumX2 = 0d;
        for (var i = 0; i < n; i++)
        {
            sumX += i;
            sumY += dwells[i];
            sumXy += i * dwells[i];
            sumX2 += i * i;
        }

        var denominator = n * sumX2 - sumX * sumX;
        var slope = Math.Abs(denominator) > 0.0001d ? (n * sumXy - sumX * sumY) / denominator : 0d;

        // Negative slope means dwell times are dropping over consecutive exposures
        var negativeSlope = Math.Max(0d, -slope / 10d);
        var fatigueScore = Math.Clamp(negativeSlope * 0.35d + skipRate * 0.45d + completionDrop * 0.20d, 0d, 1d);

        var isFatigued = fatigueScore > thresholds.FatigueScoreThreshold;
        var threshold = isFatigued || completionDrop > thresholds.CompletionDropThreshold
            ? thresholds.FatiguedResurfacingThreshold
            : thresholds.BaseResurfacingThreshold;

        return new FatigueState(isFatigued, fatigueScore, threshold);
    }

    public static List<Dictionary<string, double>> BuildPreferenceClusters(Dictionary<string, double> interestVector)
    {
        if (interestVector.Count == 0)
        {
            return new List<Dictionary<string, double>>();
        }

        // Partition user's interest topics into up to 4 clusters (chunked by priority)
        var sorted = interestVector
            .OrderByDescending(p => p.Value)
            .ToList();

        var clusters = new List<Dictionary<string, double>>();
        const int chunkSize = 5;
        for (var i = 0; i < sorted.Count && clusters.Count < 4; i += chunkSize)
        {
            var cluster = sorted
                .Skip(i)
                .Take(chunkSize)
                .ToDictionary(p => p.Key, p => p.Value, StringComparer.OrdinalIgnoreCase);
            clusters.Add(cluster);
        }

        return clusters;
    }

    public static double ComputeHeterogeneousScore(
        IReadOnlyList<Dictionary<string, double>> clusters,
        IReadOnlyDictionary<string, double> postVector)
    {
        if (clusters.Count == 0 || postVector.Count == 0)
        {
            return 0d;
        }

        var scores = new List<double>(clusters.Count);
        foreach (var cluster in clusters)
        {
            scores.Add(CosineSimilarity(cluster, postVector));
        }

        scores.Sort();
        // 80th percentile: index = ceil(0.8 * count) - 1
        var p80Index = Math.Min(scores.Count - 1, (int)Math.Ceiling(scores.Count * 0.8d) - 1);
        return scores[p80Index];
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

    public static double CosineSimilarity(
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

    // Affirmations are positive engagement signals used by ranking and resurfacing.
    private static double CalculateAffirmationScore(Post post)
    {
        return post.LikesCount + post.CommentsCount + post.RepostsCount + post.SharesCount + post.BookmarksCount;
    }

    private static double Clamp01(double value)
    {
        if (value < 0d) return 0d;
        if (value > 1d) return 1d;
        return value;
    }

    public sealed record FatigueState(bool IsFatigued, double Score, double Threshold);

    public sealed record RankingThresholds(
        double NegativeVetoThreshold,
        double AttentionCompletionThreshold,
        double AttentionDwellSecondsThreshold,
        double MeaningfulThreshold,
        double LongTermValueThreshold,
        double FatigueScoreThreshold,
        double CompletionDropThreshold,
        double BaseResurfacingThreshold,
        double FatiguedResurfacingThreshold)
    {
        public static RankingThresholds FromConfiguration(IConfiguration configuration)
        {
            var section = configuration.GetSection("FeedRanking:Thresholds");
            return new RankingThresholds(
                ReadDouble(section, "NegativeVetoThreshold", 0.30d),
                ReadDouble(section, "AttentionCompletionThreshold", 0.50d),
                ReadDouble(section, "AttentionDwellSecondsThreshold", 30d),
                ReadDouble(section, "MeaningfulThreshold", 0.40d),
                ReadDouble(section, "LongTermValueThreshold", 0.35d),
                ReadDouble(section, "FatigueScoreThreshold", 0.55d),
                ReadDouble(section, "CompletionDropThreshold", 0.15d),
                ReadDouble(section, "BaseResurfacingThreshold", 0.45d),
                ReadDouble(section, "FatiguedResurfacingThreshold", 0.70d));
        }

        private static double ReadDouble(IConfiguration section, string key, double fallback)
        {
            var raw = section[key];
            return double.TryParse(raw, out var parsed) ? parsed : fallback;
        }
    }

    private sealed record CandidateSet(
        List<Post> NewPosts,
        List<Post> OldPosts,
        IReadOnlyList<string> TrendingTopics);

    public sealed record ViewerContext(
        HashSet<Guid> FollowingIds,
        HashSet<Guid> BlockedAuthorIds,
        HashSet<Guid> LikedPostIds,
        HashSet<Guid> RepostedPostIds,
        HashSet<Guid> BookmarkedPostIds,
        HashSet<Guid> CommentedPostIds,
        HashSet<Guid> ViewedPostIds,
        HashSet<Guid> DismissedPostIds,
        HashSet<Guid> SkippedPostIds,
        HashSet<Guid> HiddenAuthorIds,
        Dictionary<string, double> CurrentInterestVector,
        Dictionary<string, double> HistoricalInterestVector,
        List<Dictionary<string, double>> PreferenceClusters,
        Dictionary<PostType, double> FormatPreference,
        Dictionary<string, double> TopicDwellSeconds,
        Dictionary<string, double> TopicCompletionRate,
        Dictionary<string, double> TopicAffinity,
        Dictionary<Guid, int> RecentInteractions14d,
        Dictionary<Guid, int> PriorInteractions14d,
        Dictionary<Guid, int> InteractionFrequency30d,
        Dictionary<Guid, DateTime> LastAuthorInteractionUtc,
        Dictionary<Guid, double> ActualDwellSecondsByPost,
        Dictionary<Guid, double> ActualCompletionByPost,
        Dictionary<Guid, int> AuthorDwellCounts,
        FatigueState Fatigue,
        IReadOnlyList<string> TrendingTopics);

    public sealed record UserPostSignals(
        bool UserLikedThisPost,
        bool UserCommentedBefore,
        bool UserSharedBefore,
        double UserDwellTimeOnSimilar,
        double UserCompletionRateOnSimilar,
        bool UserViewedButNotInteracted,
        bool UserMarkedNotInterested,
        bool UserHiddenAuthor,
        double DwellResidual,
        double CompletionResidual,
        bool SilentInterest,
        bool SilentAversion);

    public sealed record AcquaintanceSignals(
        double InteractionFrequency30d,
        double MutualConnections,
        double ContentConsumptionRatio,
        double LastInteractionRecencyDays,
        double AcquaintanceScore,
        bool IsSilentFollower);

    public sealed record QualitySignals(
        double GlobalEngagementRate,
        double CommentDepth,
        double CompletionRateGlobal,
        double RecencyDecay,
        double AiNewsTopicOverlap,
        double AgeDays);

    public sealed record InterestSignals(
        double InterestCosineSimilarity,
        double HeterogeneousCosineSimilarity,
        double TopicAffinity,
        double FormatPreference);

    public sealed record PredictionSignals(
        double WillLike,
        double WillComment,
        double WillShare,
        double PredictedDwellTimeSeconds,
        double PredictedCompletion,
        double WillFindMeaningful,
        double SparkDiscussionIfComment,
        double WillHideOrReport,
        double InterestCosineSimilarity,
        double AcquaintanceScore);

    private sealed record ScoredPost(Post Post, double Score, double ResurfacingScore, double NegativeRisk);

    private sealed record AuthorInteractionRow(Guid AuthorId, DateTime Timestamp);

    private sealed record RegionalTrendItem(string Topic, decimal Score, string Source, string Category);
}
