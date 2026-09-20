using Wiseravenshare.Server.Entities.Personalization;

namespace Wiseravenshare.Server.Interfaces.Repositories.Personalization;

public interface IUserProfileRepository
{
    Task<UserProfile?> GetByUserIdAsync(Guid userId);
    Task AddAsync(UserProfile profile);
    Task UpdateAsync(UserProfile profile);
}

public interface IUserInteractionRepository
{
    Task AddAsync(UserInteraction interaction);
    Task<IEnumerable<UserInteraction>> GetUserInteractionsAsync(Guid userId, int limit = 1000, DateTime? fromDate = null);
    Task<IEnumerable<Entities.User>> GetSimilarUsersAsync(Guid userId, int count = 10);
    Task AddLearningEventAsync(UserLearningEvent learningEvent);
    Task<IEnumerable<UserLearningEvent>> GetLearningEventsAsync(Guid userId);
}

public interface IContentTagRepository
{
    Task<ContentTag?> GetByIdAsync(Guid tagId);
    Task<ContentTag?> GetByNameAsync(string name);
    Task<ContentTag> GetOrCreateAsync(string name, TagCategory category = TagCategory.General);
    Task AddMappingAsync(ContentTagMapping mapping);
    Task<IEnumerable<ContentTagMapping>> GetMappingsAsync(string targetType, Guid targetId);
    Task<IEnumerable<ContentTagMapping>> GetContentByTagsAsync(string[] tags, TagCategory category, int count = 20);
    Task<IEnumerable<SimilarContentResult>> FindSimilarContentAsync(List<Guid> tagIds, int count = 10);
}

public class SimilarContentResult
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public decimal SimilarityScore { get; set; }
}

public interface ILearningModelRepository
{
    Task<LearningModel?> GetByIdAsync(Guid modelId);
    Task AddAsync(LearningModel model);
    Task UpdateAsync(LearningModel model);
    Task<IEnumerable<LearningModel>> GetActiveModelsAsync();
}

public interface IModelPredictionRepository
{
    Task AddAsync(ModelPrediction prediction);
    Task<IEnumerable<ModelPrediction>> GetUserPredictionsAsync(Guid userId, int count = 50);
}
