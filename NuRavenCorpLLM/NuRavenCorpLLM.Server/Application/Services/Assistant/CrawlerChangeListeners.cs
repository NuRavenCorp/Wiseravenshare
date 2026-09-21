using System.Text.Json;
using Microsoft.Extensions.Options;

namespace NuRavenCorpLLM.Application.Services.Assistant;

public sealed class ChangeListenerOptions
{
    public bool EnableFileListener { get; set; } = true;
    public string OutputPath { get; set; } = "App_Data\\llm-change-events.jsonl";
}

public sealed record CrawlerChangeEvent(
    string Component,
    string ChangeType,
    string Reason,
    string Result,
    bool Success,
    string? Source = null,
    string? ResourceId = null,
    IDictionary<string, string>? Metadata = null,
    DateTime? OccurredAtUtc = null);

public interface ICrawlerChangeListener
{
    Task OnChangeAsync(CrawlerChangeEvent changeEvent, CancellationToken ct = default);
}

public interface ICrawlerChangeNotifier
{
    Task NotifyAsync(CrawlerChangeEvent changeEvent, CancellationToken ct = default);
}

public sealed class CrawlerChangeNotifier : ICrawlerChangeNotifier
{
    private readonly IEnumerable<ICrawlerChangeListener> _listeners;
    private readonly ILogger<CrawlerChangeNotifier> _logger;

    public CrawlerChangeNotifier(
        IEnumerable<ICrawlerChangeListener> listeners,
        ILogger<CrawlerChangeNotifier> logger)
    {
        _listeners = listeners;
        _logger = logger;
    }

    public async Task NotifyAsync(CrawlerChangeEvent changeEvent, CancellationToken ct = default)
    {
        foreach (var listener in _listeners)
        {
            try
            {
                await listener.OnChangeAsync(changeEvent, ct);
            }
            catch (Exception ex)
            {
                _logger.LogError(
                    ex,
                    "Crawler change listener {Listener} failed for {Component}/{ChangeType}",
                    listener.GetType().Name,
                    changeEvent.Component,
                    changeEvent.ChangeType);
            }
        }
    }
}

public sealed class LoggerCrawlerChangeListener : ICrawlerChangeListener
{
    private readonly ILogger<LoggerCrawlerChangeListener> _logger;

    public LoggerCrawlerChangeListener(ILogger<LoggerCrawlerChangeListener> logger)
    {
        _logger = logger;
    }

    public Task OnChangeAsync(CrawlerChangeEvent changeEvent, CancellationToken ct = default)
    {
        _logger.LogInformation(
            "LLM change listener event :: component={Component} type={ChangeType} success={Success} reason={Reason} result={Result} source={Source} resource={ResourceId}",
            changeEvent.Component,
            changeEvent.ChangeType,
            changeEvent.Success,
            changeEvent.Reason,
            changeEvent.Result,
            changeEvent.Source,
            changeEvent.ResourceId);
        return Task.CompletedTask;
    }
}

public sealed class FileCrawlerChangeListener : ICrawlerChangeListener
{
    private readonly ChangeListenerOptions _options;
    private readonly ILogger<FileCrawlerChangeListener> _logger;
    private readonly SemaphoreSlim _gate = new(1, 1);

    public FileCrawlerChangeListener(
        IOptions<ChangeListenerOptions> options,
        ILogger<FileCrawlerChangeListener> logger)
    {
        _options = options.Value;
        _logger = logger;
    }

    public async Task OnChangeAsync(CrawlerChangeEvent changeEvent, CancellationToken ct = default)
    {
        if (!_options.EnableFileListener)
        {
            return;
        }

        var outputPath = ResolvePath(_options.OutputPath);
        var outputDirectory = Path.GetDirectoryName(outputPath);
        if (string.IsNullOrWhiteSpace(outputDirectory))
        {
            throw new InvalidOperationException("Change listener output path is invalid.");
        }

        Directory.CreateDirectory(outputDirectory);

        var payload = new
        {
            occurredAtUtc = (changeEvent.OccurredAtUtc ?? DateTime.UtcNow).ToString("O"),
            component = changeEvent.Component,
            changeType = changeEvent.ChangeType,
            reason = changeEvent.Reason,
            result = changeEvent.Result,
            success = changeEvent.Success,
            source = changeEvent.Source,
            resourceId = changeEvent.ResourceId,
            metadata = changeEvent.Metadata ?? new Dictionary<string, string>()
        };

        var json = JsonSerializer.Serialize(payload);
        await _gate.WaitAsync(ct);
        try
        {
            await File.AppendAllTextAsync(outputPath, json + Environment.NewLine, ct);
        }
        finally
        {
            _gate.Release();
        }

        _logger.LogDebug("Wrote crawler change event to {OutputPath}", outputPath);
    }

    private static string ResolvePath(string configuredPath)
    {
        if (string.IsNullOrWhiteSpace(configuredPath))
        {
            return Path.Combine(AppContext.BaseDirectory, "App_Data", "llm-change-events.jsonl");
        }

        return Path.IsPathRooted(configuredPath)
            ? configuredPath
            : Path.Combine(AppContext.BaseDirectory, configuredPath);
    }
}
