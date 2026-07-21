using System.Text.Json;
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

    private readonly IHttpClientFactory _httpClientFactory;

    public MarketController(IHttpClientFactory httpClientFactory)
    {
        _httpClientFactory = httpClientFactory;
    }

    [HttpGet("quotes")]
    public async Task<IActionResult> GetQuotes([FromQuery] string? symbols = null)
    {
        var requestedSymbols = ParseSymbols(symbols);
        if (requestedSymbols.Count == 0)
        {
            return BadRequest(new { message = "At least one symbol is required." });
        }

        var joinedSymbols = string.Join(',', requestedSymbols);
        var url = $"https://query1.finance.yahoo.com/v7/finance/quote?symbols={Uri.EscapeDataString(joinedSymbols)}";

        using var client = _httpClientFactory.CreateClient();
        client.DefaultRequestHeaders.UserAgent.ParseAdd("Wiseravenshare-MarketWatch/1.0");

        try
        {
            using var response = await client.GetAsync(url);
            if (!response.IsSuccessStatusCode)
            {
                return StatusCode(StatusCodes.Status502BadGateway, new
                {
                    message = "Market data provider request failed.",
                    statusCode = (int)response.StatusCode
                });
            }

            await using var stream = await response.Content.ReadAsStreamAsync();
            var payload = await JsonSerializer.DeserializeAsync<YahooQuoteEnvelope>(stream, JsonOptions);
            var quotes = payload?.QuoteResponse?.Result ?? new List<YahooQuote>();

            var mapped = quotes.Select(q => new
            {
                symbol = q.Symbol ?? string.Empty,
                name = q.ShortName ?? q.LongName ?? q.Symbol ?? string.Empty,
                price = q.RegularMarketPrice,
                change = q.RegularMarketChange,
                changePercent = q.RegularMarketChangePercent,
                volume = q.RegularMarketVolume,
                marketState = q.MarketState ?? string.Empty,
                asOf = q.RegularMarketTime.HasValue
                    ? DateTimeOffset.FromUnixTimeSeconds(q.RegularMarketTime.Value).UtcDateTime
                    : DateTime.UtcNow
            }).ToList();

            return Ok(new { quotes = mapped, source = "Yahoo Finance", fetchedAt = DateTime.UtcNow });
        }
        catch (Exception ex)
        {
            return StatusCode(StatusCodes.Status502BadGateway, new
            {
                message = "Failed to fetch market data.",
                detail = ex.Message
            });
        }
    }

    private static List<string> ParseSymbols(string? symbols)
    {
        var defaults = new[] { "AAPL", "MSFT", "NVDA", "TSLA" };
        var input = string.IsNullOrWhiteSpace(symbols) ? defaults : symbols.Split(',');

        return input
            .Select(s => s.Trim().ToUpperInvariant())
            .Where(s => !string.IsNullOrWhiteSpace(s))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(15)
            .ToList();
    }

    private sealed class YahooQuoteEnvelope
    {
        public YahooQuoteResponse? QuoteResponse { get; set; }
    }

    private sealed class YahooQuoteResponse
    {
        public List<YahooQuote> Result { get; set; } = new();
    }

    private sealed class YahooQuote
    {
        public string? Symbol { get; set; }
        public string? ShortName { get; set; }
        public string? LongName { get; set; }
        public decimal? RegularMarketPrice { get; set; }
        public decimal? RegularMarketChange { get; set; }
        public decimal? RegularMarketChangePercent { get; set; }
        public long? RegularMarketVolume { get; set; }
        public long? RegularMarketTime { get; set; }
        public string? MarketState { get; set; }
    }
}
