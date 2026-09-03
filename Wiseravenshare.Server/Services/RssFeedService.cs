using System.Globalization;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using Wiseravenshare.Server.DTOs.Social;

namespace Wiseravenshare.Server.Services;

public interface IRssFeedService
{
    Task<IReadOnlyList<SocialFeedItemDto>> FetchAndParseFeedAsync(string feedUrl, int limit = 20);
    IReadOnlyList<SocialFeedItemDto> ParseFeedXml(string xmlContent, string sourceFeedUrl, int limit = 20);
}

public class RssFeedService : IRssFeedService
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<RssFeedService> _logger;

    public RssFeedService(HttpClient httpClient, ILogger<RssFeedService> logger)
    {
        _httpClient = httpClient;
        _logger = logger;
    }

    public async Task<IReadOnlyList<SocialFeedItemDto>> FetchAndParseFeedAsync(string feedUrl, int limit = 20)
    {
        if (string.IsNullOrWhiteSpace(feedUrl) || !Uri.TryCreate(feedUrl, UriKind.Absolute, out var uri))
        {
            return [];
        }

        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, uri);
            request.Headers.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Wiseravenshare/1.0 (RSS Aggregator)");

            using var response = await _httpClient.SendAsync(request);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("RSS fetch failed for {Url}: {StatusCode}", feedUrl, response.StatusCode);
                return [];
            }

            var xmlContent = await response.Content.ReadAsStringAsync();
            return ParseFeedXml(xmlContent, feedUrl, limit);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error fetching or parsing RSS feed from {Url}", feedUrl);
            return [];
        }
    }

    public IReadOnlyList<SocialFeedItemDto> ParseFeedXml(string xmlContent, string sourceFeedUrl, int limit = 20)
    {
        if (string.IsNullOrWhiteSpace(xmlContent))
        {
            return [];
        }

        var items = new List<SocialFeedItemDto>();
        var safeLimit = Math.Clamp(limit, 1, 50);

        try
        {
            var doc = XDocument.Parse(xmlContent);

            // 1. RSS 2.0 (<rss><channel><item>...)
            var channel = doc.Root?.Element("channel");
            if (channel != null)
            {
                var channelTitle = channel.Element("title")?.Value?.Trim() ?? GetDomainName(sourceFeedUrl);
                var rssItems = channel.Elements("item");

                foreach (var item in rssItems)
                {
                    if (items.Count >= safeLimit) break;

                    var title = item.Element("title")?.Value?.Trim();
                    var description = item.Element("description")?.Value?.Trim();
                    var link = item.Element("link")?.Value?.Trim() ?? item.Element("guid")?.Value?.Trim();
                    var pubDateStr = item.Element("pubDate")?.Value?.Trim();
                    var author = item.Element("author")?.Value?.Trim()
                        ?? item.Element(XName.Get("creator", "http://purl.org/dc/elements/1.1/"))?.Value?.Trim()
                        ?? channelTitle;

                    var mediaUrl = ExtractRssImage(item, description);
                    var cleanText = StripHtml(title ?? string.Empty);
                    if (!string.IsNullOrWhiteSpace(description))
                    {
                        var bodySnippet = StripHtml(description);
                        if (!string.IsNullOrWhiteSpace(bodySnippet))
                        {
                            cleanText = string.IsNullOrWhiteSpace(cleanText)
                                ? bodySnippet
                                : $"{cleanText}\n\n{bodySnippet}";
                        }
                    }

                    items.Add(new SocialFeedItemDto
                    {
                        Platform = "rss",
                        ExternalId = link ?? title ?? Guid.NewGuid().ToString(),
                        Text = cleanText.Length > 800 ? cleanText[..800] + "..." : cleanText,
                        MediaUrl = mediaUrl,
                        PermalinkUrl = link,
                        AuthorHandle = author,
                        CreatedAt = ParseDateTimeOffset(pubDateStr)
                    });
                }

                return items;
            }

            // 2. Atom 1.0 (<feed xmlns="http://www.w3.org/2005/Atom"><entry>...)
            var rootNs = doc.Root?.Name.Namespace ?? XNamespace.None;
            var entries = doc.Root?.Elements(rootNs + "entry") ?? [];
            var feedTitle = doc.Root?.Element(rootNs + "title")?.Value?.Trim() ?? GetDomainName(sourceFeedUrl);

            foreach (var entry in entries)
            {
                if (items.Count >= safeLimit) break;

                var title = entry.Element(rootNs + "title")?.Value?.Trim();
                var summary = entry.Element(rootNs + "summary")?.Value?.Trim()
                    ?? entry.Element(rootNs + "content")?.Value?.Trim();

                var linkElem = entry.Elements(rootNs + "link")
                    .FirstOrDefault(e => e.Attribute("rel")?.Value == "alternate" || e.Attribute("rel") == null);
                var link = linkElem?.Attribute("href")?.Value?.Trim() ?? entry.Element(rootNs + "id")?.Value?.Trim();

                var updatedStr = entry.Element(rootNs + "updated")?.Value?.Trim()
                    ?? entry.Element(rootNs + "published")?.Value?.Trim();

                var authorName = entry.Element(rootNs + "author")?.Element(rootNs + "name")?.Value?.Trim() ?? feedTitle;

                var mediaUrl = ExtractAtomImage(entry, summary);
                var cleanTitle = StripHtml(title ?? string.Empty);
                var cleanSnippet = StripHtml(summary ?? string.Empty);
                var combinedText = string.IsNullOrWhiteSpace(cleanTitle)
                    ? cleanSnippet
                    : $"{cleanTitle}\n\n{cleanSnippet}";

                items.Add(new SocialFeedItemDto
                {
                    Platform = "rss",
                    ExternalId = link ?? title ?? Guid.NewGuid().ToString(),
                    Text = combinedText.Length > 800 ? combinedText[..800] + "..." : combinedText,
                    MediaUrl = mediaUrl,
                    PermalinkUrl = link,
                    AuthorHandle = authorName,
                    CreatedAt = ParseDateTimeOffset(updatedStr)
                });
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed XML parsing for feed {FeedUrl}", sourceFeedUrl);
        }

        return items;
    }

    private static string? ExtractRssImage(XElement item, string? description)
    {
        // 1. Enclosure
        var enclosure = item.Element("enclosure");
        var encType = enclosure?.Attribute("type")?.Value;
        if (enclosure != null && (encType == null || encType.StartsWith("image/")))
        {
            var url = enclosure.Attribute("url")?.Value;
            if (!string.IsNullOrWhiteSpace(url)) return url;
        }

        // 2. Media:content / Media:thumbnail
        var mediaNs = XNamespace.Get("http://search.yahoo.com/mrss/");
        var mediaThumbnail = item.Element(mediaNs + "thumbnail")?.Attribute("url")?.Value
            ?? item.Element(mediaNs + "content")?.Attribute("url")?.Value;

        if (!string.IsNullOrWhiteSpace(mediaThumbnail)) return mediaThumbnail;

        // 3. Img tag in description
        return ExtractFirstImgSrc(description);
    }

    private static string? ExtractAtomImage(XElement entry, string? content)
    {
        var mediaNs = XNamespace.Get("http://search.yahoo.com/mrss/");
        var mediaThumbnail = entry.Element(mediaNs + "thumbnail")?.Attribute("url")?.Value
            ?? entry.Element(mediaNs + "content")?.Attribute("url")?.Value;

        if (!string.IsNullOrWhiteSpace(mediaThumbnail)) return mediaThumbnail;

        return ExtractFirstImgSrc(content);
    }

    private static string? ExtractFirstImgSrc(string? html)
    {
        if (string.IsNullOrWhiteSpace(html)) return null;

        var match = Regex.Match(html, @"<img[^>]+src=[""']([^""']+)[""']", RegexOptions.IgnoreCase);
        return match.Success ? match.Groups[1].Value : null;
    }

    private static string StripHtml(string input)
    {
        if (string.IsNullOrWhiteSpace(input)) return string.Empty;
        var clean = Regex.Replace(input, @"<[^>]+>", " ");
        clean = System.Net.WebUtility.HtmlDecode(clean);
        return Regex.Replace(clean, @"\s+", " ").Trim();
    }

    private static DateTimeOffset? ParseDateTimeOffset(string? dateStr)
    {
        if (string.IsNullOrWhiteSpace(dateStr)) return null;

        if (DateTimeOffset.TryParse(dateStr, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var parsed))
        {
            return parsed;
        }

        // Common RSS date formats fallback
        string[] formats = [
            "ddd, dd MMM yyyy HH:mm:ss zzz",
            "ddd, dd MMM yyyy HH:mm:ss 'GMT'",
            "ddd, dd MMM yyyy HH:mm:ss UTC",
            "yyyy-MM-ddTHH:mm:ssZ",
            "yyyy-MM-ddTHH:mm:ss.fffZ"
        ];

        foreach (var fmt in formats)
        {
            if (DateTimeOffset.TryParseExact(dateStr, fmt, CultureInfo.InvariantCulture, DateTimeStyles.None, out var dto))
            {
                return dto;
            }
        }

        return null;
    }

    private static string GetDomainName(string url)
    {
        if (Uri.TryCreate(url, UriKind.Absolute, out var uri))
        {
            return uri.Host.Replace("www.", "");
        }
        return "RSS Feed";
    }
}
