using Wiseravenshare.Server.DTOs.Personalization;

namespace Wiseravenshare.Server.Interfaces.Services.External;

public interface IWebCrawlerService
{
    Task<IEnumerable<CrawledContentDto>> FetchOutsideTrendIntelligenceAsync(string category = "General");
    Task CrawlAndProcessLatestTrendsAsync();
}
