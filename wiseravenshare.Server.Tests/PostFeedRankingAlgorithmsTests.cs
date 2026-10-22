using System;
using System.Collections.Generic;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Entities.Personalization;
using Wiseravenshare.Server.Services;
using Xunit;

namespace Wiseravenshare.Server.Tests;

public class PostFeedRankingAlgorithmsTests
{
    private static PostFeedRankingService.ViewerContext CreateEmptyViewerContext()
    {
        return new PostFeedRankingService.ViewerContext(
            new HashSet<Guid>(),
            new HashSet<Guid>(),
            new HashSet<Guid>(),
            new HashSet<Guid>(),
            new HashSet<Guid>(),
            new HashSet<Guid>(),
            new HashSet<Guid>(),
            new HashSet<Guid>(),
            new HashSet<Guid>(),
            new HashSet<Guid>(),
            new Dictionary<string, double>(),
            new Dictionary<string, double>(),
            new List<Dictionary<string, double>>(),
            new Dictionary<PostType, double>(),
            new Dictionary<string, double>(),
            new Dictionary<string, double>(),
            new Dictionary<string, double>(),
            new Dictionary<Guid, int>(),
            new Dictionary<Guid, int>(),
            new Dictionary<Guid, int>(),
            new Dictionary<Guid, DateTime>(),
            new Dictionary<Guid, double>(),
            new Dictionary<Guid, double>(),
            new Dictionary<Guid, int>(),
            new PostFeedRankingService.FatigueState(false, 0d, 0.45d),
            Array.Empty<string>());
    }

    [Fact]
    public void EstimateExposurePropensity_FollowedAuthorAndHighViews_ReturnsHighPropensity()
    {
        var authorId = Guid.NewGuid();
        var ctx = CreateEmptyViewerContext();
        ctx.FollowingIds.Add(authorId);

        var post = new Post
        {
            Id = Guid.NewGuid(),
            UserId = authorId,
            CreatedAt = new DateTime(2026, 10, 22, 14, 0, 0, DateTimeKind.Utc),
            ViewsCount = 250
        };

        var propensity = PostFeedRankingService.EstimateExposurePropensity(post, ctx, DateTime.UtcNow);
        Assert.True(propensity >= 0.70d, $"Expected high propensity but got {propensity}");
    }

    [Fact]
    public void EstimateExposurePropensity_UnfollowedOffPeakFewViews_ReturnsLowPropensity()
    {
        var authorId = Guid.NewGuid();
        var ctx = CreateEmptyViewerContext();

        var post = new Post
        {
            Id = Guid.NewGuid(),
            UserId = authorId,
            CreatedAt = new DateTime(2026, 10, 22, 3, 0, 0, DateTimeKind.Utc), // 3 AM UTC (off-peak)
            ViewsCount = 2
        };

        var propensity = PostFeedRankingService.EstimateExposurePropensity(post, ctx, DateTime.UtcNow);
        Assert.True(propensity < 0.30d, $"Expected low propensity for off-peak/unfollowed but got {propensity}");
    }

    [Fact]
    public void ComputeCounterfactualInterest_WhenPropensityIsLow_AppliesContentBackoffEstimate()
    {
        var authorId = Guid.NewGuid();
        var ctx = CreateEmptyViewerContext();
        var post = new Post
        {
            Id = Guid.NewGuid(),
            UserId = authorId,
            CreatedAt = new DateTime(2026, 10, 22, 2, 0, 0, DateTimeKind.Utc),
            ViewsCount = 1
        };

        const double observedInteraction = 0.0d; // Unviewed/uninteracted due to low exposure
        const double contentSimilarity = 0.85d;  // High semantic similarity

        var debiased = PostFeedRankingService.ComputeCounterfactualInterest(post, ctx, observedInteraction, contentSimilarity, DateTime.UtcNow);

        // When propensity < 0.30, formula is 0.4 * observed + 0.6 * contentEstimate
        // 0.4 * 0 + 0.6 * 0.85 = 0.51
        Assert.True(debiased > 0.40d, $"Expected debiasing to recover unobserved interest, got {debiased}");
    }

    [Fact]
    public void HeterogeneousPreferenceScore_Selects80thPercentile_CapturingNicheFit()
    {
        // 3 preference clusters: AI (high match), Music (low match), Cooking (zero match)
        var clusterAi = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase) { ["ai"] = 1.0, ["deeplearning"] = 0.8 };
        var clusterMusic = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase) { ["music"] = 1.0, ["audio"] = 0.9 };
        var clusterCooking = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase) { ["recipe"] = 1.0 };
        var clusters = new List<Dictionary<string, double>> { clusterAi, clusterMusic, clusterCooking };

        // Post about AI
        var postVector = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase) { ["ai"] = 1.0, ["deeplearning"] = 1.0 };

        var score = PostFeedRankingService.ComputeHeterogeneousScore(clusters, postVector);

        // Niche fit in clusterAi should yield high score (> 0.7) rather than being dragged down by cooking/music
        Assert.True(score > 0.70d, $"Expected high 80th percentile niche score, got {score}");
    }

    [Fact]
    public void ComputeImplicitAcquaintance_IdentifiesSilentFollower()
    {
        var authorId = Guid.NewGuid();
        var ctx = CreateEmptyViewerContext();
        ctx.AuthorDwellCounts[authorId] = 5; // Dwells frequently

        var mutualConnections = new Dictionary<Guid, int>();

        var (score, isSilentFollower) = PostFeedRankingService.ComputeImplicitAcquaintance(authorId, ctx, mutualConnections);

        Assert.True(isSilentFollower, "Expected user to be classified as silent follower");
        Assert.True(score > 0.15d, $"Expected positive acquaintance score from silent following, got {score}");
    }

    [Fact]
    public void DetectResurfacingFatigue_WhenDwellTimesDropAndSkipRateIsHigh_ActivatesCircuitBreaker()
    {
        var nowUtc = DateTime.UtcNow;
        var events = new List<UserInteractionEvent>
        {
            // Rapidly declining dwell times and skips over consecutive exposures
            new() { CreatedAt = nowUtc.AddDays(-6), TargetType = "post", DurationSeconds = 45 },
            new() { CreatedAt = nowUtc.AddDays(-5), TargetType = "post", DurationSeconds = 25 },
            new() { CreatedAt = nowUtc.AddDays(-4), TargetType = "post", DurationSeconds = 12 },
            new() { CreatedAt = nowUtc.AddDays(-3), TargetType = "post", DurationSeconds = 1, Type = InteractionEventType.Skip },
            new() { CreatedAt = nowUtc.AddDays(-2), TargetType = "post", DurationSeconds = 1, Type = InteractionEventType.Skip },
            new() { CreatedAt = nowUtc.AddDays(-1), TargetType = "post", DurationSeconds = 2, Type = InteractionEventType.Skip }
        };

        var fatigue = PostFeedRankingService.DetectResurfacingFatigue(events, nowUtc);

        Assert.True(fatigue.IsFatigued, "Expected fatigue circuit breaker to trigger");
        Assert.Equal(0.70d, fatigue.Threshold);
    }

    [Fact]
    public void DetectResurfacingFatigue_WhenDwellTimesAreHealthy_KeepsNormalThreshold()
    {
        var nowUtc = DateTime.UtcNow;
        var events = new List<UserInteractionEvent>
        {
            new() { CreatedAt = nowUtc.AddDays(-5), TargetType = "post", DurationSeconds = 35 },
            new() { CreatedAt = nowUtc.AddDays(-4), TargetType = "post", DurationSeconds = 40 },
            new() { CreatedAt = nowUtc.AddDays(-3), TargetType = "post", DurationSeconds = 38 },
            new() { CreatedAt = nowUtc.AddDays(-2), TargetType = "post", DurationSeconds = 42 },
            new() { CreatedAt = nowUtc.AddDays(-1), TargetType = "post", DurationSeconds = 50 }
        };

        var fatigue = PostFeedRankingService.DetectResurfacingFatigue(events, nowUtc);

        Assert.False(fatigue.IsFatigued, "Expected healthy dwell behavior not to trigger fatigue");
        Assert.Equal(0.45d, fatigue.Threshold);
    }
}
