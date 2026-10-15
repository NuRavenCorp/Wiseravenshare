using System.Text;
using System.Text.Json;
using WiseRavenShare.Server.Entities.Assistant;
using WiseRavenShare.Server.Core.Interfaces.Repositories.Assistant;

namespace WiseRavenShare.Server.Application.Services.Assistant;

public interface IFeedbackLearningService
{
    Task<byte[]> BuildFineTuneDatasetAsync(DateTime? since = null, CancellationToken ct = default);
    Task<int> ApplyFeedbackToSamplesAsync(CancellationToken ct = default);
}

public class FeedbackLearningService : IFeedbackLearningService
{
    private readonly IAssistantFeedbackRepository _fbRepo;
    private readonly IAssistantLearningSampleRepository _samples;
    private readonly IAssistantMessageRepository _msgRepo;
    private readonly ILogger<FeedbackLearningService> _logger;

    public FeedbackLearningService(
        IAssistantFeedbackRepository fbRepo,
        IAssistantLearningSampleRepository samples,
        IAssistantMessageRepository msgRepo,
        ILogger<FeedbackLearningService> logger)
    {
        _fbRepo = fbRepo;
        _samples = samples;
        _msgRepo = msgRepo;
        _logger = logger;
    }

    public async Task<int> ApplyFeedbackToSamplesAsync(CancellationToken ct = default)
    {
        var feedbacks = await _fbRepo.GetUnprocessedAsync();
        int count = 0;
        foreach (var fb in feedbacks)
        {
            var msg = await _msgRepo.GetByIdAsync(fb.MessageId);
            if (msg == null) continue;

            var sample = await _samples.GetByMessageIdAsync(fb.MessageId);
            if (sample != null)
            {
                if (fb.Vote == FeedbackVote.ThumbUp)
                {
                    sample.Status = LearningSampleStatus.Approved;
                    sample.QualityScore = 5;
                }
                else if (fb.Vote == FeedbackVote.ThumbDown)
                {
                    if (!string.IsNullOrEmpty(fb.CorrectedResponse))
                    {
                        sample.IdealResponse = fb.CorrectedResponse;
                        sample.Status = LearningSampleStatus.Approved;
                        sample.QualityScore = 4;
                    }
                    else
                    {
                        sample.Status = LearningSampleStatus.Rejected;
                        sample.QualityScore = 1;
                    }
                }
                await _samples.UpdateAsync(sample);
                count++;
            }
        }
        return count;
    }

    public async Task<byte[]> BuildFineTuneDatasetAsync(DateTime? since, CancellationToken ct = default)
    {
        var samples = await _samples.GetApprovedAsync(since);

        var sb = new StringBuilder();
        foreach (var s in samples)
        {
            var ideal = s.IdealResponse ?? s.AssistantResponse;
            if (string.IsNullOrEmpty(ideal)) continue;

            var record = new
            {
                messages = new object[]
                {
                    new { role = "system", content = "You are WiseRaven, the WiseRavenShare AI assistant." },
                    new { role = "user", content = s.UserPrompt },
                    new { role = "assistant", content = ideal }
                }
            };
            sb.AppendLine(JsonSerializer.Serialize(record));
        }

        _logger.LogInformation("Built fine-tune dataset with {Count} samples", samples.Count());
        return Encoding.UTF8.GetBytes(sb.ToString());
    }
}
