using System.Collections.Concurrent;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using NuRavenCorpLLM.Entities;

namespace NuRavenCorpLLM.Application.Services.Assistant;

public sealed class FolderKnowledgeOptions
{
    public string RootPath { get; set; } = string.Empty;
    public bool IncludeSubdirectories { get; set; } = true;
    public int ScanIntervalMinutes { get; set; } = 15;
    public int MaxFileCharacters { get; set; } = 200_000;
    public string[] AllowedExtensions { get; set; } = [".txt", ".md", ".json", ".csv", ".xml", ".yml", ".yaml", ".html", ".htm"];
}

public sealed class FolderKnowledgeIngestionService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly FolderKnowledgeOptions _options;
    private readonly ICrawlerChangeNotifier _changeNotifier;
    private readonly ILogger<FolderKnowledgeIngestionService> _logger;
    private readonly ConcurrentDictionary<string, string> _fileHashes = new(StringComparer.OrdinalIgnoreCase);

    public FolderKnowledgeIngestionService(
        IServiceScopeFactory scopeFactory,
        IOptions<FolderKnowledgeOptions> options,
        ICrawlerChangeNotifier changeNotifier,
        ILogger<FolderKnowledgeIngestionService> logger)
    {
        _scopeFactory = scopeFactory;
        _options = options.Value;
        _changeNotifier = changeNotifier;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (string.IsNullOrWhiteSpace(_options.RootPath))
        {
            await _changeNotifier.NotifyAsync(new CrawlerChangeEvent(
                Component: nameof(FolderKnowledgeIngestionService),
                ChangeType: "folder.sync_skipped",
                Reason: "missing_root_path_configuration",
                Result: "sync_not_started",
                Success: false,
                Source: "configuration",
                Metadata: new Dictionary<string, string>
                {
                    ["option"] = "FolderKnowledge:RootPath"
                }), stoppingToken);

            _logger.LogInformation("Folder knowledge is disabled because no root path is configured.");
            return;
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await SyncOnceAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Folder knowledge sync failed for {RootPath}", _options.RootPath);
            }

            var intervalMinutes = Math.Max(1, _options.ScanIntervalMinutes);
            await Task.Delay(TimeSpan.FromMinutes(intervalMinutes), stoppingToken);
        }
    }

    private async Task SyncOnceAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var embedding = scope.ServiceProvider.GetRequiredService<IEmbeddingService>();

        if (!Directory.Exists(_options.RootPath))
        {
            await _changeNotifier.NotifyAsync(new CrawlerChangeEvent(
                Component: nameof(FolderKnowledgeIngestionService),
                ChangeType: "folder.sync_skipped",
                Reason: "configured_root_path_missing",
                Result: "sync_not_started",
                Success: false,
                Source: _options.RootPath), ct);

            _logger.LogWarning("Folder knowledge root does not exist: {RootPath}", _options.RootPath);
            return;
        }

        var searchOption = _options.IncludeSubdirectories
            ? SearchOption.AllDirectories
            : SearchOption.TopDirectoryOnly;

        foreach (var filePath in Directory.EnumerateFiles(_options.RootPath, "*", searchOption))
        {
            if (!IsSupported(filePath))
            {
                continue;
            }

            var content = await ReadContentAsync(filePath, ct);
            if (string.IsNullOrWhiteSpace(content))
            {
                continue;
            }

            if (content.Length > _options.MaxFileCharacters)
            {
                content = content[.._options.MaxFileCharacters];
            }

            var contentHash = Hash(content);
            if (_fileHashes.TryGetValue(filePath, out var existingHash) && string.Equals(existingHash, contentHash, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var reason = string.IsNullOrEmpty(existingHash)
                ? "new_file_discovered"
                : "file_content_changed";
            var relativePath = Path.GetRelativePath(_options.RootPath, filePath);

            try
            {
                _fileHashes[filePath] = contentHash;

                var fileInfo = new FileInfo(filePath);
                var knowledge = new AssistantKnowledge
                {
                    Title = Path.GetFileNameWithoutExtension(filePath),
                    Content = content,
                    ContentHash = contentHash,
                    Source = "folder",
                    SourceUrl = filePath,
                    SourceId = relativePath,
                    Category = ClassifyExtension(filePath),
                    IsPublic = true,
                    IsApproved = true,
                    Metadata = JsonSerializer.SerializeToDocument(new
                    {
                        rootPath = _options.RootPath,
                        relativePath,
                        extension = Path.GetExtension(filePath),
                        sizeBytes = fileInfo.Length,
                        lastWriteUtc = fileInfo.LastWriteTimeUtc
                    })
                };

                await embedding.EmbedAndStoreAsync(knowledge, ct);
                await _changeNotifier.NotifyAsync(new CrawlerChangeEvent(
                    Component: nameof(FolderKnowledgeIngestionService),
                    ChangeType: "knowledge.ingested",
                    Reason: reason,
                    Result: "embedded_and_stored",
                    Success: true,
                    Source: filePath,
                    ResourceId: relativePath,
                    Metadata: new Dictionary<string, string>
                    {
                        ["category"] = knowledge.Category ?? "file",
                        ["contentHash"] = contentHash
                    }), ct);

                _logger.LogInformation("Ingested folder knowledge file {FilePath}", filePath);
            }
            catch (Exception ex)
            {
                await _changeNotifier.NotifyAsync(new CrawlerChangeEvent(
                    Component: nameof(FolderKnowledgeIngestionService),
                    ChangeType: "knowledge.ingest_failed",
                    Reason: reason,
                    Result: ex.Message,
                    Success: false,
                    Source: filePath,
                    ResourceId: relativePath), ct);

                _logger.LogWarning(ex, "Failed to ingest folder knowledge file {FilePath}", filePath);
            }
        }
    }

    private bool IsSupported(string filePath)
    {
        var extension = Path.GetExtension(filePath);
        return _options.AllowedExtensions.Length == 0
            || _options.AllowedExtensions.Contains(extension, StringComparer.OrdinalIgnoreCase);
    }

    private static async Task<string> ReadContentAsync(string filePath, CancellationToken ct)
    {
        return await File.ReadAllTextAsync(filePath, ct);
    }

    private static string ClassifyExtension(string filePath)
        => Path.GetExtension(filePath).TrimStart('.').ToLowerInvariant() switch
        {
            "md" or "txt" => "document",
            "json" or "csv" => "data",
            "xml" or "html" or "htm" => "markup",
            "yml" or "yaml" => "config",
            _ => "file"
        };

    private static string Hash(string content)
    {
        using var sha = System.Security.Cryptography.SHA256.Create();
        return Convert.ToHexString(sha.ComputeHash(System.Text.Encoding.UTF8.GetBytes(content)));
    }
}