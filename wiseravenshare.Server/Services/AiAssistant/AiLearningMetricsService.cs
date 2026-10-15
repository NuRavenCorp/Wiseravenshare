using System.Collections.Concurrent;

namespace Wiseravenshare.Server.Services.AiAssistant;

public sealed class AiLearningMetricsSnapshot
{
    public string Suite { get; set; } = "wiseravenshare";
    public DateTime GeneratedAtUtc { get; set; } = DateTime.UtcNow;
    public long TotalRequests { get; set; }
    public long SuccessfulRequests { get; set; }
    public long FailedRequests { get; set; }
    public double AverageLatencyMs { get; set; }
    public string Provider { get; set; } = string.Empty;
    public DateTime? LastFailureAtUtc { get; set; }
    public IReadOnlyCollection<AiLearningKeywordSignal> TopSignals { get; set; } = Array.Empty<AiLearningKeywordSignal>();
    public IReadOnlyCollection<AiLearningFailureSample> RecentFailures { get; set; } = Array.Empty<AiLearningFailureSample>();
}

public sealed class AiLearningKeywordSignal
{
    public string Keyword { get; set; } = string.Empty;
    public int Count { get; set; }
}

public sealed class AiLearningFailureSample
{
    public DateTime AtUtc { get; set; }
    public string Error { get; set; } = string.Empty;
}

public interface IAiLearningMetricsService
{
    void Record(string message, bool success, TimeSpan latency, string provider, string? error = null);
    AiLearningMetricsSnapshot GetSnapshot(int topSignals = 10, int recentFailures = 20);
}

public sealed class AiLearningMetricsService : IAiLearningMetricsService
{
    private long _totalRequests;
    private long _successfulRequests;
    private long _failedRequests;
    private long _totalLatencyTicks;
    private DateTime? _lastFailureAtUtc;

    private readonly ConcurrentDictionary<string, int> _keywordSignals = new(StringComparer.OrdinalIgnoreCase);
    private readonly Queue<AiLearningFailureSample> _recentFailures = new();
    private readonly object _sync = new();

    public void Record(string message, bool success, TimeSpan latency, string provider, string? error = null)
    {
        Interlocked.Increment(ref _totalRequests);
        Interlocked.Add(ref _totalLatencyTicks, latency.Ticks);

        if (success)
        {
            Interlocked.Increment(ref _successfulRequests);
        }
        else
        {
            Interlocked.Increment(ref _failedRequests);
            _lastFailureAtUtc = DateTime.UtcNow;
            lock (_sync)
            {
                _recentFailures.Enqueue(new AiLearningFailureSample
                {
                    AtUtc = DateTime.UtcNow,
                    Error = string.IsNullOrWhiteSpace(error) ? "Unknown bridge error" : error.Trim()
                });

                while (_recentFailures.Count > 50)
                {
                    _recentFailures.Dequeue();
                }
            }
        }

        foreach (var keyword in ExtractKeywords(message))
        {
            _keywordSignals.AddOrUpdate(keyword, 1, (_, value) => value + 1);
        }
    }

    public AiLearningMetricsSnapshot GetSnapshot(int topSignals = 10, int recentFailures = 20)
    {
        var total = Interlocked.Read(ref _totalRequests);
        var success = Interlocked.Read(ref _successfulRequests);
        var failed = Interlocked.Read(ref _failedRequests);
        var latencyTicks = Interlocked.Read(ref _totalLatencyTicks);

        var avgLatencyMs = total <= 0
            ? 0d
            : TimeSpan.FromTicks(Math.Max(0, latencyTicks / total)).TotalMilliseconds;

        var signals = _keywordSignals
            .OrderByDescending(kvp => kvp.Value)
            .Take(Math.Max(1, topSignals))
            .Select(kvp => new AiLearningKeywordSignal { Keyword = kvp.Key, Count = kvp.Value })
            .ToArray();

        AiLearningFailureSample[] failures;
        lock (_sync)
        {
            failures = _recentFailures
                .TakeLast(Math.Max(1, recentFailures))
                .ToArray();
        }

        return new AiLearningMetricsSnapshot
        {
            GeneratedAtUtc = DateTime.UtcNow,
            TotalRequests = total,
            SuccessfulRequests = success,
            FailedRequests = failed,
            AverageLatencyMs = Math.Round(avgLatencyMs, 2),
            Provider = "nuravencorpllm-bridge",
            LastFailureAtUtc = _lastFailureAtUtc,
            TopSignals = signals,
            RecentFailures = failures
        };
    }

    private static IEnumerable<string> ExtractKeywords(string message)
    {
        if (string.IsNullOrWhiteSpace(message))
        {
            yield break;
        }

        var stopwords = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "the", "and", "for", "with", "that", "this", "from", "have", "what", "when", "where",
            "which", "about", "into", "your", "will", "would", "could", "should", "just", "please",
            "help", "need", "want", "make", "more", "less", "than", "then", "them", "they", "their"
        };

        var spans = message
            .ToLowerInvariant()
            .Split(new[] { ' ', '\t', '\r', '\n', '.', ',', ';', ':', '!', '?', '/', '\\', '-', '_', '"', '\'', '(', ')', '[', ']', '{', '}' },
                StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        foreach (var token in spans)
        {
            if (token.Length < 4) continue;
            if (stopwords.Contains(token)) continue;
            yield return token;
        }
    }
}