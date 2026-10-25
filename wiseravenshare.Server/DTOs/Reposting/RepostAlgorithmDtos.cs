using System.Text.Json.Serialization;
using Wiseravenshare.Server.DTOs.Post;

namespace Wiseravenshare.Server.DTOs.Reposting;

public sealed class RepostVelocityDto
{
    [JsonPropertyName("postId")]
    public Guid PostId { get; set; }

    [JsonPropertyName("hourlyVelocity")]
    public double HourlyVelocity { get; set; }

    [JsonPropertyName("viralCoefficient")]
    public double ViralCoefficient { get; set; }

    [JsonPropertyName("amplificationScore")]
    public double AmplificationScore { get; set; }

    [JsonPropertyName("accelerationRate")]
    public double AccelerationRate { get; set; }

    [JsonPropertyName("isAccelerating")]
    public bool IsAccelerating { get; set; }

    [JsonPropertyName("isPotentialCoordinatedRing")]
    public bool IsPotentialCoordinatedRing { get; set; }

    [JsonPropertyName("dampingMultiplier")]
    public double DampingMultiplier { get; set; } = 1.0;

    [JsonPropertyName("calculatedAtUtc")]
    public DateTime CalculatedAtUtc { get; set; }
}

public sealed class ReposterSummaryDto
{
    [JsonPropertyName("userId")]
    public Guid UserId { get; set; }

    [JsonPropertyName("username")]
    public string Username { get; set; } = string.Empty;

    [JsonPropertyName("displayName")]
    public string DisplayName { get; set; } = string.Empty;

    [JsonPropertyName("avatarUrl")]
    public string? AvatarUrl { get; set; }

    [JsonPropertyName("repostedAtUtc")]
    public DateTime RepostedAtUtc { get; set; }

    [JsonPropertyName("acquaintanceScore")]
    public double AcquaintanceScore { get; set; }
}

public sealed class AggregatedRepostFeedItemDto
{
    [JsonPropertyName("canonicalPostId")]
    public Guid CanonicalPostId { get; set; }

    [JsonPropertyName("post")]
    public PostDto Post { get; set; } = null!;

    [JsonPropertyName("reposters")]
    public IReadOnlyList<ReposterSummaryDto> Reposters { get; set; } = Array.Empty<ReposterSummaryDto>();

    [JsonPropertyName("totalRepostersCount")]
    public int TotalRepostersCount { get; set; }

    [JsonPropertyName("attributedAcquaintanceWeight")]
    public double AttributedAcquaintanceWeight { get; set; }

    [JsonPropertyName("summaryLabel")]
    public string SummaryLabel { get; set; } = string.Empty;
}
