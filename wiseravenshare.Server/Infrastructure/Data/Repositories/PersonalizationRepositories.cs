using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Entities.Personalization;
using Wiseravenshare.Server.Interfaces.Repositories.Personalization;
using TagType = Wiseravenshare.Server.Entities.Personalization.TagType;

namespace Wiseravenshare.Server.Infrastructure.Data.Repositories;

public class UserProfileRepository : IUserProfileRepository
{
    private readonly AppDbContext _db;

    public UserProfileRepository(AppDbContext db)
    {
        _db = db;
    }

    public async Task<UserProfile?> GetByUserIdAsync(Guid userId)
    {
        return await _db.UserProfiles
            .Include(p => p.User)
            .FirstOrDefaultAsync(p => p.UserId == userId);
    }

    public async Task AddAsync(UserProfile profile)
    {
        await _db.UserProfiles.AddAsync(profile);
        await _db.SaveChangesAsync();
    }

    public async Task UpdateAsync(UserProfile profile)
    {
        _db.UserProfiles.Update(profile);
        await _db.SaveChangesAsync();
    }
}

public class UserInteractionRepository : IUserInteractionRepository
{
    private readonly AppDbContext _db;

    public UserInteractionRepository(AppDbContext db)
    {
        _db = db;
    }

    public async Task AddAsync(UserInteraction interaction)
    {
        await _db.UserInteractions.AddAsync(interaction);
        await _db.SaveChangesAsync();
    }

    public async Task<IEnumerable<UserInteraction>> GetUserInteractionsAsync(Guid userId, int limit = 1000, DateTime? fromDate = null)
    {
        var query = _db.UserInteractions.Where(i => i.UserId == userId);
        if (fromDate.HasValue)
        {
            query = query.Where(i => i.CreatedAt >= fromDate.Value);
        }
        return await query.OrderByDescending(i => i.CreatedAt).Take(limit).ToListAsync();
    }

    public async Task<IEnumerable<User>> GetSimilarUsersAsync(Guid userId, int count = 10)
    {
        return await _db.Users
            .Where(u => u.Id != userId && u.IsActive)
            .Take(count)
            .ToListAsync();
    }

    public async Task AddLearningEventAsync(UserLearningEvent learningEvent)
    {
        await _db.UserLearningEvents.AddAsync(learningEvent);
        await _db.SaveChangesAsync();
    }

    public async Task<IEnumerable<UserLearningEvent>> GetLearningEventsAsync(Guid userId)
    {
        return await _db.UserLearningEvents
            .Where(e => e.UserId == userId)
            .OrderByDescending(e => e.CreatedAt)
            .Take(100)
            .ToListAsync();
    }
}

public class ContentTagRepository : IContentTagRepository
{
    private readonly AppDbContext _db;

    public ContentTagRepository(AppDbContext db)
    {
        _db = db;
    }

    public async Task<ContentTag?> GetByIdAsync(Guid tagId)
    {
        return await _db.ContentTags.FirstOrDefaultAsync(t => t.Id == tagId);
    }

    public async Task<ContentTag?> GetByNameAsync(string name)
    {
        return await _db.ContentTags.FirstOrDefaultAsync(t => t.Name.ToLower() == name.ToLower());
    }

    public async Task<ContentTag> GetOrCreateAsync(string name, TagCategory category = TagCategory.General)
    {
        var tag = await GetByNameAsync(name);
        if (tag != null)
        {
            tag.UsageCount++;
            _db.ContentTags.Update(tag);
            await _db.SaveChangesAsync();
            return tag;
        }

        tag = new ContentTag
        {
            Name = name.Trim(),
            Category = category,
            Type = TagType.AI,
            UsageCount = 1
        };

        await _db.ContentTags.AddAsync(tag);
        await _db.SaveChangesAsync();
        return tag;
    }

    public async Task AddMappingAsync(ContentTagMapping mapping)
    {
        await _db.ContentTagMappings.AddAsync(mapping);
        await _db.SaveChangesAsync();
    }

    public async Task<IEnumerable<ContentTagMapping>> GetMappingsAsync(string targetType, Guid targetId)
    {
        return await _db.ContentTagMappings
            .Where(m => m.TargetType == targetType && m.TargetId == targetId)
            .ToListAsync();
    }

    public async Task<IEnumerable<ContentTagMapping>> GetContentByTagsAsync(string[] tags, TagCategory category, int count = 20)
    {
        var lowerTags = tags.Select(t => t.ToLower()).ToList();
        return await _db.ContentTagMappings
            .Include(m => m.Tag)
            .Where(m => lowerTags.Contains(m.Tag.Name.ToLower()))
            .Take(count)
            .ToListAsync();
    }

    public async Task<IEnumerable<SimilarContentResult>> FindSimilarContentAsync(List<Guid> tagIds, int count = 10)
    {
        var mappings = await _db.ContentTagMappings
            .Where(m => tagIds.Contains(m.ContentTagId))
            .GroupBy(m => new { m.TargetId, m.TargetType })
            .Select(g => new SimilarContentResult
            {
                Id = g.Key.TargetId,
                Title = g.Key.TargetType + " #" + g.Key.TargetId.ToString().Substring(0, 8),
                SimilarityScore = (decimal)g.Count() / Math.Max(1, tagIds.Count)
            })
            .OrderByDescending(r => r.SimilarityScore)
            .Take(count)
            .ToListAsync();

        return mappings;
    }
}

public class LearningModelRepository : ILearningModelRepository
{
    private readonly AppDbContext _db;

    public LearningModelRepository(AppDbContext db)
    {
        _db = db;
    }

    public async Task<LearningModel?> GetByIdAsync(Guid modelId)
    {
        return await _db.LearningModels.FirstOrDefaultAsync(m => m.Id == modelId);
    }

    public async Task AddAsync(LearningModel model)
    {
        await _db.LearningModels.AddAsync(model);
        await _db.SaveChangesAsync();
    }

    public async Task UpdateAsync(LearningModel model)
    {
        _db.LearningModels.Update(model);
        await _db.SaveChangesAsync();
    }

    public async Task<IEnumerable<LearningModel>> GetActiveModelsAsync()
    {
        return await _db.LearningModels
            .Where(m => m.Status == ModelStatus.Deployed)
            .ToListAsync();
    }
}

public class ModelPredictionRepository : IModelPredictionRepository
{
    private readonly AppDbContext _db;

    public ModelPredictionRepository(AppDbContext db)
    {
        _db = db;
    }

    public async Task AddAsync(ModelPrediction prediction)
    {
        await _db.ModelPredictions.AddAsync(prediction);
        await _db.SaveChangesAsync();
    }

    public async Task<IEnumerable<ModelPrediction>> GetUserPredictionsAsync(Guid userId, int count = 50)
    {
        return await _db.ModelPredictions
            .Where(p => p.UserId == userId)
            .OrderByDescending(p => p.Score)
            .Take(count)
            .ToListAsync();
    }
}
