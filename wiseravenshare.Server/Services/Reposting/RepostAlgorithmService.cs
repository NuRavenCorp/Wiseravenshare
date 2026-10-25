using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.DTOs.Post;
using Wiseravenshare.Server.DTOs.Reposting;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Infrastructure.Data;

namespace Wiseravenshare.Server.Services.Reposting;

public interface IRepostAlgorithmService
{
    Task<RepostVelocityDto> CalculateRepostVelocityAsync(Guid postId, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<AggregatedRepostFeedItemDto>> AggregateRepostCascadesAsync(
        Guid viewerUserId,
        IEnumerable<Post> candidatePosts,
        IReadOnlyDictionary<Guid, double> authorAcquaintanceScores,
        CancellationToken cancellationToken = default);
    double ComputeAttributedRepostScore(
        double authorAffinity,
        IEnumerable<double> reposterAcquaintanceScores,
        int totalRepostersCount,
        bool isCoordinatedRing = false);
}

public sealed class RepostAlgorithmService : IRepostAlgorithmService
{
    private const double DecayConstantPerHour = 0.045d; // 15h half-life
    private const double BetaAcquaintanceWeight = 0.65d;

    private readonly AppDbContext _db;
    private readonly ILogger<RepostAlgorithmService> _logger;

    public RepostAlgorithmService(AppDbContext db, ILogger<RepostAlgorithmService> logger)
    {
        _db = db;
        _logger = logger;
    }

    public async Task<RepostVelocityDto> CalculateRepostVelocityAsync(Guid postId, CancellationToken cancellationToken = default)
    {
        var nowUtc = DateTime.UtcNow;
        var post = await _db.Posts
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == postId, cancellationToken);

        if (post == null)
        {
            return new RepostVelocityDto
            {
                PostId = postId,
                CalculatedAtUtc = nowUtc,
                DampingMultiplier = 1.0d
            };
        }

        var postAgeHours = Math.Max(0.2d, (nowUtc - post.CreatedAt).TotalHours);

        // Fetch timestamps of recent reposts
        var recentReposts = await _db.PostReposts
            .AsNoTracking()
            .Where(r => r.PostId == postId)
            .OrderByDescending(r => r.CreatedAt)
            .Take(500)
            .Select(r => new { r.UserId, r.CreatedAt })
            .ToListAsync(cancellationToken);

        var totalReposts = Math.Max(post.RepostsCount, recentReposts.Count);
        var hourlyVelocity = totalReposts / postAgeHours;

        // Velocity in the last 4 hours vs previous 4 hours to evaluate acceleration
        var cutoff4h = nowUtc.AddHours(-4);
        var cutoff8h = nowUtc.AddHours(-8);
        var recent4hCount = recentReposts.Count(r => r.CreatedAt >= cutoff4h);
        var prior4hCount = recentReposts.Count(r => r.CreatedAt >= cutoff8h && r.CreatedAt < cutoff4h);

        var vRecent = recent4hCount / 4.0d;
        var vPrior = prior4hCount / 4.0d;
        var acceleration = vRecent - vPrior;
        var isAccelerating = acceleration > 0.1d;

        // Viral coefficient R0 = Reposts / (Views * 0.05 estimated exposure sample)
        var viewsSample = Math.Max(1.0, post.ViewsCount * 0.05d);
        var viralCoefficient = Math.Round(totalReposts / viewsSample, 3);

        // Temporal exponential decay dampening
        var temporalDecay = Math.Exp(-DecayConstantPerHour * postAgeHours);
        var amplificationScore = Math.Round((hourlyVelocity * 1.5d + viralCoefficient * 2.0d) * temporalDecay, 3);

        // Coordinated repost ring heuristic:
        // Multiple reposts from fresh accounts or rapid reciprocal looping
        var isCoordinated = false;
        var dampingMultiplier = 1.0d;

        if (recentReposts.Count >= 5)
        {
            var reposterIds = recentReposts.Select(r => r.UserId).Take(15).ToList();
            // Check if reposter accounts were created very recently (<24h)
            var freshReposters = await _db.Users
                .AsNoTracking()
                .Where(u => reposterIds.Contains(u.Id) && u.CreatedAt >= nowUtc.AddDays(-1))
                .CountAsync(cancellationToken);

            if (freshReposters >= 3 && freshReposters >= reposterIds.Count * 0.40)
            {
                isCoordinated = true;
                dampingMultiplier = 0.30d; // Severe dampening for sybil/bot repost spikes
            }
        }

        return new RepostVelocityDto
        {
            PostId = postId,
            HourlyVelocity = Math.Round(hourlyVelocity, 3),
            ViralCoefficient = viralCoefficient,
            AmplificationScore = Math.Round(amplificationScore * dampingMultiplier, 3),
            AccelerationRate = Math.Round(acceleration, 3),
            IsAccelerating = isAccelerating,
            IsPotentialCoordinatedRing = isCoordinated,
            DampingMultiplier = dampingMultiplier,
            CalculatedAtUtc = nowUtc
        };
    }

    public async Task<IReadOnlyList<AggregatedRepostFeedItemDto>> AggregateRepostCascadesAsync(
        Guid viewerUserId,
        IEnumerable<Post> candidatePosts,
        IReadOnlyDictionary<Guid, double> authorAcquaintanceScores,
        CancellationToken cancellationToken = default)
    {
        var candidatesList = candidatePosts.ToList();
        if (candidatesList.Count == 0)
        {
            return Array.Empty<AggregatedRepostFeedItemDto>();
        }

        // Group by canonical root post ID
        var groups = candidatesList
            .GroupBy(p => p.RepostOfId.HasValue ? p.RepostOfId.Value : p.Id)
            .ToList();

        var canonicalIds = groups.Select(g => g.Key).Distinct().ToList();
        var canonicalPosts = await _db.Posts
            .AsNoTracking()
            .Include(p => p.User)
            .Where(p => canonicalIds.Contains(p.Id))
            .ToDictionaryAsync(p => p.Id, cancellationToken);

        var userIdsInCandidates = candidatesList.Select(p => p.UserId).Distinct().ToList();
        var userProfiles = await _db.Users
            .AsNoTracking()
            .Where(u => userIdsInCandidates.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, cancellationToken);

        var result = new List<AggregatedRepostFeedItemDto>();

        foreach (var group in groups)
        {
            var rootId = group.Key;
            if (!canonicalPosts.TryGetValue(rootId, out var rootPost))
            {
                // Fallback to first item in group if root wasn't fetched
                rootPost = group.First();
            }

            // Identify all reposter users in this cascade
            var repostItems = group.Where(p => p.RepostOfId.HasValue).ToList();
            var reposterSummaries = new List<ReposterSummaryDto>();

            foreach (var repost in repostItems)
            {
                if (userProfiles.TryGetValue(repost.UserId, out var reposterUser))
                {
                    var reposterAcquaintance = authorAcquaintanceScores.GetValueOrDefault(repost.UserId, 0.1d);
                    reposterSummaries.Add(new ReposterSummaryDto
                    {
                        UserId = reposterUser.Id,
                        Username = reposterUser.Username ?? "user",
                        DisplayName = reposterUser.DisplayName ?? reposterUser.Username ?? "Creator",
                        AvatarUrl = reposterUser.AvatarUrl,
                        RepostedAtUtc = repost.CreatedAt,
                        AcquaintanceScore = reposterAcquaintance
                    });
                }
            }

            var authorScore = authorAcquaintanceScores.GetValueOrDefault(rootPost.UserId, 0.2d);
            var reposterScores = reposterSummaries.Select(r => r.AcquaintanceScore).ToList();
            var attributedWeight = ComputeAttributedRepostScore(authorScore, reposterScores, reposterSummaries.Count);

            var summaryLabel = BuildSummaryLabel(reposterSummaries);

            result.Add(new AggregatedRepostFeedItemDto
            {
                CanonicalPostId = rootPost.Id,
                Post = MapToSimplePostDto(rootPost),
                Reposters = reposterSummaries.OrderByDescending(r => r.AcquaintanceScore).ToList(),
                TotalRepostersCount = Math.Max(rootPost.RepostsCount, reposterSummaries.Count),
                AttributedAcquaintanceWeight = Math.Round(attributedWeight, 3),
                SummaryLabel = summaryLabel
            });
        }

        return result.OrderByDescending(i => i.AttributedAcquaintanceWeight).ToList();
    }

    public double ComputeAttributedRepostScore(
        double authorAffinity,
        IEnumerable<double> reposterAcquaintanceScores,
        int totalRepostersCount,
        bool isCoordinatedRing = false)
    {
        var scoresList = reposterAcquaintanceScores.ToList();
        var maxReposterAcquaintance = scoresList.Count > 0 ? scoresList.Max() : 0d;

        // Attributed acquaintance weight = S_author + beta * max(S_reposter) * ln(1 + count)
        var cascadeFactor = Math.Log(1.0 + Math.Max(0, totalRepostersCount));
        var score = authorAffinity + (BetaAcquaintanceWeight * maxReposterAcquaintance * Math.Min(2.5, cascadeFactor));

        if (isCoordinatedRing)
        {
            score *= 0.35d; // Anti-echo-chamber penalty
        }

        return Math.Max(0.01d, score);
    }

    private static string BuildSummaryLabel(IReadOnlyList<ReposterSummaryDto> reposters)
    {
        if (reposters.Count == 0) return string.Empty;
        if (reposters.Count == 1) return $"Reposted by {reposters[0].DisplayName}";
        if (reposters.Count == 2) return $"Reposted by {reposters[0].DisplayName} and {reposters[1].DisplayName}";
        return $"Reposted by {reposters[0].DisplayName}, {reposters[1].DisplayName} and {reposters.Count - 2} others";
    }

    private static PostDto MapToSimplePostDto(Post post)
    {
        return new PostDto
        {
            Id = post.Id,
            UserId = post.UserId,
            Content = post.Content,
            Type = post.Type.ToString(),
            MediaUrls = post.MediaUrls,
            LikesCount = post.LikesCount,
            RepostsCount = post.RepostsCount,
            CommentsCount = post.CommentsCount,
            SharesCount = post.SharesCount,
            BookmarksCount = post.BookmarksCount,
            ViewsCount = post.ViewsCount,
            CreatedAt = post.CreatedAt,
            User = post.User != null ? new DTOs.User.UserDto
            {
                Id = post.User.Id,
                Username = post.User.Username ?? "",
                DisplayName = post.User.DisplayName ?? post.User.Username ?? "Creator",
                AvatarUrl = post.User.AvatarUrl
            } : new DTOs.User.UserDto { Id = post.UserId }
        };
    }
}
