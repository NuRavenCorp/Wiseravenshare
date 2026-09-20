using NuRavenCorpLLM.Core.Interfaces;
using NuRavenCorpLLM.Entities;

namespace NuRavenCorpLLM.Core.Interfaces.Repositories.Assistant;

public interface IAssistantConversationRepository : IRepository<AssistantConversation>
{
    Task<AssistantConversation?> GetWithMessagesAsync(Guid conversationId, CancellationToken ct = default);
    Task<List<AssistantConversation>> GetByUserAsync(Guid userId, CancellationToken ct = default);
}

public interface IAssistantMessageRepository : IRepository<AssistantMessage>
{
    Task<AssistantMessage?> GetLastAssistantMessageAsync(Guid conversationId, CancellationToken ct = default);
}

public interface IAssistantFeedbackRepository : IRepository<AssistantFeedback>
{
    Task<List<AssistantFeedback>> GetUnprocessedAsync(CancellationToken ct = default);
}

public interface IAssistantKnowledgeRepository : IRepository<AssistantKnowledge>
{
}

public interface IAssistantLearningSampleRepository : IRepository<AssistantLearningSample>
{
    Task<AssistantLearningSample?> GetByMessageIdAsync(Guid messageId, CancellationToken ct = default);
    Task<List<AssistantLearningSample>> GetPendingAsync(int batchSize, CancellationToken ct = default);
    Task<List<AssistantLearningSample>> GetApprovedAsync(DateTime? since = null, CancellationToken ct = default);
}