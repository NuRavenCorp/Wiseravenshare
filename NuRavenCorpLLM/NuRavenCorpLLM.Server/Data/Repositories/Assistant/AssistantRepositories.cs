using Microsoft.EntityFrameworkCore;
using NuRavenCorpLLM.Core.Interfaces;
using NuRavenCorpLLM.Core.Interfaces.Repositories.Assistant;
using NuRavenCorpLLM.Entities;
using NuRavenCorpLLM.Infrastructure.Data;

namespace NuRavenCorpLLM.Server.Data.Repositories.Assistant;

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
