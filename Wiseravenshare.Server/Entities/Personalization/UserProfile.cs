using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using Wiseravenshare.Server.Entities;

namespace Wiseravenshare.Server.Entities.Personalization;

public class UserProfile : BaseEntity
{
    public Guid UserId { get; set; }

    // Demographic Context
    public string? AgeRange { get; set; }
    public string? Gender { get; set; }
    public string? Location { get; set; }
    public string? Timezone { get; set; }
    public string? Occupation { get; set; }
    public string[]? Languages { get; set; }

    // Life Context
    public LifeStage LifeStage { get; set; } = LifeStage.Unknown;
    public string[]? LifeInterests { get; set; }
    public string[]? CurrentGoals { get; set; }
    public string[]? LifeEvents { get; set; }

    // Behavioral Context
    public string[]? FavoriteGenres { get; set; }
    public string[]? FavoriteTopics { get; set; }
    public string[]? FavoriteCreators { get; set; }
    public string[]? PreferredContentTypes { get; set; }

    // Temporal Context
    public string[]? ActiveHours { get; set; }
    public string[]? ActiveDays { get; set; }
    public int AverageSessionDuration { get; set; }
    public DateTime? LastActiveAt { get; set; }

    // Learning Model Data
    public JsonDocument? FeatureVector { get; set; }
    public JsonDocument? EmbeddingVector { get; set; }
    public JsonDocument? PreferenceModel { get; set; }
    public JsonDocument? BehavioralPatterns { get; set; }

    // Navigation Properties
    public virtual User User { get; set; } = null!;
    public virtual ICollection<UserInteraction> Interactions { get; set; } = new List<UserInteraction>();
    public virtual ICollection<UserLearningEvent> LearningEvents { get; set; } = new List<UserLearningEvent>();
}

public enum LifeStage
{
    Unknown,
    Student,
    EarlyCareer,
    MidCareer,
    LateCareer,
    Retired,
    Parent,
    EmptyNester
}

public class UserInteraction : BaseEntity
{
    public Guid UserId { get; set; }
    public InteractionType Type { get; set; }
    public string TargetType { get; set; } = string.Empty;
    public Guid? TargetId { get; set; }
    public string? TargetTitle { get; set; }
    public string? TargetCategory { get; set; }
    public string? TargetTags { get; set; }
    public int? EngagementScore { get; set; }
    public int? Duration { get; set; }
    public string? DeviceInfo { get; set; }
    public string? LocationInfo { get; set; }
    public JsonDocument? ContextData { get; set; }
    public JsonDocument? Metadata { get; set; }

    // Navigation Properties
    public virtual User User { get; set; } = null!;
}

public enum InteractionType
{
    View,
    Like,
    Dislike,
    Comment,
    Share,
    Bookmark,
    Follow,
    Search,
    Click,
    Play,
    Skip,
    Complete,
    Dismiss,
    Report,
    Rate
}

public class UserLearningEvent : BaseEntity
{
    public Guid UserId { get; set; }
    public LearningEventType Type { get; set; }
    public string EventData { get; set; } = string.Empty;
    public JsonDocument? ModelInput { get; set; }
    public JsonDocument? ModelOutput { get; set; }
    public decimal ConfidenceScore { get; set; }
    public decimal RelevanceScore { get; set; }
    public bool IsFeedback { get; set; }
    public DateTime? FeedbackAt { get; set; }
    public JsonDocument? FeedbackData { get; set; }

    // Navigation Properties
    public virtual User User { get; set; } = null!;
}

public enum LearningEventType
{
    Recommendation,
    Prediction,
    Classification,
    Clustering,
    Embedding,
    Reinforcement,
    Feedback
}
