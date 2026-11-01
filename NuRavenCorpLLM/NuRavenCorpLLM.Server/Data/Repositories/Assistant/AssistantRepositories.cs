using Microsoft.EntityFrameworkCore;
using NuRavenCorpLLM.Core.Interfaces;
using NuRavenCorpLLM.Core.Interfaces.Repositories.Assistant;
using NuRavenCorpLLM.Entities;
using NuRavenCorpLLM.Infrastructure.Data;
using AssistantDbContext = NuRavenCorpLLM.Infrastructure.Data.ApplicationDbContext;

namespace NuRavenCorpLLM.Server.Data.Repositories.Assistant;

public class AssistantConversationRepository : IAssistantConversationRepository
{
    private readonly AssistantDbContext _ctx;

    public AssistantConversationRepository(AssistantDbContext ctx)
    {
        _ctx = ctx;
    }

    public Task<AssistantConversation?> GetByIdAsync(Guid id, CancellationToken ct = default)
        => _ctx.AssistantConversations
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == id && !x.IsDeleted, ct);

    public Task<List<AssistantConversation>> GetByUserAsync(Guid userId, CancellationToken ct = default)
        => _ctx.AssistantConversations
            .AsNoTracking()
            .Where(x => x.UserId == userId && !x.IsDeleted)
            .OrderByDescending(x => x.LastMessageAt)
            .Take(100)
            .ToListAsync(ct);

    public Task<AssistantConversation?> GetWithMessagesAsync(Guid conversationId, CancellationToken ct = default)
        => _ctx.AssistantConversations
            .Include(x => x.Messages.Where(m => !m.IsDeleted).OrderBy(m => m.CreatedAt))
            .FirstOrDefaultAsync(x => x.Id == conversationId && !x.IsDeleted, ct);

    public async Task<AssistantConversation> AddAsync(AssistantConversation entity, CancellationToken ct = default)
    {
        await _ctx.AssistantConversations.AddAsync(entity, ct);
        await _ctx.SaveChangesAsync(ct);
        return entity;
    }

    public async Task<AssistantConversation> UpdateAsync(AssistantConversation entity, CancellationToken ct = default)
    {
        entity.UpdatedAt = DateTime.UtcNow;
        _ctx.AssistantConversations.Update(entity);
        await _ctx.SaveChangesAsync(ct);
        return entity;
    }

    public async Task DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var entity = await _ctx.AssistantConversations.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (entity is null)
        {
            return;
        }

        entity.IsDeleted = true;
        entity.DeletedAt = DateTime.UtcNow;
        entity.UpdatedAt = DateTime.UtcNow;
        _ctx.AssistantConversations.Update(entity);
        await _ctx.SaveChangesAsync(ct);
    }
}

public class AssistantMessageRepository : IAssistantMessageRepository
{
    private readonly AssistantDbContext _ctx;

    public AssistantMessageRepository(AssistantDbContext ctx)
    {
        _ctx = ctx;
    }

    public Task<AssistantMessage?> GetByIdAsync(Guid id, CancellationToken ct = default)
        => _ctx.AssistantMessages
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == id && !x.IsDeleted, ct);

    public Task<AssistantMessage?> GetLastAssistantMessageAsync(Guid conversationId, CancellationToken ct = default)
        => _ctx.AssistantMessages
            .AsNoTracking()
            .Where(x => x.ConversationId == conversationId && x.Role == AssistantRole.Assistant && !x.IsDeleted)
            .OrderByDescending(x => x.CreatedAt)
            .FirstOrDefaultAsync(ct);

    public async Task<AssistantMessage> AddAsync(AssistantMessage entity, CancellationToken ct = default)
    {
        await _ctx.AssistantMessages.AddAsync(entity, ct);
        await _ctx.SaveChangesAsync(ct);
        return entity;
    }

    public async Task<AssistantMessage> UpdateAsync(AssistantMessage entity, CancellationToken ct = default)
    {
        entity.UpdatedAt = DateTime.UtcNow;
        _ctx.AssistantMessages.Update(entity);
        await _ctx.SaveChangesAsync(ct);
        return entity;
    }

    public async Task DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var entity = await _ctx.AssistantMessages.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (entity is null)
        {
            return;
        }

        entity.IsDeleted = true;
        entity.DeletedAt = DateTime.UtcNow;
        entity.UpdatedAt = DateTime.UtcNow;
        _ctx.AssistantMessages.Update(entity);
        await _ctx.SaveChangesAsync(ct);
    }
}

public class AssistantFeedbackRepository : IAssistantFeedbackRepository
{
    private readonly AssistantDbContext _ctx;

    public AssistantFeedbackRepository(AssistantDbContext ctx)
    {
        _ctx = ctx;
    }

    public Task<AssistantFeedback?> GetByIdAsync(Guid id, CancellationToken ct = default)
        => _ctx.AssistantFeedback
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == id && !x.IsDeleted, ct);

    public Task<List<AssistantFeedback>> GetUnprocessedAsync(CancellationToken ct = default)
        => _ctx.AssistantFeedback
            .Where(x => !x.IsDeleted && !x.IsProcessed)
            .OrderBy(x => x.CreatedAt)
            .Take(500)
            .ToListAsync(ct);

    public async Task<AssistantFeedback> AddAsync(AssistantFeedback entity, CancellationToken ct = default)
    {
        await _ctx.AssistantFeedback.AddAsync(entity, ct);
        await _ctx.SaveChangesAsync(ct);
        return entity;
    }

    public async Task<AssistantFeedback> UpdateAsync(AssistantFeedback entity, CancellationToken ct = default)
    {
        entity.UpdatedAt = DateTime.UtcNow;
        _ctx.AssistantFeedback.Update(entity);
        await _ctx.SaveChangesAsync(ct);
        return entity;
    }

    public async Task DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var entity = await _ctx.AssistantFeedback.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (entity is null)
        {
            return;
        }

        entity.IsDeleted = true;
        entity.DeletedAt = DateTime.UtcNow;
        entity.UpdatedAt = DateTime.UtcNow;
        _ctx.AssistantFeedback.Update(entity);
        await _ctx.SaveChangesAsync(ct);
    }
}

public class AssistantLearningSampleRepository : IAssistantLearningSampleRepository
{
    private readonly AssistantDbContext _ctx;

    public AssistantLearningSampleRepository(AssistantDbContext ctx)
    {
        _ctx = ctx;
    }

    public Task<AssistantLearningSample?> GetByIdAsync(Guid id, CancellationToken ct = default)
        => _ctx.AssistantLearningSamples
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == id && !x.IsDeleted, ct);

    public Task<AssistantLearningSample?> GetByMessageIdAsync(Guid messageId, CancellationToken ct = default)
        => _ctx.AssistantLearningSamples
            .Where(x => x.MessageId == messageId && !x.IsDeleted)
            .OrderByDescending(x => x.CreatedAt)
            .FirstOrDefaultAsync(ct);

    public Task<List<AssistantLearningSample>> GetPendingAsync(int batchSize, CancellationToken ct = default)
        => _ctx.AssistantLearningSamples
            .Where(x => x.Status == LearningSampleStatus.Pending && !x.IsDeleted)
            .OrderBy(x => x.CreatedAt)
            .Take(batchSize)
            .ToListAsync(ct);

    public Task<List<AssistantLearningSample>> GetApprovedAsync(DateTime? since = null, CancellationToken ct = default)
    {
        var query = _ctx.AssistantLearningSamples
            .Where(x => x.Status == LearningSampleStatus.Approved && !x.IsDeleted);

        if (since.HasValue)
        {
            query = query.Where(x => x.CreatedAt >= since.Value);
        }

        return query
            .OrderByDescending(x => x.CreatedAt)
            .Take(10000)
            .ToListAsync(ct);
    }

    public async Task<AssistantLearningSample> AddAsync(AssistantLearningSample entity, CancellationToken ct = default)
    {
        await _ctx.AssistantLearningSamples.AddAsync(entity, ct);
        await _ctx.SaveChangesAsync(ct);
        return entity;
    }

    public async Task<AssistantLearningSample> UpdateAsync(AssistantLearningSample entity, CancellationToken ct = default)
    {
        entity.UpdatedAt = DateTime.UtcNow;
        _ctx.AssistantLearningSamples.Update(entity);
        await _ctx.SaveChangesAsync(ct);
        return entity;
    }

    public async Task DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var entity = await _ctx.AssistantLearningSamples.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (entity is null)
        {
            return;
        }

        entity.IsDeleted = true;
        entity.DeletedAt = DateTime.UtcNow;
        entity.UpdatedAt = DateTime.UtcNow;
        _ctx.AssistantLearningSamples.Update(entity);
        await _ctx.SaveChangesAsync(ct);
    }
}

public class AssistantKnowledgeRepository : IAssistantKnowledgeRepository
{
    private readonly NuRavenCorpLLM.Infrastructure.Data.ApplicationDbContext _ctx;

    public AssistantKnowledgeRepository(NuRavenCorpLLM.Infrastructure.Data.ApplicationDbContext ctx, ILogger<AssistantKnowledgeRepository> logger)
    {
        _ctx = ctx;
    }

    public async Task<AssistantKnowledge?> GetByIdAsync(Guid id, CancellationToken ct = default)
        => await _ctx.Set<AssistantKnowledge>().FirstOrDefaultAsync(x => x.Id == id, ct);

    public async Task<AssistantKnowledge> AddAsync(AssistantKnowledge entity, CancellationToken ct = default)
    {
        await _ctx.Set<AssistantKnowledge>().AddAsync(entity, ct);
        await _ctx.SaveChangesAsync(ct);
        return entity;
    }

    public async Task<AssistantKnowledge> UpdateAsync(AssistantKnowledge entity, CancellationToken ct = default)
    {
        _ctx.Set<AssistantKnowledge>().Update(entity);
        await _ctx.SaveChangesAsync(ct);
        return entity;
    }

    public async Task DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var entity = await GetByIdAsync(id, ct);
        if (entity == null)
        {
            return;
        }

        entity.IsDeleted = true;
        entity.DeletedAt = DateTime.UtcNow;
        _ctx.Set<AssistantKnowledge>().Update(entity);
        await _ctx.SaveChangesAsync(ct);
    }
}
