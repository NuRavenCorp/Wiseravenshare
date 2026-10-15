using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OutputCaching;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
[Route("[controller]")]
public sealed class MarketController : ControllerBase
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private static readonly TimeSpan QuoteCacheDuration = TimeSpan.FromMinutes(15);
    private static readonly TimeSpan ProviderTimeout = TimeSpan.FromSeconds(4);
    private static readonly SemaphoreSlim RefreshLock = new(1, 1);
    private const string DemoApiKey = "demo";

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IMemoryCache _cache;
    private readonly IDistributedCache _distributedCache;
    private readonly IConfiguration _configuration;
    private readonly ILogger<MarketController> _logger;
    private readonly PerformanceMetricsService _metricsService;

    public MarketController(
        IHttpClientFactory httpClientFactory,
        IMemoryCache cache,
        IDistributedCache distributedCache,
        IConfiguration configuration,
        ILogger<MarketController> logger,
        PerformanceMetricsService metricsService)
    {
        _httpClientFactory = httpClientFactory;
        _cache = cache;
        _distributedCache = distributedCache;
        _configuration = configuration;
        _logger = logger;
        _metricsService = metricsService;
    }

    [HttpGet("quotes")]
    [OutputCache(PolicyName = "MarketQuotes")]
    public async Task<IActionResult> GetQuotes([FromQuery] string? symbols = null)
    {
        var requestedSymbols = ParseSymbols(symbols);
        if (requestedSymbols.Count == 0)
        {
            return BadRequest(new { message = "At least one symbol is required." });
        }

        var cacheKey = $"market-quotes:{string.Join(',', requestedSymbols)}";
        var cachedResponse = await TryGetCachedResponseAsync(cacheKey, HttpContext.RequestAborted);
        if (cachedResponse is not null)
        {
            return Ok(new
            {
                quotes = cachedResponse.Quotes,
                source = cachedResponse.Source,
                fetchedAt = cachedResponse.FetchedAt,
                stale = false,
                cached = true
            });
        }

        await RefreshLock.WaitAsync(HttpContext.RequestAborted);
        try
        {
            // Double-check cache after lock acquisition to avoid thundering herd refreshes.
            cachedResponse = await TryGetCachedResponseAsync(cacheKey, HttpContext.RequestAborted);
            if (cachedResponse is not null)
            {
                return Ok(new
                {
                    quotes = cachedResponse.Quotes,
                    source = cachedResponse.Source,
                    fetchedAt = cachedResponse.FetchedAt,
                    stale = false,
                    cached = true
                });
            }

            _metricsService.RecordCacheMiss("market_quotes", "composite");

            using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(HttpContext.RequestAborted);
            timeoutCts.CancelAfter(ProviderTimeout);

            var liveResponse = await FetchAlphaVantageQuotesAsync(requestedSymbols, timeoutCts.Token);
            if (liveResponse.Quotes.Count == 0)
            {
                var fallback = BuildFallbackResponse(requestedSymbols, "Provider returned no live quotes");
                await SetCachedResponseAsync(cacheKey, fallback, TimeSpan.FromMinutes(2), HttpContext.RequestAborted);
                return Ok(new
                {
                    quotes = fallback.Quotes,
                    source = fallback.Source,
                    fetchedAt = fallback.FetchedAt,
                    stale = true,
                    cached = false,
                    warning = "Live provider returned no quotes; serving fallback market snapshot."
                });
            }

            await SetCachedResponseAsync(cacheKey, liveResponse, QuoteCacheDuration, HttpContext.RequestAborted);

            return Ok(new
            {
                quotes = liveResponse.Quotes,
                source = liveResponse.Source,
                fetchedAt = liveResponse.FetchedAt,
                stale = false,
                cached = false
            });
        }
        catch (Exception ex)
        {
            cachedResponse = await TryGetCachedResponseAsync(cacheKey, HttpContext.RequestAborted);
            if (cachedResponse is not null)
            {
                return Ok(new
                {
                    quotes = cachedResponse.Quotes,
                    source = cachedResponse.Source,
                    fetchedAt = cachedResponse.FetchedAt,
                    stale = true,
                    cached = true,
                    warning = "Live provider unavailable; serving cached market data."
                });
            }

            var fallback = BuildFallbackResponse(requestedSymbols, ex.Message);
            await SetCachedResponseAsync(cacheKey, fallback, TimeSpan.FromMinutes(2), HttpContext.RequestAborted);
            return Ok(new
            {
                quotes = fallback.Quotes,
                source = fallback.Source,
                fetchedAt = fallback.FetchedAt,
                stale = true,
                cached = false,
                warning = "Live provider failed; serving fallback market snapshot."
            });
        }
        finally
        {
            RefreshLock.Release();
        }
    }

    private async Task<CachedMarketResponse?> TryGetCachedResponseAsync(string cacheKey, CancellationToken cancellationToken)
    {
        if (_cache.TryGetValue<CachedMarketResponse>(cacheKey, out var memoryCached) && memoryCached is not null)
        {
            _metricsService.RecordCacheHit("market_quotes", "memory");
            return memoryCached;
        }

        try
        {
            var payload = await _distributedCache.GetStringAsync(cacheKey, cancellationToken);
            if (string.IsNullOrWhiteSpace(payload))
            {
                return null;
            }

            var distributedCached = JsonSerializer.Deserialize<CachedMarketResponse>(payload, JsonOptions);
            if (distributedCached is null)
            {
                return null;
            }

            _cache.Set(cacheKey, distributedCached, TimeSpan.FromMinutes(1));
            _metricsService.RecordCacheHit("market_quotes", "distributed");
            return distributedCached;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Distributed cache read failed for key {CacheKey}.", cacheKey);
            return null;
        }
    }

    private async Task SetCachedResponseAsync(string cacheKey, CachedMarketResponse value, TimeSpan ttl, CancellationToken cancellationToken)
    {
        _cache.Set(cacheKey, value, ttl);

        try
        {
            var payload = JsonSerializer.Serialize(value, JsonOptions);
            await _distributedCache.SetStringAsync(
                cacheKey,
                payload,
                new DistributedCacheEntryOptions
                {
                    AbsoluteExpirationRelativeToNow = ttl
                },
                cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Distributed cache write failed for key {CacheKey}.", cacheKey);
        }
    }

    private static List<string> ParseSymbols(string? symbols)
    {
        var defaults = new[] { "MSFT", "IBM" };
        var input = string.IsNullOrWhiteSpace(symbols) ? defaults : symbols.Split(',');

        return input
            .Select(s => s.Trim().ToUpperInvariant())
            .Where(s => !string.IsNullOrWhiteSpace(s))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(15)
            .ToList();
    }

    private async Task<CachedMarketResponse> FetchAlphaVantageQuotesAsync(IReadOnlyCollection<string> symbols, CancellationToken cancellationToken)
    {
        using var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(10);
        client.DefaultRequestHeaders.UserAgent.ParseAdd("Wiseravenshare-MarketWatch/1.0");

        var apiKey = (_configuration["AlphaVantage:ApiKey"] ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            apiKey = DemoApiKey;
        }

        var fetchTasks = symbols.Select((symbol) => FetchAlphaVantageQuoteAsync(client, symbol, apiKey, cancellationToken));
        var fetchedQuotes = await Task.WhenAll(fetchTasks);
        var quotes = fetchedQuotes.Where((quote) => quote is not null).Cast<object>().ToList();

        return new CachedMarketResponse
        {
            Quotes = quotes,
            Source = apiKey == DemoApiKey ? "Alpha Vantage (demo)" : "Alpha Vantage",
            FetchedAt = DateTime.UtcNow
        };
    }

    private static CachedMarketResponse BuildFallbackResponse(IReadOnlyCollection<string> symbols, string reason)
    {
        var seed = new Dictionary<string, (decimal Price, decimal Change, decimal ChangePercent, long Volume)>(StringComparer.OrdinalIgnoreCase)
        {
            ["MSFT"] = (487.65m, 22.93m, 4.9342m, 66663409),
            ["IBM"] = (226.13m, 1.45m, 0.6453m, 4288300),
            ["AAPL"] = (219.44m, -0.72m, -0.3270m, 51200438),
            ["NVDA"] = (126.19m, 2.02m, 1.6252m, 453991124),
            ["TSLA"] = (251.80m, -3.14m, -1.2317m, 97212581)
        };

        var asOf = DateTime.UtcNow;
        var quotes = symbols.Select((symbol) =>
        {
            var key = symbol.ToUpperInvariant();
            if (!seed.TryGetValue(key, out var sample))
            {
                sample = (100m, 0m, 0m, 0);
            }

            return (object)new
            {
                symbol = key,
                name = key,
                price = sample.Price,
                change = sample.Change,
                changePercent = sample.ChangePercent,
                volume = sample.Volume,
                marketState = "Fallback Snapshot",
                asOf,
                note = "Fallback quote",
                reason
            };
        }).ToList();

        return new CachedMarketResponse
        {
            Quotes = quotes,
            Source = "Wiseravenshare fallback snapshot",
            FetchedAt = asOf
        };
    }

    private static async Task<object?> FetchAlphaVantageQuoteAsync(HttpClient client, string symbol, string apiKey, CancellationToken cancellationToken)
    {
        var url = $"https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol={Uri.EscapeDataString(symbol)}&apikey={Uri.EscapeDataString(apiKey)}";
        using var response = await client.GetAsync(url, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            return null;
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        var payload = await JsonSerializer.DeserializeAsync<AlphaVantageEnvelope>(stream, JsonOptions, cancellationToken);
        var quote = payload?.GlobalQuote;
        if (quote is null || string.IsNullOrWhiteSpace(quote.Price))
        {
            return null;
        }

        var latestTradingDay = DateTime.TryParse(quote.LatestTradingDay, out var parsedDate)
            ? DateTime.SpecifyKind(parsedDate, DateTimeKind.Utc)
            : DateTime.UtcNow;

        return new
        {
            symbol = string.IsNullOrWhiteSpace(quote.Symbol) ? symbol : quote.Symbol,
            name = string.IsNullOrWhiteSpace(quote.Symbol) ? symbol : quote.Symbol,
            price = ParseDecimal(quote.Price),
            change = ParseDecimal(quote.Change),
            changePercent = ParsePercent(quote.ChangePercent),
            volume = ParseLong(quote.Volume),
            marketState = "Daily Close",
            asOf = latestTradingDay
        };
    }

    private static decimal? ParseDecimal(string? value)
    {
        if (decimal.TryParse(value, out var parsed))
        {
            return parsed;
        }

        return null;
    }

    private static decimal? ParsePercent(string? value)
    {
        var normalized = (value ?? string.Empty).Replace("%", string.Empty, StringComparison.Ordinal);
        return ParseDecimal(normalized);
    }

    private static long? ParseLong(string? value)
    {
        if (long.TryParse(value, out var parsed))
        {
            return parsed;
        }

        return null;
    }

    private sealed class CachedMarketResponse
    {
        public List<object> Quotes { get; set; } = new();
        public string Source { get; set; } = string.Empty;
        public DateTime FetchedAt { get; set; }
    }

    private sealed class AlphaVantageEnvelope
    {
        public AlphaVantageQuote? GlobalQuote { get; set; }
    }

    private sealed class AlphaVantageQuote
    {
        [JsonPropertyName("01. symbol")]
        public string? Symbol { get; set; }

        [JsonPropertyName("05. price")]
        public string? Price { get; set; }

        [JsonPropertyName("06. volume")]
        public string? Volume { get; set; }

        [JsonPropertyName("07. latest trading day")]
        public string? LatestTradingDay { get; set; }

        [JsonPropertyName("09. change")]
        public string? Change { get; set; }

        [JsonPropertyName("10. change percent")]
        public string? ChangePercent { get; set; }
    }
}
