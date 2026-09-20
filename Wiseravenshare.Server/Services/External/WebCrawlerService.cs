using Microsoft.Extensions.Logging;
using Wiseravenshare.Server.DTOs.Personalization;
using Wiseravenshare.Server.Interfaces.Services.External;
using Wiseravenshare.Server.Interfaces.Services.Personalization;

namespace Wiseravenshare.Server.Services.External;

public class WebCrawlerService : IWebCrawlerService
{
    private readonly HttpClient _httpClient;
    private readonly IPersonalizationService _personalizationService;
    private readonly ILogger<WebCrawlerService> _logger;

    public WebCrawlerService(HttpClient httpClient, IPersonalizationService personalizationService, ILogger<WebCrawlerService> logger)
    {
        _httpClient = httpClient;
        _personalizationService = personalizationService;
        _logger = logger;
    }

    public async Task<IEnumerable<CrawledContentDto>> FetchOutsideTrendIntelligenceAsync(string category = "General")
    {
        _logger.LogInformation("Web Crawler fetching external intelligence trends for category '{Category}'", category);
        await Task.Delay(50);

        var sampleCrawledItems = new List<CrawledContentDto>
        {
            new CrawledContentDto
            {
                ContentId = Guid.NewGuid(),
                ContentType = "OutsideTrend",
                Content = "Global developments in renewable energy, battery storage technology, and smart grid automation.",
                Source = "Global Tech Wire",
                Tags = new[] { "Technology", "Energy", "Innovation" },
                PublishedAt = DateTime.UtcNow
            },
            new CrawledContentDto
            {
                ContentId = Guid.NewGuid(),
                ContentType = "OutsideTrend",
                Content = "Emerging music genre trends combining classic FM radio soul with modern ambient synthesizer soundscapes.",
                Source = "Acoustic Intelligence Feed",
                Tags = new[] { "Music", "Radio", "Synthesizer" },
                PublishedAt = DateTime.UtcNow
            }
        };

        return sampleCrawledItems;
    }

    public async Task CrawlAndProcessLatestTrendsAsync()
    {
        try
        {
            var trends = await FetchOutsideTrendIntelligenceAsync();
            foreach (var item in trends)
            {
                await _personalizationService.ProcessCrawledContentAsync(item);
            }
            _logger.LogInformation("Web Crawler finished processing {Count} trend intelligence items.", trends.Count());
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Web Crawler execution encountered an issue.");
        }
    }
}
