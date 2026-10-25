using System.Text.Json.Serialization;

namespace Wiseravenshare.Server.DTOs.Posting;

public sealed class OptimalPostingWindowDto
{
    [JsonPropertyName("dayOfWeek")]
    public DayOfWeek DayOfWeek { get; set; }

    [JsonPropertyName("hourUtc")]
    public int HourUtc { get; set; }

    [JsonPropertyName("localHourLabel")]
    public string LocalHourLabel { get; set; } = string.Empty;

    [JsonPropertyName("timeSlotLabel")]
    public string TimeSlotLabel { get; set; } = string.Empty;

    [JsonPropertyName("expectedReachMultiplier")]
    public double ExpectedReachMultiplier { get; set; }

    [JsonPropertyName("audienceActivityDensity")]
    public double AudienceActivityDensity { get; set; }

    [JsonPropertyName("recommendedCategory")]
    public string RecommendedCategory { get; set; } = string.Empty;

    [JsonPropertyName("recommendationConfidence")]
    public double RecommendationConfidence { get; set; }
}

public sealed class EvaluatePostHealthRequestDto
{
    [JsonPropertyName("content")]
    public string Content { get; set; } = string.Empty;

    [JsonPropertyName("postType")]
    public string PostType { get; set; } = "Text";

    [JsonPropertyName("mediaUrls")]
    public string[]? MediaUrls { get; set; }

    [JsonPropertyName("hashtags")]
    public string[]? Hashtags { get; set; }
}

public sealed class PostHealthEvaluationDto
{
    [JsonPropertyName("contentQualityScore")]
    public double ContentQualityScore { get; set; }

    [JsonPropertyName("constructiveToneScore")]
    public double ConstructiveToneScore { get; set; }

    [JsonPropertyName("spamRiskScore")]
    public double SpamRiskScore { get; set; }

    [JsonPropertyName("readabilityScore")]
    public double ReadabilityScore { get; set; }

    [JsonPropertyName("hashtagSaturationScore")]
    public double HashtagSaturationScore { get; set; }

    [JsonPropertyName("hasExcessiveHashtags")]
    public bool HasExcessiveHashtags { get; set; }

    [JsonPropertyName("mediaEnrichmentScore")]
    public double MediaEnrichmentScore { get; set; }

    [JsonPropertyName("predictedEngagementTier")]
    public string PredictedEngagementTier { get; set; } = "Standard";

    [JsonPropertyName("isAffirmationCandidate")]
    public bool IsAffirmationCandidate { get; set; }

    [JsonPropertyName("affirmationPillar")]
    public string? AffirmationPillar { get; set; }

    [JsonPropertyName("feedback")]
    public IReadOnlyList<string> Feedback { get; set; } = Array.Empty<string>();

    [JsonPropertyName("suggestions")]
    public IReadOnlyList<string> Suggestions { get; set; } = Array.Empty<string>();
}
