using Wiseravenshare.Server.DTOs.Personalization;

namespace Wiseravenshare.Server.Interfaces.Services.External;

public interface IWebCrawlerService
{
    Task<IEnumerable<CrawledContentDto>> FetchOutsideTrendIntelligenceAsync(string category = "General", CancellationToken ct = default);
    Task<int> CrawlAndProcessLatestTrendsAsync(CancellationToken ct = default);
    Task<CrawlerSourceStatusDto> GetCrawlerSourceStatusAsync(CancellationToken ct = default);
}
