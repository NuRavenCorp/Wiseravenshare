using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.AspNetCore.Mvc;

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
    private const string DemoApiKey = "demo";

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IMemoryCache _cache;
    private readonly IConfiguration _configuration;

    public MarketController(IHttpClientFactory httpClientFactory, IMemoryCache cache, IConfiguration configuration)
    {
        _httpClientFactory = httpClientFactory;
        _cache = cache;
        _configuration = configuration;
    }

    [HttpGet("quotes")]
    public async Task<IActionResult> GetQuotes([FromQuery] string? symbols = null)
    {
        var requestedSymbols = ParseSymbols(symbols);
        if (requestedSymbols.Count == 0)
        {
            return BadRequest(new { message = "At least one symbol is required." });
        }

        var cacheKey = $"market-quotes:{string.Join(',', requestedSymbols)}";
        if (_cache.TryGetValue<CachedMarketResponse>(cacheKey, out var cachedResponse) && cachedResponse is not null)
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

        try
        {
            var liveResponse = await FetchAlphaVantageQuotesAsync(requestedSymbols, HttpContext.RequestAborted);
            if (liveResponse.Quotes.Count == 0)
            {
                return StatusCode(StatusCodes.Status503ServiceUnavailable, new
                {
                    message = "Market data provider returned no quotes."
                });
            }

            _cache.Set(cacheKey, liveResponse, QuoteCacheDuration);

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
            if (_cache.TryGetValue<CachedMarketResponse>(cacheKey, out cachedResponse) && cachedResponse is not null)
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

            return StatusCode(StatusCodes.Status503ServiceUnavailable, new
            {
                message = "Failed to fetch market data.",
                detail = ex.Message
            });
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
