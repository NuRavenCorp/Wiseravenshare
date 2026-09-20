using System.ComponentModel.DataAnnotations;
using System.Text.Json;

namespace Wiseravenshare.Server.DTOs.Personalization;

public class UserProfileDto
{
    public Guid UserId { get; set; }
    public string? AgeRange { get; set; }
    public string? Gender { get; set; }
    public string? Location { get; set; }
    public string? Timezone { get; set; }
    public string? Occupation { get; set; }
    public string[]? Languages { get; set; }
    public string LifeStage { get; set; } = "Unknown";
    public string[]? LifeInterests { get; set; }
    public string[]? CurrentGoals { get; set; }
    public string[]? LifeEvents { get; set; }
    public string[]? FavoriteGenres { get; set; }
    public string[]? FavoriteTopics { get; set; }
    public string[]? FavoriteCreators { get; set; }
    public string[]? PreferredContentTypes { get; set; }
    public string[]? ActiveHours { get; set; }
    public string[]? ActiveDays { get; set; }
    public int AverageSessionDuration { get; set; }
    public DateTime? LastActiveAt { get; set; }
}

public class UpdateUserProfileDto
{
    public string? AgeRange { get; set; }
    public string? Gender { get; set; }
    public string? Location { get; set; }
    public string? Timezone { get; set; }
    public string? Occupation { get; set; }
    public string[]? Languages { get; set; }
    public string? LifeStage { get; set; }
    public string[]? LifeInterests { get; set; }
    public string[]? CurrentGoals { get; set; }
    public string[]? LifeEvents { get; set; }
    public string[]? FavoriteGenres { get; set; }
    public string[]? FavoriteTopics { get; set; }
    public string[]? FavoriteCreators { get; set; }
    public string[]? PreferredContentTypes { get; set; }
}

public class UserInteractionDto
{
    public Guid Id { get; set; }
    public string Type { get; set; } = string.Empty;
    public string TargetType { get; set; } = string.Empty;
    public Guid? TargetId { get; set; }
    public string? TargetTitle { get; set; }
    public string? TargetCategory { get; set; }
    public string[]? TargetTags { get; set; }
    public int? EngagementScore { get; set; }
    public int? Duration { get; set; }
    public string? DeviceInfo { get; set; }
    public string? LocationInfo { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class TrackInteractionDto
{
    [Required]
    public string Type { get; set; } = string.Empty;

    [Required]
    public string TargetType { get; set; } = string.Empty;

    public Guid? TargetId { get; set; }
    public string? TargetTitle { get; set; }
    public string? TargetCategory { get; set; }
    public string[]? TargetTags { get; set; }
    public int? EngagementScore { get; set; }
    public int? Duration { get; set; }
    public string? DeviceInfo { get; set; }
    public string? LocationInfo { get; set; }
    public JsonDocument? ContextData { get; set; }
    public JsonDocument? Metadata { get; set; }
}

public class ContentTagDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string Category { get; set; } = "General";
    public string Type { get; set; } = "User";
    public int Weight { get; set; }
    public int UsageCount { get; set; }
    public string[]? Synonyms { get; set; }
    public string[]? RelatedTags { get; set; }
}

public class RecommendationDto
{
    public Guid ContentId { get; set; }
    public string ContentType { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public decimal Score { get; set; }
    public string? Reason { get; set; }
    public string? ImageUrl { get; set; }
    public string? Author { get; set; }
    public DateTime? PublishedAt { get; set; }
}

public class LearningModelDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string Type { get; set; } = string.Empty;
    public string Status { get; set; } = "Training";
    public string Version { get; set; } = "1.0.0";
    public decimal Accuracy { get; set; }
    public decimal Precision { get; set; }
    public decimal Recall { get; set; }
    public decimal F1Score { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? TrainedAt { get; set; }
    public int UsageCount { get; set; }
}

public class TrainModelDto
{
    [Required]
    public string Name { get; set; } = string.Empty;

    public string? Description { get; set; }

    [Required]
    public string Type { get; set; } = string.Empty;

    public string Version { get; set; } = "1.0.0";
    public JsonDocument? Configuration { get; set; }
    public JsonDocument? Architecture { get; set; }
}

public class CrawledContentDto
{
    [Required]
    public string ContentType { get; set; } = string.Empty;

    [Required]
    public Guid ContentId { get; set; }

    [Required]
    public string Content { get; set; } = string.Empty;

    public string[]? Tags { get; set; }
    public string? Source { get; set; }
    public DateTime? PublishedAt { get; set; }
}

public class ContentDiscoveryDto
{
    public Guid ContentId { get; set; }
    public string ContentType { get; set; } = string.Empty;
    public decimal Score { get; set; }
    public string? Reason { get; set; }
    public DateTime PredictedAt { get; set; }
}
