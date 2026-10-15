using Wiseravenshare.Server.DTOs.Personalization;
using Wiseravenshare.Server.Interfaces.Services.External;
using Wiseravenshare.Server.Interfaces.Services.Personalization;

namespace Wiseravenshare.Server.Services.External;

public class WebCrawlerService : IWebCrawlerService
{
    private readonly HttpClient _httpClient;
    private readonly IPersonalizationService _personalizationService;
    private readonly ILogger<WebCrawlerService> _logger;

    public WebCrawlerService(
        HttpClient httpClient,
        IPersonalizationService personalizationService,
        ILogger<WebCrawlerService> logger)
    {
        _httpClient = httpClient;
        _personalizationService = personalizationService;
        _logger = logger;
    }

    public async Task<IEnumerable<CrawledContentDto>> FetchOutsideTrendIntelligenceAsync(string category = "General", CancellationToken ct = default)
    {
        _logger.LogInformation("Web crawler fetching trend intelligence for category '{Category}'.", category);
        _ = _httpClient;
        await Task.Delay(50, ct);

        return
        [
            new CrawledContentDto
            {
                ContentId = Guid.NewGuid(),
                ContentType = "OutsideTrend",
                Content = "Global developments in renewable energy, battery storage technology, and smart grid automation.",
                Source = "Global Tech Wire",
                Tags = ["Technology", "Energy", "Innovation", category],
                PublishedAt = DateTime.UtcNow
            },
            new CrawledContentDto
            {
                ContentId = Guid.NewGuid(),
                ContentType = "OutsideTrend",
                Content = "Emerging music genre trends combining classic FM radio soul with modern ambient synthesizer soundscapes.",
                Source = "Acoustic Intelligence Feed",
                Tags = ["Music", "Radio", "Synthesizer", category],
                PublishedAt = DateTime.UtcNow
            }
        ];
    }

    public async Task<int> CrawlAndProcessLatestTrendsAsync(CancellationToken ct = default)
    {
        var trends = (await FetchOutsideTrendIntelligenceAsync(ct: ct)).ToList();
        foreach (var item in trends)
        {
            ct.ThrowIfCancellationRequested();
            await _personalizationService.ProcessCrawledContentAsync(item);
        }

        _logger.LogInformation("Web crawler processed {Count} trend intelligence item(s).", trends.Count);
        return trends.Count;
    }

    public async Task<CrawlerSourceStatusDto> GetCrawlerSourceStatusAsync(CancellationToken ct = default)
    {
        var items = (await FetchOutsideTrendIntelligenceAsync(ct: ct)).ToList();
        return new CrawlerSourceStatusDto
        {
            Connected = true,
            Source = "internal-sample-feed",
            EntityName = "N/A",
            ContentType = "OutsideTrend",
            AvailableItemCount = items.Count,
            CheckedAtUtc = DateTime.UtcNow,
            PreviewItems = items
                .Take(5)
                .Select(item => new CrawlerSourcePreviewItemDto
                {
                    ContentId = item.ContentId,
                    Source = item.Source ?? "internal-sample-feed",
                    PreviewText = CreatePreviewText(item.Content),
                    Tags = item.Tags ?? Array.Empty<string>(),
                    PublishedAt = item.PublishedAt
                })
                .ToArray()
        };
    }

    private static string CreatePreviewText(string content)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return string.Empty;
        }

        var normalized = content.Replace("\r", " ").Replace("\n", " ").Trim();
        return normalized.Length <= 240
            ? normalized
            : $"{normalized[..240].TrimEnd()}...";
    }
}
