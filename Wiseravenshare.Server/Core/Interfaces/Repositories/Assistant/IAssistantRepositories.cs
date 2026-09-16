using WiseRavenShare.Server.Entities.Assistant;
using WiseRavenShare.Server.Application.Services.Assistant;

namespace WiseRavenShare.Server.Core.Interfaces.Repositories.Assistant;

public interface IAssistantConversationRepository : IRepository<AssistantConversation>
{
    Task<List<AssistantConversation>> GetByUserAsync(Guid userId);
    Task<AssistantConversation?> GetWithMessagesAsync(Guid id);
}

public interface IAssistantMessageRepository : IRepository<AssistantMessage>
{
    Task<AssistantMessage?> GetByIdAsync(Guid id);
    Task<List<AssistantMessage>> GetByConversationAsync(Guid conversationId, int skip = 0, int take = 50);
}

public interface IAssistantFeedbackRepository : IRepository<AssistantFeedback>
{
    Task<List<AssistantFeedback>> GetUnprocessedAsync();
}

public interface IAssistantKnowledgeRepository : IRepository<AssistantKnowledge>
{
}

public interface IAssistantLearningSampleRepository : IRepository<AssistantLearningSample>
{
    Task<List<AssistantLearningSample>> GetPendingAsync(int limit);
    Task<AssistantLearningSample?> GetByMessageIdAsync(Guid messageId);
    Task<IEnumerable<AssistantLearningSample>> GetApprovedAsync(DateTime? since = null);
}

public interface IPgVectorStore
{
    Task<IEnumerable<RagHit>> SimilaritySearchAsync(float[] query, int topK, double minScore, CancellationToken ct = default);
}
