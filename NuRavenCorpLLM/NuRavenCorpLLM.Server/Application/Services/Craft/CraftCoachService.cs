using NuRavenCorpLLM.Entities.Craft;

namespace NuRavenCorpLLM.Application.Services.Craft;

public interface ICraftCoachService
{
    Task<CraftCoachingSession> ReviewDraftAsync(
        Guid userId, string domain, string draft, string? context, CancellationToken ct = default);

    Task<CraftCoachingSession> PostPublishReviewAsync(
        Guid userId, Guid contentId, string domain, CancellationToken ct = default);

    Task<CraftCoachingSession> WeeklyReviewAsync(
        Guid userId, string domain, CancellationToken ct = default);
}

public class CraftCoachService : ICraftCoachService
{
    private readonly ILogger<CraftCoachService> _logger;

    public CraftCoachService(ILogger<CraftCoachService> logger)
    {
        _logger = logger;
    }

    public Task<CraftCoachingSession> ReviewDraftAsync(
        Guid userId, string domain, string draft, string? context, CancellationToken ct = default)
    {
        _logger.LogInformation("Craft review requested for {UserId} in {Domain}", userId, domain);

        var session = new CraftCoachingSession
        {
            UserId = userId,
            DomainKey = domain,
            Trigger = CoachingTrigger.DraftReview,
            Input = draft,
            Context = context,
            Summary = "Draft review queued."
        };

        return Task.FromResult(session);
    }

    public Task<CraftCoachingSession> PostPublishReviewAsync(
        Guid userId, Guid contentId, string domain, CancellationToken ct = default)
    {
        _logger.LogInformation("Post-publish craft review requested for {UserId}, content {ContentId}, domain {Domain}", userId, contentId, domain);
        return ReviewDraftAsync(userId, domain, $"Post publish review for {contentId}", null, ct);
    }

    public Task<CraftCoachingSession> WeeklyReviewAsync(
        Guid userId, string domain, CancellationToken ct = default)
    {
        _logger.LogInformation("Weekly craft review requested for {UserId} in {Domain}", userId, domain);

        var session = new CraftCoachingSession
        {
            UserId = userId,
            DomainKey = domain,
            Trigger = CoachingTrigger.WeeklyReview,
            Input = "(weekly)",
            Summary = "Weekly craft review queued."
        };

        return Task.FromResult(session);
    }
}
