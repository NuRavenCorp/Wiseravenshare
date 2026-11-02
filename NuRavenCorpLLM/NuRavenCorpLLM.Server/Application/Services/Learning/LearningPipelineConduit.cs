using System.Threading.Channels;
using NuRavenCorpLLM.Application.Services.Assistant;

namespace NuRavenCorpLLM.Application.Services.Learning;

public sealed record LearningConduitSubmission(
    Guid SubmissionId,
    Guid UserId,
    string? Name,
    string Section,
    string Message,
    DateTime CreatedAtUtc);

public interface ILearningPipelineConduit
{
    ValueTask QueueAsync(LearningConduitSubmission submission, CancellationToken ct = default);
}

public interface ILearningPipelineConduitReader
{
    IAsyncEnumerable<LearningConduitSubmission> ReadAllAsync(CancellationToken ct = default);
}

public class LearningPipelineConduit : ILearningPipelineConduit, ILearningPipelineConduitReader
{
    private readonly Channel<LearningConduitSubmission> _channel = Channel.CreateBounded<LearningConduitSubmission>(
        new BoundedChannelOptions(1024)
        {
            SingleReader = true,
            SingleWriter = false,
            FullMode = BoundedChannelFullMode.Wait
        });

    public ValueTask QueueAsync(LearningConduitSubmission submission, CancellationToken ct = default)
        => _channel.Writer.WriteAsync(submission, ct);

    public IAsyncEnumerable<LearningConduitSubmission> ReadAllAsync(CancellationToken ct = default)
        => _channel.Reader.ReadAllAsync(ct);
}

public class LearningPipelineConduitWorker : BackgroundService
{
    private readonly ILearningPipelineConduitReader _reader;
    private readonly IChatterLearningService _learning;
    private readonly ILogger<LearningPipelineConduitWorker> _logger;

    public LearningPipelineConduitWorker(
        ILearningPipelineConduitReader reader,
        IChatterLearningService learning,
        ILogger<LearningPipelineConduitWorker> logger)
    {
        _reader = reader;
        _learning = learning;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var submission in _reader.ReadAllAsync(stoppingToken))
        {
            try
            {
                var label = $"[learning-module][section:{submission.Section}]";
                var learner = string.IsNullOrWhiteSpace(submission.Name) ? null : $"learner:{submission.Name.Trim()}";
                var text = learner is null
                    ? $"{label} {submission.Message}"
                    : $"{label} {learner} {submission.Message}";

                var context = $"source=learning-ui;submission={submission.SubmissionId};createdAt={submission.CreatedAtUtc:O}";

                await _learning.ObservePlatformChatterAsync(submission.UserId, text, context, sourceId: null);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Learning conduit failed for submission {SubmissionId}", submission.SubmissionId);
            }
        }
    }
}
