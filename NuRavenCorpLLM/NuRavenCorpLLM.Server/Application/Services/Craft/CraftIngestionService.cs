// Application/Services/Craft/CraftIngestionService.cs
using System.Text.Json;
using HtmlAgilityPack;
using NuRavenCorpLLM.Application.Algtorithms;
using NuRavenCorpLLM.Application.Services.Assistant;
using NuRavenCorpLLM.Core.Interfaces.Repositories.Craft;
using NuRavenCorpLLM.Entities.Craft;
using NuRavenCorpLLM.Services;

namespace NuRavenCorpLLM.Application.Services.Craft;

public interface ICraftIngestionService
{
    Task<CraftSource> QueueAsync(Guid domainId, SourceKind kind, string title, string url);
    Task IngestAsync(Guid sourceId);
    Task IngestBatchAsync(int batchSize = 10);
}

public class CraftIngestionService : ICraftIngestionService
{
    private readonly ICraftSourceRepository _sources;
    private readonly ICraftInsightRepository _insights;
    private readonly ICraftDomainRepository _domains;
    private readonly IEmbeddingService _embed;
    private readonly ILlmGateway _llm;
    private readonly IHttpClientFactory _httpFactory;
    private readonly ILogger<CraftIngestionService> _logger;

    public CraftIngestionService(
        ICraftSourceRepository sources,
        ICraftInsightRepository insights,
        ICraftDomainRepository domains,
        IEmbeddingService embed,
        ILlmGateway llm,
        IHttpClientFactory httpFactory,
        ILogger<CraftIngestionService> logger)
    {
        _sources = sources; _insights = insights; _domains = domains;
        _embed = embed; _llm = llm; _httpFactory = httpFactory; _logger = logger;
    }

    public async Task<CraftSource> QueueAsync(Guid domainId, SourceKind kind, string title, string url)
    {
        var source = new CraftSource
        {
            CraftDomainId = domainId,
            Kind = kind,
            Title = title,
            Url = url,
            Status = SourceStatus.Queued
        };
        await _sources.AddAsync(source);
        return source;
    }

    public async Task IngestAsync(Guid sourceId)
    {
        var source = await _sources.GetByIdAsync(sourceId);
        if (source == null) return;
        source.Status = SourceStatus.Ingesting;
        await _sources.UpdateAsync(source);

        try
        {
            source.RawContent = await FetchTextAsync(source);
            source.ContentLength = source.RawContent?.Length ?? 0;

            // Chunk + extract insights with LLM
            var chunks = ChunkingStrategy.Chunk(source.RawContent ?? "", 600, 100);
            foreach (var chunk in chunks)
            {
                var extracted = await ExtractInsightAsync(source, chunk);
                if (extracted == null) continue;

                var insight = new CraftInsight
                {
                    SourceId = source.Id,
                    Title = extracted.Title,
                    Content = extracted.Content,
                    Quote = extracted.Quote,
                    Quality = extracted.Quality,
                    Embedding = await _embed.EmbedAsync($"{extracted.Title}. {extracted.Content}")
                };
                await _insights.AddAsync(insight);
            }

            source.Status = SourceStatus.Ingested;
            source.IngestedAt = DateTime.UtcNow;
        }
        catch (Exception ex)
        {
            source.Status = SourceStatus.Failed;
            source.ErrorMessage = ex.Message;
            _logger.LogWarning(ex, "Failed to ingest source {Id}", sourceId);
        }

        await _sources.UpdateAsync(source);
    }

    public async Task IngestBatchAsync(int batchSize = 10)
    {
        var queued = await _sources.GetQueuedAsync(batchSize);
        foreach (var source in queued)
            await IngestAsync(source.Id);
    }

    private async Task<string> FetchTextAsync(CraftSource source)
    {
        if (string.IsNullOrEmpty(source.Url)) return string.Empty;
        var client = _httpFactory.CreateClient();
        var html = await client.GetStringAsync(source.Url);
        var doc = new HtmlDocument();
        doc.LoadHtml(html);

        foreach (var n in doc.DocumentNode.SelectNodes("//script|//style|//nav|//footer|//header|//aside")
                     ?? Enumerable.Empty<HtmlNode>())
            n.Remove();

        var main = doc.DocumentNode.SelectSingleNode("//main")
                   ?? doc.DocumentNode.SelectSingleNode("//article")
                   ?? doc.DocumentNode;

        return System.Text.RegularExpressions.Regex.Replace(
            System.Net.WebUtility.HtmlDecode(main.InnerText), @"\s+", " ").Trim();
    }

    private async Task<ExtractedInsight?> ExtractInsightAsync(CraftSource source, string chunk)
    {
        var prompt = $@"
Read the following passage from a piece on the craft of {source.Kind}.
Extract ONE concrete insight a practitioner could apply.
Return JSON with: title (max 120 chars), content (2-4 sentences), quote (optional verbatim), quality (0-100 for how actionable and non-obvious it is).

If the passage has no useful insight, return {{ ""title"": """" }}.

PASSAGE:
{chunk}
";
        var req = new LlmRequest
        {
            SystemPrompt = "You extract craft wisdom for practitioners. Output only JSON.",
            Messages = new() { new LlmMessage("user", prompt) },
            JsonMode = true,
            Temperature = 0.2,
            MaxTokens = 400
        };
        var resp = await _llm.CompleteAsync(req);
        try
        {
            using var doc = JsonDocument.Parse(resp.Content);
            var root = doc.RootElement;
            var title = root.GetProperty("title").GetString() ?? "";
            if (string.IsNullOrWhiteSpace(title)) return null;

            return new ExtractedInsight(
                title,
                root.GetProperty("content").GetString() ?? "",
                root.TryGetProperty("quote", out var q) ? q.GetString() : null,
                root.TryGetProperty("quality", out var ql) ? ql.GetInt32() : 50);
        }
        catch { return null; }
    }

    private record ExtractedInsight(string Title, string Content, string? Quote, int Quality);
}