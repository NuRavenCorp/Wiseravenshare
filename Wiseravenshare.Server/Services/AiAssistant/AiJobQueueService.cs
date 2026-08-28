// Wiseravenshare.Server/Services/AiAssistant/AiJobQueueService.cs
using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;

namespace Wiseravenshare.Server.Services.AiAssistant;

public enum AiJobStatus { Queued, Running, Succeeded, Failed }

/// <summary>A result snapshot served to clients polling for their AI job.</summary>
public record AiJobSnapshot(
    Guid JobId,
    AiJobStatus Status,
    string? Reply,
    string? Model,
    string? Error,
    DateTimeOffset CreatedUtc,
    DateTimeOffset? CompletedUtc);

/// <summary>
/// Background AI job queue for bursty creator features (captions, hashtags, drafts).
/// Instead of holding HTTP requests open against the llama-server nodes, jobs are
/// enqueued, processed by a bounded worker pool, and polled by the client.
/// Includes an in-memory prompt cache: identical (model + messages) payloads return
/// the cached reply instantly, cutting GPU load for repeat generations.
/// </summary>
public interface IAiJobQueue
{
    /// <summary>Enqueues a job; returns its id. Cached jobs are marked Succeeded immediately.</summary>
    Guid Enqueue(AiChatRequest request);

    /// <summary>Gets the current state of a job, or null when unknown/expired.</summary>
    AiJobSnapshot? Get(Guid jobId);
}

/// <summary>Hosted worker that drains the AI job queue through the chat service with bounded concurrency.</summary>
public class AiJobQueueService : BackgroundService, IAiJobQueue
{
    private readonly IOllamaChatService _chatService;
    private readonly ILogger<AiJobQueueService> _logger;

    private const int MaxConcurrentJobs = 4;          // match llama-server parallel slots
    private const int MaxQueueDepth = 500;            // reject beyond this — fail fast, don't pile up
    private const int MaxCompletedJobsKept = 1000;    // snapshot GC
    private static readonly TimeSpan JobRetention = TimeSpan.FromMinutes(30);

    private readonly ConcurrentQueue<(Guid Id, AiChatRequest Request)> _queue = new();
    private readonly ConcurrentDictionary<Guid, AiJobSnapshot> _jobs = new();
    private readonly ConcurrentDictionary<string, string> _promptCache = new(); // hash -> reply
    private const int MaxCacheEntries = 2000;
    private readonly SemaphoreSlim _slots = new(MaxConcurrentJobs, MaxConcurrentJobs);

    public AiJobQueueService(IOllamaChatService chatService, ILogger<AiJobQueueService> logger)
    {
        _chatService = chatService;
        _logger = logger;
    }

    public Guid Enqueue(AiChatRequest request)
    {
        if (request is null || string.IsNullOrWhiteSpace(request.Message))
            throw new ArgumentException("Message is required.", nameof(request));

        var jobId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;

        // Prompt cache hit — serve instantly without touching the GPU.
        var key = CacheKey(request);
        if (_promptCache.TryGetValue(key, out var cached))
        {
            _jobs[jobId] = new AiJobSnapshot(jobId, AiJobStatus.Succeeded, cached, null,
                null, now, now);
            _logger.LogInformation("AI job {JobId} served from prompt cache.", jobId);
            return jobId;
        }

        if (_queue.Count >= MaxQueueDepth)
        {
            _jobs[jobId] = new AiJobSnapshot(jobId, AiJobStatus.Failed, null, null,
                "AI service is busy right now — please retry in a moment.", now, now);
            return jobId;
        }

        _jobs[jobId] = new AiJobSnapshot(jobId, AiJobStatus.Queued, null, null, null, now, null);
        _queue.Enqueue((jobId, request));
        _logger.LogInformation("AI job {JobId} queued (depth {Depth}).", jobId, _queue.Count);
        return jobId;
    }

    public AiJobSnapshot? Get(Guid jobId) =>
        _jobs.TryGetValue(jobId, out var snapshot) ? snapshot : null;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("AI job worker started (max {Max} concurrent).", MaxConcurrentJobs);

        while (!stoppingToken.IsCancellationRequested)
        {
            await _slots.WaitAsync(stoppingToken);
            if (!_queue.TryDequeue(out var item))
            {
                _slots.Release();
                PruneExpired();
                await Task.Delay(200, stoppingToken);
                continue;
            }

            _ = ProcessAsync(item.Id, item.Request);
        }
    }

    private async Task ProcessAsync(Guid jobId, AiChatRequest request)
    {
        try
        {
            _jobs[jobId] = _jobs[jobId] with { Status = AiJobStatus.Running };
            var result = await _chatService.ChatAsync(request);

            if (result.Success)
            {
                _jobs[jobId] = _jobs[jobId] with
                {
                    Status = AiJobStatus.Succeeded,
                    Reply = result.Reply,
                    Model = result.Model,
                    CompletedUtc = DateTimeOffset.UtcNow
                };
                CacheStore(request, result.Reply ?? string.Empty);
            }
            else
            {
                _jobs[jobId] = _jobs[jobId] with
                {
                    Status = AiJobStatus.Failed,
                    Error = result.Error,
                    CompletedUtc = DateTimeOffset.UtcNow
                };
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "AI job {JobId} threw unexpectedly.", jobId);
            _jobs[jobId] = _jobs[jobId] with
            {
                Status = AiJobStatus.Failed,
                Error = "Unexpected AI error.",
                CompletedUtc = DateTimeOffset.UtcNow
            };
        }
        finally
        {
            _slots.Release();
        }
    }

    private static string CacheKey(AiChatRequest request)
    {
        var sb = new StringBuilder(request.Model ?? "").Append('|');
        foreach (var h in request.History ?? [])
            sb.Append(h.Role).Append(':').Append(h.Content).Append('|');
        sb.Append(request.Message);
        return Convert.ToHexString(MD5.HashData(Encoding.UTF8.GetBytes(sb.ToString())));
    }

    private void CacheStore(AiChatRequest request, string reply)
    {
        if (_promptCache.Count >= MaxCacheEntries) _promptCache.Clear(); // crude but bounded
        _promptCache[CacheKey(request)] = reply;
    }

    private void PruneExpired()
    {
        if (_jobs.Count <= MaxCompletedJobsKept) return;
        var cutoff = DateTimeOffset.UtcNow - JobRetention;
        foreach (var (id, snap) in _jobs)
            if (snap.CompletedUtc is { } done && done < cutoff && snap.Status is AiJobStatus.Succeeded or AiJobStatus.Failed)
                _jobs.TryRemove(id, out _);
    }
}
