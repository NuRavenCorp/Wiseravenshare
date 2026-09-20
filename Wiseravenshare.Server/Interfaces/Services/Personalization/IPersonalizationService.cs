using System.Text.Json;
using Wiseravenshare.Server.DTOs.Personalization;

namespace Wiseravenshare.Server.Interfaces.Services.Personalization;

public interface IPersonalizationService
{
    // User Profile
    Task<UserProfileDto> GetUserProfileAsync(Guid userId);
    Task<UserProfileDto> UpdateUserProfileAsync(Guid userId, UpdateUserProfileDto dto);
    Task<UserProfileDto> BuildProfileFromInteractionsAsync(Guid userId);

    // Interaction Tracking
    Task TrackInteractionAsync(Guid userId, TrackInteractionDto dto);
    Task<IEnumerable<UserInteractionDto>> GetUserInteractionsAsync(Guid userId, DateTime? fromDate = null);

    // Content Tagging
    Task<IEnumerable<ContentTagDto>> GetContentTagsAsync(string targetType, Guid targetId);
    Task AutoTagContentAsync(string targetType, Guid targetId, string content);

    // Recommendations
    Task<IEnumerable<RecommendationDto>> GetPersonalizedRecommendationsAsync(Guid userId, int count = 20);
    Task<IEnumerable<RecommendationDto>> GetContextualRecommendationsAsync(Guid userId, ContextDto context);
    Task<IEnumerable<RecommendationDto>> GetSimilarContentAsync(Guid userId, Guid contentId, int count = 10);
    Task<IEnumerable<RecommendationDto>> GetTrendingForUserAsync(Guid userId, int count = 20);

    // Learning Models
    Task<LearningModelDto> TrainModelAsync(TrainModelDto dto);
    Task<LearningModelDto> GetModelAsync(Guid modelId);
    Task<IEnumerable<LearningModelDto>> GetActiveModelsAsync();
    Task<bool> DeployModelAsync(Guid modelId);
    Task<bool> RetrainModelAsync(Guid modelId);

    // Feedback & Adaptation
    Task ProcessFeedbackAsync(Guid userId, FeedbackDto dto);
    Task AdaptToUserAsync(Guid userId, AdaptRequestDto dto);
    Task<IEnumerable<AdaptationResultDto>> GetAdaptationResultsAsync(Guid userId);

    // Web Crawler Integration
    Task ProcessCrawledContentAsync(CrawledContentDto dto);
    Task<IEnumerable<ContentDiscoveryDto>> GetDiscoveredContentForUserAsync(Guid userId);
}

public class ContextDto
{
    public string? Location { get; set; }
    public string? TimeOfDay { get; set; }
    public string? DayOfWeek { get; set; }
    public string? DeviceType { get; set; }
    public string? Mood { get; set; }
    public string? Activity { get; set; }
}

public class FeedbackDto
{
    public Guid ContentId { get; set; }
    public string ContentType { get; set; } = string.Empty;
    public bool IsPositive { get; set; }
    public string? FeedbackType { get; set; }
    public string? Comment { get; set; }
    public int? Rating { get; set; }
}

public class AdaptRequestDto
{
    public string AdaptationType { get; set; } = string.Empty;
    public JsonDocument? Preferences { get; set; }
    public JsonDocument? Context { get; set; }
}

public class AdaptationResultDto
{
    public string AdaptationType { get; set; } = string.Empty;
    public bool Success { get; set; }
    public JsonDocument? Changes { get; set; }
    public decimal ConfidenceScore { get; set; }
    public DateTime AppliedAt { get; set; }
}
