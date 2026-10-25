using System.Text.Json.Serialization;

namespace Wiseravenshare.Server.DTOs.Affirmations;

public enum AffirmationPillar
{
    Gratitude,
    Resilience,
    Growth,
    Mindfulness,
    Empowerment,
    Compassion,
    Wisdom
}

public enum CircadianPhase
{
    Morning,
    Midday,
    Evening
}

public sealed class AffirmationClassificationDto
{
    [JsonPropertyName("isAffirmation")]
    public bool IsAffirmation { get; set; }

    [JsonPropertyName("affirmationScore")]
    public double AffirmationScore { get; set; }

    [JsonPropertyName("primaryPillar")]
    public AffirmationPillar PrimaryPillar { get; set; }

    [JsonPropertyName("secondaryPillars")]
    public IReadOnlyList<AffirmationPillar> SecondaryPillars { get; set; } = Array.Empty<AffirmationPillar>();

    [JsonPropertyName("circadianPhase")]
    public CircadianPhase CircadianPhase { get; set; }

    [JsonPropertyName("isRestorativeForFatigue")]
    public bool IsRestorativeForFatigue { get; set; }

    [JsonPropertyName("matchedKeywords")]
    public IReadOnlyList<string> MatchedKeywords { get; set; } = Array.Empty<string>();
}

public sealed class DailyAffirmationDto
{
    [JsonPropertyName("id")]
    public Guid Id { get; set; }

    [JsonPropertyName("affirmationText")]
    public string AffirmationText { get; set; } = string.Empty;

    [JsonPropertyName("pillar")]
    public AffirmationPillar Pillar { get; set; }

    [JsonPropertyName("circadianPhase")]
    public CircadianPhase CircadianPhase { get; set; }

    [JsonPropertyName("reflectionPrompt")]
    public string ReflectionPrompt { get; set; } = string.Empty;

    [JsonPropertyName("authorName")]
    public string AuthorName { get; set; } = "Raven Wisdom";

    [JsonPropertyName("isCommunitySubmission")]
    public bool IsCommunitySubmission { get; set; }

    [JsonPropertyName("sourcePostId")]
    public Guid? SourcePostId { get; set; }

    [JsonPropertyName("totalReflectionsCount")]
    public int TotalReflectionsCount { get; set; }

    [JsonPropertyName("hasReflectedToday")]
    public bool HasReflectedToday { get; set; }

    [JsonPropertyName("userCurrentStreakDays")]
    public int UserCurrentStreakDays { get; set; }

    [JsonPropertyName("potentialRewardWsc")]
    public decimal PotentialRewardWsc { get; set; }

    [JsonPropertyName("isFatigueCalmingRecommendation")]
    public bool IsFatigueCalmingRecommendation { get; set; }
}

public sealed class ReflectOnAffirmationRequestDto
{
    [JsonPropertyName("personalNote")]
    public string? PersonalNote { get; set; }

    [JsonPropertyName("durationSeconds")]
    public int? DurationSeconds { get; set; }

    [JsonPropertyName("shareAsPost")]
    public bool ShareAsPost { get; set; }
}

public sealed class AffirmationReflectionResultDto
{
    [JsonPropertyName("success")]
    public bool Success { get; set; }

    [JsonPropertyName("affirmationId")]
    public Guid AffirmationId { get; set; }

    [JsonPropertyName("streakDays")]
    public int StreakDays { get; set; }

    [JsonPropertyName("wscRewardEarned")]
    public decimal WscRewardEarned { get; set; }

    [JsonPropertyName("message")]
    public string Message { get; set; } = string.Empty;

    [JsonPropertyName("unlockedBadge")]
    public string? UnlockedBadge { get; set; }

    [JsonPropertyName("createdPostId")]
    public Guid? CreatedPostId { get; set; }
}

public sealed class AffirmationStreakDto
{
    [JsonPropertyName("currentStreakDays")]
    public int CurrentStreakDays { get; set; }

    [JsonPropertyName("longestStreakDays")]
    public int LongestStreakDays { get; set; }

    [JsonPropertyName("totalReflectionsCompleted")]
    public int TotalReflectionsCompleted { get; set; }

    [JsonPropertyName("lastReflectedAtUtc")]
    public DateTime? LastReflectedAtUtc { get; set; }

    [JsonPropertyName("hasCompletedToday")]
    public bool HasCompletedToday { get; set; }

    [JsonPropertyName("totalWiseCoinEarned")]
    public decimal TotalWiseCoinEarned { get; set; }

    [JsonPropertyName("unlockedPillars")]
    public IReadOnlyList<AffirmationPillar> UnlockedPillars { get; set; } = Array.Empty<AffirmationPillar>();
}
