// Wiseravenshare.Server/Services/Currency/EngagementMultiplierService.cs
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Interfaces.Repositories;

namespace Wiseravenshare.Server.Services.Currency;

/// <summary>
/// Calculates engagement-based reward multipliers for content creation.
/// Factors: engagement ratio (interactions vs reach), truth consensus, community sentiment.
/// Returns 0.5x - 2.0x multiplier based on post performance.
/// </summary>
public interface IEngagementMultiplierService
{
    Task<decimal> GetPostEngagementMultiplierAsync(Guid postId, Guid userId);
    Task<decimal> CalculateEngagementScoreAsync(Post post, User user);
}

public class EngagementMultiplierService : IEngagementMultiplierService
{
    private readonly IRepository<Post> _postRepository;
    private readonly IRepository<User> _userRepository;
    private readonly IPostInteractionRepository _interactionRepository;
    private readonly ILogger<EngagementMultiplierService> _logger;

    // Multiplier ranges: minimum 0.5x (poor engagement), maximum 2.0x (excellent engagement)
    private const decimal MIN_MULTIPLIER = 0.5m;
    private const decimal MAX_MULTIPLIER = 2.0m;
    private const decimal BASE_MULTIPLIER = 1.0m;

    public EngagementMultiplierService(
        IRepository<Post> postRepository,
        IRepository<User> userRepository,
        IPostInteractionRepository interactionRepository,
        ILogger<EngagementMultiplierService> logger)
    {
        _postRepository = postRepository;
        _userRepository = userRepository;
        _interactionRepository = interactionRepository;
        _logger = logger;
    }

    public async Task<decimal> GetPostEngagementMultiplierAsync(Guid postId, Guid userId)
    {
        try
        {
            var post = await _postRepository.GetByIdAsync(postId);
            if (post == null)
                return BASE_MULTIPLIER;

            var user = await _userRepository.GetByIdAsync(userId);
            if (user == null)
                return BASE_MULTIPLIER;

            var score = await CalculateEngagementScoreAsync(post, user);
            var multiplier = ConvertScoreToMultiplier(score);
            
            _logger.LogInformation(
                "Engagement multiplier for post {PostId} by user {UserId}: {Score:F2} -> {Multiplier:F2}x",
                postId, userId, score, multiplier);

            return multiplier;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error calculating engagement multiplier for post {PostId}", postId);
            return BASE_MULTIPLIER;
        }
    }

    public async Task<decimal> CalculateEngagementScoreAsync(Post post, User user)
    {
        if (post == null || post.CreatedAt == null)
            return 0m;

        // Calculate age-normalized metrics (prevent spam from aging posts)
        var postAgeHours = (DateTime.UtcNow - post.CreatedAt.Value).TotalHours;
        var ageNormalization = Math.Min(postAgeHours / 24.0, 1.0); // 0-1 scale, max at 24h

        if (ageNormalization < 0.1)
            return BASE_MULTIPLIER; // Too fresh, insufficient engagement data

        // Component 1: Engagement Ratio (0-0.4 points)
        // Normalized: (likes + reposts*2 + replies*3) / expected engagement for follower count
        var engagementRatio = CalculateEngagementRatio(post, user, ageNormalization);
        var engagementScore = Math.Min(engagementRatio * 0.4m, 0.4m);

        // Component 2: Truth Consensus (0-0.3 points)
        // Posts with high truth scores contribute more credible content
        var truthConsensus = CalculateTruthConsensus(post, user);
        var truthScore = Math.Min(truthConsensus * 0.3m, 0.3m);

        // Component 3: Community Sentiment (0-0.2 points)
        // User's reputation/truth score weighted by post quality
        var communityScore = CalculateCommunityReputation(user) * 0.2m;

        // Component 4: Content Quality Indicators (0-0.1 points)
        // Media presence, length, formatting
        var qualityScore = CalculateContentQuality(post) * 0.1m;

        var totalScore = engagementScore + truthScore + communityScore + qualityScore;

        _logger.LogDebug(
            "Engagement score breakdown for post {PostId}: engagement={Engagement:F2}, truth={Truth:F2}, community={Community:F2}, quality={Quality:F2}, total={Total:F2}",
            post.Id, engagementScore, truthScore, communityScore, qualityScore, totalScore);

        return Math.Max(0m, Math.Min(totalScore, 1.0m)); // 0-1 scale
    }

    private decimal CalculateEngagementRatio(Post post, User user, double ageNormalization)
    {
        if (string.IsNullOrEmpty(user.FollowersCount?.ToString()))
            return 0m;

        var followerCount = Math.Max(user.FollowersCount ?? 1, 1);

        // Total engagement: likes + reposts*2 (higher value) + replies*3 (most valuable)
        var totalEngagement = (post.LikesCount ?? 0) 
            + (post.RepostsCount ?? 0) * 2 
            + (post.RepliesCount ?? 0) * 3;

        // Expected engagement: 5-10% of follower base per day
        var expectedEngagement = followerCount * 0.075m;

        // Engagement ratio: actual vs expected
        var ratio = expectedEngagement > 0 ? totalEngagement / (decimal)expectedEngagement : 0m;

        // Decay with time (fresh posts are expected to have higher ratios)
        return Math.Min(ratio * (decimal)ageNormalization, 2.0m);
    }

    private decimal CalculateTruthConsensus(Post post, User user)
    {
        if (post.TruthScore == null)
            return 0.5m; // Neutral for opinion/question posts

        // Truth score 0-100, normalize to 0-1
        var normalizedTruthScore = (decimal)post.TruthScore / 100m;

        // Weight by user's truth score for authority
        var userTruthAuthority = Math.Min((user.TruthScore ?? 50m) / 100m, 1.0m);

        // Combined: post veracity * user authority
        return normalizedTruthScore * userTruthAuthority;
    }

    private decimal CalculateCommunityReputation(User user)
    {
        if (user == null)
            return 0.5m;

        // Truth score (0-100) -> normalized to 0-1
        var truthScore = Math.Min((user.TruthScore ?? 50m) / 100m, 1.0m);

        // Followers as reputation proxy (logarithmic scale)
        var followerScore = Math.Log10(Math.Max(user.FollowersCount ?? 1, 1)) / 5.0m; // log base for 100K followers = 1.0
        followerScore = Math.Min(followerScore, 1.0m);

        // Weighted average: truth score (60%), followers (40%)
        return (truthScore * 0.6m) + (followerScore * 0.4m);
    }

    private decimal CalculateContentQuality(Post post)
    {
        var quality = 0m;

        // Media presence (0.3 bonus): rich content
        if (post.MediaUrls?.Length > 0)
            quality += 0.3m;

        // Content length (0.4 bonus): substantive posts
        var contentLength = post.Content?.Length ?? 0;
        if (contentLength > 500) quality += 0.4m;
        else if (contentLength > 100) quality += 0.2m;

        // Engagement indicators (0.3 bonus): posts with replies/threads
        if ((post.RepliesCount ?? 0) > 0)
            quality += 0.3m;

        return Math.Min(quality, 1.0m);
    }

    private decimal ConvertScoreToMultiplier(decimal score)
    {
        // Score 0-1 -> Multiplier MIN_MULTIPLIER to MAX_MULTIPLIER
        // Formula: MIN + (MAX - MIN) * score
        // score=0.0 -> 0.5x, score=0.5 -> 1.25x, score=1.0 -> 2.0x
        var multiplier = MIN_MULTIPLIER + ((MAX_MULTIPLIER - MIN_MULTIPLIER) * score);
        return Math.Round(multiplier, 2);
    }
}
