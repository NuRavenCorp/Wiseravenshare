using Microsoft.EntityFrameworkCore;
using WiseRavenShare.Server.Core.Interfaces.Repositories.Assistant;
using WiseRavenShare.Server.Entities.Assistant;

namespace Wiseravenshare.Server.Infrastructure.Data.Repositories;

public class AssistantConversationRepository
    : Repository<AssistantConversation>, IAssistantConversationRepository
{
    public AssistantConversationRepository(AppDbContext context) : base(context) { }

    public async Task<List<AssistantConversation>> GetByUserAsync(Guid userId)
        => await _dbSet.AsNoTracking()
            .Where(c => !c.IsDeleted && c.UserId == userId)
            .OrderByDescending(c => c.UpdatedAt)
            .ToListAsync();

    public async Task<AssistantConversation?> GetWithMessagesAsync(Guid id)
        => await _dbSet
            .Include(c => c.Messages.Where(m => !m.IsDeleted))
            .FirstOrDefaultAsync(c => c.Id == id && !c.IsDeleted);
}

public class AssistantMessageRepository
    : Repository<AssistantMessage>, IAssistantMessageRepository
{
    public AssistantMessageRepository(AppDbContext context) : base(context) { }

    public override async Task<AssistantMessage?> GetByIdAsync(Guid id)
        => await _dbSet.FirstOrDefaultAsync(m => m.Id == id && !m.IsDeleted);

    public async Task<List<AssistantMessage>> GetByConversationAsync(Guid conversationId, int skip = 0, int take = 50)
        => await _dbSet.AsNoTracking()
            .Where(m => m.ConversationId == conversationId && !m.IsDeleted)
            .OrderBy(m => m.CreatedAt)
            .Skip(skip)
            .Take(take)
            .ToListAsync();
}

public class AssistantFeedbackRepository
    : Repository<AssistantFeedback>, IAssistantFeedbackRepository
{
    public AssistantFeedbackRepository(AppDbContext context) : base(context) { }

    public async Task<List<AssistantFeedback>> GetUnprocessedAsync()
        => await _dbSet.AsNoTracking()
            .Where(f => !f.IsDeleted && !f.IsUsedInTraining)
            .OrderBy(f => f.CreatedAt)
            .ToListAsync();
}

public class AssistantKnowledgeRepository
    : Repository<AssistantKnowledge>, IAssistantKnowledgeRepository
{
    public AssistantKnowledgeRepository(AppDbContext context) : base(context) { }
}

public class AssistantLearningSampleRepository
    : Repository<AssistantLearningSample>, IAssistantLearningSampleRepository
{
    public AssistantLearningSampleRepository(AppDbContext context) : base(context) { }

    public async Task<List<AssistantLearningSample>> GetPendingAsync(int limit)
        => await _dbSet.AsNoTracking()
            .Where(s => !s.IsDeleted && s.Status == LearningSampleStatus.Pending)
            .OrderBy(s => s.CreatedAt)
            .Take(limit)
            .ToListAsync();

    public async Task<AssistantLearningSample?> GetByMessageIdAsync(Guid messageId)
        => await _dbSet.FirstOrDefaultAsync(s => s.MessageId == messageId && !s.IsDeleted);

    public async Task<IEnumerable<AssistantLearningSample>> GetApprovedAsync(DateTime? since = null)
    {
        var query = _dbSet.AsNoTracking()
            .Where(s => !s.IsDeleted && s.Status == LearningSampleStatus.Approved);
        if (since.HasValue)
            query = query.Where(s => s.UpdatedAt >= since.Value);
        return await query.OrderBy(s => s.CreatedAt).ToListAsync();
    }
}
