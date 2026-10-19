using Microsoft.EntityFrameworkCore;
using NuRavenCorpLLM.Server.Entities.Conversations;

namespace NuRavenCorpLLM.Server.Data.Repositories.Conversations;

public interface IConversationRepository : IRepository<Conversation>
{
    Task<Conversation?> GetWithMessagesAsync(Guid id, CancellationToken ct = default);
    Task<IEnumerable<Conversation>> GetByClientUserAsync(Guid clientSystemId, string externalUserId, int limit = 50, CancellationToken ct = default);
    Task<IEnumerable<Conversation>> GetRecentAsync(Guid clientSystemId, int limit = 100, CancellationToken ct = default);
    Task<int> CountByClientAsync(Guid clientSystemId, DateTime from, DateTime to, CancellationToken ct = default);
}

public class ConversationRepository : Repository<Conversation>, IConversationRepository
{
    public ConversationRepository(ApplicationDbContext ctx, ILogger<ConversationRepository> logger) : base(ctx, logger) { }

    public async Task<Conversation?> GetWithMessagesAsync(Guid id, CancellationToken ct = default)
        => await _dbSet
            .Include(c => c.Messages.OrderBy(m => m.SequenceNumber))
            .FirstOrDefaultAsync(c => c.Id == id, ct);

    public async Task<IEnumerable<Conversation>> GetByClientUserAsync(Guid clientSystemId, string externalUserId, int limit = 50, CancellationToken ct = default)
        => await _dbSet
            .Where(c => c.ClientSystemId == clientSystemId && c.ExternalUserId == externalUserId)
            .OrderByDescending(c => c.LastMessageAt)
            .Take(limit)
            .ToListAsync(ct);

    public async Task<IEnumerable<Conversation>> GetRecentAsync(Guid clientSystemId, int limit = 100, CancellationToken ct = default)
        => await _dbSet
            .Where(c => c.ClientSystemId == clientSystemId)
            .OrderByDescending(c => c.LastMessageAt)
            .Take(limit)
            .ToListAsync(ct);

    public async Task<int> CountByClientAsync(Guid clientSystemId, DateTime from, DateTime to, CancellationToken ct = default)
        => await _dbSet.CountAsync(c =>
            c.ClientSystemId == clientSystemId &&
            c.CreatedAt >= from &&
            c.CreatedAt <= to, ct);
}

public interface IMessageRepository : IRepository<Message>
{
    Task<IEnumerable<Message>> GetByConversationAsync(Guid conversationId, int limit = 200, CancellationToken ct = default);
    Task<Message?> GetWithCitationsAsync(Guid id, CancellationToken ct = default);
    Task<int> GetNextSequenceNumberAsync(Guid conversationId, CancellationToken ct = default);
    Task<IEnumerable<Message>> GetRecentByRoleAsync(Guid conversationId, MessageRole role, int limit = 20, CancellationToken ct = default);
}

public class MessageRepository : Repository<Message>, IMessageRepository
{
    public MessageRepository(ApplicationDbContext ctx, ILogger<MessageRepository> logger) : base(ctx, logger) { }

    public async Task<IEnumerable<Message>> GetByConversationAsync(Guid conversationId, int limit = 200, CancellationToken ct = default)
        => await _dbSet
            .Where(m => m.ConversationId == conversationId)
            .OrderBy(m => m.SequenceNumber)
            .Take(limit)
            .ToListAsync(ct);

    public async Task<Message?> GetWithCitationsAsync(Guid id, CancellationToken ct = default)
        => await _dbSet
            .Include(m => m.Citations)
            .Include(m => m.Attachments)
            .FirstOrDefaultAsync(m => m.Id == id, ct);

    public async Task<int> GetNextSequenceNumberAsync(Guid conversationId, CancellationToken ct = default)
    {
        var max = await _dbSet
            .Where(m => m.ConversationId == conversationId)
            .MaxAsync(m => (int?)m.SequenceNumber, ct);
        return (max ?? 0) + 1;
    }

    public async Task<IEnumerable<Message>> GetRecentByRoleAsync(Guid conversationId, MessageRole role, int limit = 20, CancellationToken ct = default)
        => await _dbSet
            .Where(m => m.ConversationId == conversationId && m.Role == role)
            .OrderByDescending(m => m.SequenceNumber)
            .Take(limit)
            .ToListAsync(ct);
}
