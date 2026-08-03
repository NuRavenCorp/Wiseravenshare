using System.Globalization;
using System.Text.Json;

namespace Wiseravenshare.Server.Services;

public interface INewsAggregationService
{
    Task<NewsSearchResponse> SearchNewsAsync(string query, string? language, int limit, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<BbcLanguageOption>> GetBbcSupportedLanguagesAsync(CancellationToken cancellationToken = default);
}

public sealed class NewsAggregationService : INewsAggregationService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private static readonly Dictionary<string, string> BbcLanguageMap = new(StringComparer.OrdinalIgnoreCase)
    {
        ["en"] = "english",
        ["english"] = "english",
        ["ar"] = "arabic",
        ["arabic"] = "arabic",
        ["zh"] = "chinese",
        ["chinese"] = "chinese",
        ["id"] = "indonesian",
        ["indonesian"] = "indonesian",
        ["fr"] = "french",
        ["french"] = "french",
        ["es"] = "spanish",
        ["spanish"] = "spanish",
        ["ru"] = "russian",
        ["russian"] = "russian",
        ["pt"] = "portuguese",
        ["portuguese"] = "portuguese",
        ["bn"] = "bengali",
        ["bengali"] = "bengali",
        ["hi"] = "hindi",
        ["hindi"] = "hindi",
        ["ur"] = "urdu",
        ["urdu"] = "urdu",
        ["ja"] = "japanese",
        ["japanese"] = "japanese",
        ["ko"] = "korean",
        ["korean"] = "korean",
        ["tr"] = "turkish",
        ["turkish"] = "turkish",
        ["vi"] = "vietnamese",
        ["vietnamese"] = "vietnamese"
    };

    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;
    private readonly ILogger<NewsAggregationService> _logger;

    public NewsAggregationService(HttpClient httpClient, IConfiguration configuration, ILogger<NewsAggregationService> logger)
    {
        _httpClient = httpClient;
        _configuration = configuration;
        _logger = logger;

        // Keep each provider call short to avoid request timeout amplification.
        _httpClient.Timeout = TimeSpan.FromSeconds(8);
        if (_httpClient.DefaultRequestHeaders.UserAgent.Count == 0)
        {
            _httpClient.DefaultRequestHeaders.UserAgent.ParseAdd("Wiseravenshare-News/1.0");
        }
    }

    public async Task<NewsSearchResponse> SearchNewsAsync(string query, string? language, int limit, CancellationToken cancellationToken = default)
    {
        var normalizedQuery = string.IsNullOrWhiteSpace(query) ? "breaking news" : query.Trim();
        var normalizedLanguage = string.IsNullOrWhiteSpace(language) ? "en" : language.Trim().ToLowerInvariant();
        var normalizedLimit = Math.Clamp(limit, 1, 50);

        var providerTasks = new[]
        {
            FetchBbcNewsApiAsync(normalizedQuery, normalizedLanguage, normalizedLimit, cancellationToken),
            FetchNewsDataIoAsync(normalizedQuery, normalizedLanguage, normalizedLimit, cancellationToken),
            FetchMediastackAsync(normalizedQuery, normalizedLanguage, normalizedLimit, cancellationToken),
            FetchSerpApiAsync(normalizedQuery, normalizedLanguage, normalizedLimit, cancellationToken)
        };
        var providers = (await Task.WhenAll(providerTasks)).ToList();

        var merged = providers
            .SelectMany(p => p.Articles)
            .Where(a => !string.IsNullOrWhiteSpace(a.Title))
            .GroupBy(CreateDeduplicationKey)
            .Select(group => group
                .OrderByDescending(x => x.PublishedAtUtc ?? DateTimeOffset.MinValue)
                .First())
            .OrderByDescending(a => a.PublishedAtUtc ?? DateTimeOffset.MinValue)
            .Take(normalizedLimit)
            .ToList();

        return new NewsSearchResponse
        {
            Query = normalizedQuery,
            Language = normalizedLanguage,
            FetchedAtUtc = DateTimeOffset.UtcNow,
            Articles = merged,
            ProviderStatuses = providers
                .Select(p => new NewsProviderStatus
                {
                    Provider = p.Provider,
                    Configured = p.Configured,
                    Succeeded = p.Succeeded,
                    ReturnedCount = p.Articles.Count,
                    Error = p.Error
                })
                .ToList()
        };
    }

    public async Task<IReadOnlyList<BbcLanguageOption>> GetBbcSupportedLanguagesAsync(CancellationToken cancellationToken = default)
    {
        var baseUrl = (_configuration["NewsApis:BbcNewsApi:BaseUrl"] ?? "https://bbc-news-api.vercel.app").TrimEnd('/');
        var url = $"{baseUrl}/languages";

        try
        {
            using var response = await _httpClient.GetAsync(url, cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("BBC languages request failed with status {StatusCode}: {Body}", (int)response.StatusCode, TrimError(body));
                return [];
            }

            var payload = JsonSerializer.Deserialize<BbcLanguagesEnvelope>(body, JsonOptions);
            if (payload?.Languages is null)
            {
                return [];
            }

            return payload.Languages
                .Where(language => !string.IsNullOrWhiteSpace(language.Code))
                .Select(language => new BbcLanguageOption
                {
                    Code = language.Code,
                    Name = string.IsNullOrWhiteSpace(language.Name) ? language.Code : language.Name,
                    Url = language.Url,
                    Description = language.Description
                })
                .ToList();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "BBC languages request failed.");
            return [];
        }
    }

    private async Task<ProviderFetchResult> FetchBbcNewsApiAsync(string query, string language, int limit, CancellationToken cancellationToken)
    {
        const string providerName = "bbcapi";
        var enabled = !_configuration.GetValue<bool?>("NewsApis:BbcNewsApi:Enabled").HasValue
            || _configuration.GetValue<bool>("NewsApis:BbcNewsApi:Enabled");
        if (!enabled)
        {
            return ProviderFetchResult.NotConfigured(providerName, "BBC provider is disabled by configuration.");
        }

        var baseUrl = (_configuration["NewsApis:BbcNewsApi:BaseUrl"] ?? "https://bbc-news-api.vercel.app").TrimEnd('/');
        var bbcLanguage = ToBbcLanguage(language);
        var url = $"{baseUrl}/latest?lang={Uri.EscapeDataString(bbcLanguage)}";

        try
        {
            using var response = await _httpClient.GetAsync(url, cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                return ProviderFetchResult.Failed(providerName, $"HTTP {(int)response.StatusCode}: {TrimError(body)}");
            }

            using var document = JsonDocument.Parse(body);
            var root = document.RootElement;

            if (root.TryGetProperty("status", out var statusNode)
                && statusNode.TryGetInt32(out var remoteStatus)
                && remoteStatus >= 400)
            {
                var remoteError = root.TryGetProperty("error", out var errorNode) ? errorNode.GetString() : "BBC API returned error status.";
                return ProviderFetchResult.Failed(providerName, remoteError ?? "BBC API returned error status.");
            }

            var articles = new List<NewsArticle>();
            foreach (var section in root.EnumerateObject())
            {
                var sectionName = section.Name;
                if (sectionName.Equals("status", StringComparison.OrdinalIgnoreCase)
                    || sectionName.Equals("timestamp", StringComparison.OrdinalIgnoreCase)
                    || sectionName.Equals("elapsed time", StringComparison.OrdinalIgnoreCase)
                    || sectionName.Equals("error", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                if (section.Value.ValueKind != JsonValueKind.Array)
                {
                    continue;
                }

                foreach (var item in section.Value.EnumerateArray())
                {
                    var title = item.TryGetProperty("title", out var titleNode) ? titleNode.GetString() : null;
                    var summary = item.TryGetProperty("summary", out var summaryNode) ? summaryNode.GetString() : null;
                    var link = item.TryGetProperty("news_link", out var linkNode) ? linkNode.GetString() : null;
                    var imageLink = item.TryGetProperty("image_link", out var imageNode) ? imageNode.GetString() : null;

                    if (string.IsNullOrWhiteSpace(title))
                    {
                        continue;
                    }

                    if (!IsMatchForQuery(query, title, summary))
                    {
                        continue;
                    }

                    articles.Add(new NewsArticle
                    {
                        Provider = providerName,
                        Source = "BBC News",
                        Title = title,
                        Description = summary,
                        Url = link,
                        ImageUrl = imageLink,
                        Author = null,
                        PublishedAtUtc = null
                    });
                }
            }

            if (articles.Count > limit)
            {
                articles = articles.Take(limit).ToList();
            }

            return ProviderFetchResult.Success(providerName, articles);
        }
        catch (OperationCanceledException ex) when (!cancellationToken.IsCancellationRequested)
        {
            _logger.LogWarning(ex, "BBC API request timed out.");
            return ProviderFetchResult.Failed(providerName, "Provider request timed out.");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "BBC API request failed.");
            return ProviderFetchResult.Failed(providerName, ex.Message);
        }
    }

    private async Task<ProviderFetchResult> FetchNewsDataIoAsync(string query, string language, int limit, CancellationToken cancellationToken)
    {
        const string providerName = "newsdataio";
        var providerLimit = Math.Min(limit, 10);
        var apiKey = _configuration["NewsApis:NewsDataIo:ApiKey"];
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            return ProviderFetchResult.NotConfigured(providerName, "NewsDataIO API key is missing.");
        }

        var url =
            $"https://newsdata.io/api/1/latest?apikey={Uri.EscapeDataString(apiKey)}&q={Uri.EscapeDataString(query)}&language={Uri.EscapeDataString(language)}&size={providerLimit}";

        try
        {
            using var response = await _httpClient.GetAsync(url, cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                return ProviderFetchResult.Failed(providerName, $"HTTP {(int)response.StatusCode}: {TrimError(body)}");
            }

            using var document = JsonDocument.Parse(body);
            if (!document.RootElement.TryGetProperty("results", out var results)
                || results.ValueKind != JsonValueKind.Array)
            {
                return ProviderFetchResult.Success(providerName, []);
            }

            var articles = new List<NewsArticle>();
            foreach (var item in results.EnumerateArray())
            {
                var source = item.TryGetProperty("source_id", out var sourceId) ? sourceId.GetString() : null;
                var author = item.TryGetProperty("creator", out var creatorNode) && creatorNode.ValueKind == JsonValueKind.Array
                    ? string.Join(", ", creatorNode.EnumerateArray().Select(c => c.GetString()).Where(v => !string.IsNullOrWhiteSpace(v)))
                    : null;

                articles.Add(new NewsArticle
                {
                    Provider = providerName,
                    Source = source,
                    Title = item.TryGetProperty("title", out var title) ? title.GetString() ?? string.Empty : string.Empty,
                    Description = item.TryGetProperty("description", out var description) ? description.GetString() : null,
                    Url = item.TryGetProperty("link", out var link) ? link.GetString() : null,
                    ImageUrl = item.TryGetProperty("image_url", out var image) ? image.GetString() : null,
                    Author = author,
                    PublishedAtUtc = ParseDate(item, "pubDate")
                });
            }

            return ProviderFetchResult.Success(providerName, articles);
        }
        catch (OperationCanceledException ex) when (!cancellationToken.IsCancellationRequested)
        {
            _logger.LogWarning(ex, "NewsDataIO request timed out.");
            return ProviderFetchResult.Failed(providerName, "Provider request timed out.");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "NewsDataIO request failed.");
            return ProviderFetchResult.Failed(providerName, ex.Message);
        }
    }

    private async Task<ProviderFetchResult> FetchMediastackAsync(string query, string language, int limit, CancellationToken cancellationToken)
    {
        const string providerName = "mediastack";
        var apiKey = _configuration["NewsApis:Mediastack:ApiKey"];
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            return ProviderFetchResult.NotConfigured(providerName, "Mediastack API key is missing.");
        }

        var url =
            $"https://api.mediastack.com/v1/news?access_key={Uri.EscapeDataString(apiKey)}&keywords={Uri.EscapeDataString(query)}&languages={Uri.EscapeDataString(language)}&limit={limit}&sort=published_desc";

        try
        {
            using var response = await _httpClient.GetAsync(url, cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                return ProviderFetchResult.Failed(providerName, $"HTTP {(int)response.StatusCode}: {TrimError(body)}");
            }

            using var document = JsonDocument.Parse(body);
            if (!document.RootElement.TryGetProperty("data", out var data)
                || data.ValueKind != JsonValueKind.Array)
            {
                return ProviderFetchResult.Success(providerName, []);
            }

            var articles = new List<NewsArticle>();
            foreach (var item in data.EnumerateArray())
            {
                articles.Add(new NewsArticle
                {
                    Provider = providerName,
                    Source = item.TryGetProperty("source", out var source) ? source.GetString() : null,
                    Title = item.TryGetProperty("title", out var title) ? title.GetString() ?? string.Empty : string.Empty,
                    Description = item.TryGetProperty("description", out var description) ? description.GetString() : null,
                    Url = item.TryGetProperty("url", out var link) ? link.GetString() : null,
                    ImageUrl = item.TryGetProperty("image", out var image) ? image.GetString() : null,
                    Author = item.TryGetProperty("author", out var author) ? author.GetString() : null,
                    PublishedAtUtc = ParseDate(item, "published_at")
                });
            }

            return ProviderFetchResult.Success(providerName, articles);
        }
        catch (OperationCanceledException ex) when (!cancellationToken.IsCancellationRequested)
        {
            _logger.LogWarning(ex, "Mediastack request timed out.");
            return ProviderFetchResult.Failed(providerName, "Provider request timed out.");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Mediastack request failed.");
            return ProviderFetchResult.Failed(providerName, ex.Message);
        }
    }

    private async Task<ProviderFetchResult> FetchSerpApiAsync(string query, string language, int limit, CancellationToken cancellationToken)
    {
        const string providerName = "serpapi";
        var apiKey = _configuration["NewsApis:SerpApi:ApiKey"];
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            return ProviderFetchResult.NotConfigured(providerName, "SerpApi key is missing.");
        }

        var url =
            $"https://serpapi.com/search.json?engine=google_news&q={Uri.EscapeDataString(query)}&hl={Uri.EscapeDataString(language)}&num={Math.Min(limit, 20)}&api_key={Uri.EscapeDataString(apiKey)}";

        try
        {
            using var response = await _httpClient.GetAsync(url, cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                return ProviderFetchResult.Failed(providerName, $"HTTP {(int)response.StatusCode}: {TrimError(body)}");
            }

            using var document = JsonDocument.Parse(body);
            if (!document.RootElement.TryGetProperty("news_results", out var newsResults)
                || newsResults.ValueKind != JsonValueKind.Array)
            {
                return ProviderFetchResult.Success(providerName, []);
            }

            var articles = new List<NewsArticle>();
            foreach (var item in newsResults.EnumerateArray())
            {
                string? source = null;
                if (item.TryGetProperty("source", out var sourceNode))
                {
                    source = sourceNode.ValueKind == JsonValueKind.Object && sourceNode.TryGetProperty("name", out var sourceName)
                        ? sourceName.GetString()
                        : sourceNode.GetString();
                }

                articles.Add(new NewsArticle
                {
                    Provider = providerName,
                    Source = source,
                    Title = item.TryGetProperty("title", out var title) ? title.GetString() ?? string.Empty : string.Empty,
                    Description = item.TryGetProperty("snippet", out var snippet) ? snippet.GetString() : null,
                    Url = item.TryGetProperty("link", out var link) ? link.GetString() : null,
                    ImageUrl = item.TryGetProperty("thumbnail", out var thumbnail) ? thumbnail.GetString() : null,
                    Author = null,
                    PublishedAtUtc = ParseDate(item, "date")
                });
            }

            return ProviderFetchResult.Success(providerName, articles);
        }
        catch (OperationCanceledException ex) when (!cancellationToken.IsCancellationRequested)
        {
            _logger.LogWarning(ex, "SerpApi request timed out.");
            return ProviderFetchResult.Failed(providerName, "Provider request timed out.");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "SerpApi request failed.");
            return ProviderFetchResult.Failed(providerName, ex.Message);
        }
    }

    private static string CreateDeduplicationKey(NewsArticle article)
    {
        if (!string.IsNullOrWhiteSpace(article.Url))
        {
            return article.Url.Trim().ToLowerInvariant();
        }

        return article.Title.Trim().ToLowerInvariant();
    }

    private static DateTimeOffset? ParseDate(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var node))
        {
            return null;
        }

        var value = node.GetString();
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var parsed)
            ? parsed
            : null;
    }

    private static string TrimError(string body)
    {
        if (string.IsNullOrWhiteSpace(body))
        {
            return "Unknown error";
        }

        return body.Length <= 400 ? body : body[..400];
    }

    private static bool IsMatchForQuery(string query, string? title, string? summary)
    {
        var normalizedQuery = (query ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalizedQuery) || normalizedQuery.Equals("breaking news", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        return (title?.Contains(normalizedQuery, StringComparison.OrdinalIgnoreCase) ?? false)
            || (summary?.Contains(normalizedQuery, StringComparison.OrdinalIgnoreCase) ?? false);
    }

    private static string ToBbcLanguage(string language)
    {
        if (string.IsNullOrWhiteSpace(language))
        {
            return "english";
        }

        return BbcLanguageMap.TryGetValue(language.Trim(), out var mapped)
            ? mapped
            : "english";
    }

    private sealed class ProviderFetchResult
    {
        public required string Provider { get; init; }
        public required bool Configured { get; init; }
        public required bool Succeeded { get; init; }
        public required List<NewsArticle> Articles { get; init; }
        public string? Error { get; init; }

        public static ProviderFetchResult Success(string provider, List<NewsArticle> articles)
            => new()
            {
                Provider = provider,
                Configured = true,
                Succeeded = true,
                Articles = articles,
                Error = null
            };

        public static ProviderFetchResult NotConfigured(string provider, string message)
            => new()
            {
                Provider = provider,
                Configured = false,
                Succeeded = false,
                Articles = [],
                Error = message
            };

        public static ProviderFetchResult Failed(string provider, string message)
            => new()
            {
                Provider = provider,
                Configured = true,
                Succeeded = false,
                Articles = [],
                Error = message
            };
    }

    private sealed class BbcLanguagesEnvelope
    {
        public List<BbcLanguageDto>? Languages { get; set; }
    }

    private sealed class BbcLanguageDto
    {
        public string Code { get; set; } = string.Empty;
        public string? Name { get; set; }
        public string? Url { get; set; }
        public string? Description { get; set; }
    }
}

public sealed class NewsSearchResponse
{
    public string Query { get; set; } = string.Empty;
    public string Language { get; set; } = "en";
    public DateTimeOffset FetchedAtUtc { get; set; }
    public List<NewsArticle> Articles { get; set; } = [];
    public List<NewsProviderStatus> ProviderStatuses { get; set; } = [];
}

public sealed class NewsArticle
{
    public string Provider { get; set; } = string.Empty;
    public string? Source { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? Url { get; set; }
    public string? ImageUrl { get; set; }
    public string? Author { get; set; }
    public DateTimeOffset? PublishedAtUtc { get; set; }
}

public sealed class NewsProviderStatus
{
    public string Provider { get; set; } = string.Empty;
    public bool Configured { get; set; }
    public bool Succeeded { get; set; }
    public int ReturnedCount { get; set; }
    public string? Error { get; set; }
}

public sealed class BbcLanguageOption
{
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Url { get; set; }
    public string? Description { get; set; }
}