using Microsoft.AspNetCore.Mvc;
using System.Globalization;
using System.Text.Json;

namespace Wiseravenshare.Server.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class MarketDataController : ControllerBase
    {
        private static readonly HttpClient HttpClient = new()
        {
            Timeout = TimeSpan.FromSeconds(10)
        };

        private static readonly string[] DefaultSymbols =
        [
            "AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "NVDA", "META", "SPY", "QQQ", "BTC-USD"
        ];

        [HttpGet("watchlist")]
        public async Task<IActionResult> GetWatchlist([FromQuery] string? symbols = null)
        {
            var parsedSymbols = ParseSymbols(symbols);
            if (parsedSymbols.Count == 0)
            {
                return BadRequest(new { message = "No valid symbols were provided." });
            }

            var query = string.Join(",", parsedSymbols);
            var requestUrl = $"https://query1.finance.yahoo.com/v7/finance/quote?symbols={Uri.EscapeDataString(query)}";

            using var response = await HttpClient.GetAsync(requestUrl);
            if (!response.IsSuccessStatusCode)
            {
                return StatusCode((int)response.StatusCode, new { message = "Upstream market data provider error." });
            }

            await using var stream = await response.Content.ReadAsStreamAsync();
            using var document = await JsonDocument.ParseAsync(stream);

            if (!document.RootElement.TryGetProperty("quoteResponse", out var quoteResponse) ||
                !quoteResponse.TryGetProperty("result", out var results) ||
                results.ValueKind != JsonValueKind.Array)
            {
                return StatusCode(502, new { message = "Unexpected market data response format." });
            }

            var items = new List<object>();
            foreach (var item in results.EnumerateArray())
            {
                items.Add(new
                {
                    symbol = ReadString(item, "symbol"),
                    name = ReadString(item, "shortName") ?? ReadString(item, "longName"),
                    price = ReadDecimal(item, "regularMarketPrice"),
                    change = ReadDecimal(item, "regularMarketChange"),
                    changePercent = ReadDecimal(item, "regularMarketChangePercent"),
                    currency = ReadString(item, "currency"),
                    marketState = ReadString(item, "marketState"),
                    exchange = ReadString(item, "fullExchangeName") ?? ReadString(item, "exchange"),
                    updatedAt = ReadLong(item, "regularMarketTime")
                });
            }

            return Ok(new
            {
                symbols = parsedSymbols,
                count = items.Count,
                data = items
            });
        }

        private static List<string> ParseSymbols(string? symbols)
        {
            if (string.IsNullOrWhiteSpace(symbols))
            {
                return [.. DefaultSymbols];
            }

            return symbols
                .Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
                .Select(s => s.ToUpperInvariant())
                .Where(IsSafeSymbol)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Take(25)
                .ToList();
        }

        private static bool IsSafeSymbol(string symbol)
        {
            if (symbol.Length is < 1 or > 15)
            {
                return false;
            }

            foreach (var ch in symbol)
            {
                if (!(char.IsLetterOrDigit(ch) || ch is '-' or '.' or '^'))
                {
                    return false;
                }
            }

            return true;
        }

        private static string? ReadString(JsonElement item, string property)
        {
            if (item.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String)
            {
                return value.GetString();
            }

            return null;
        }

        private static long? ReadLong(JsonElement item, string property)
        {
            if (!item.TryGetProperty(property, out var value))
            {
                return null;
            }

            if (value.ValueKind == JsonValueKind.Number && value.TryGetInt64(out var number))
            {
                return number;
            }

            return null;
        }

        private static decimal? ReadDecimal(JsonElement item, string property)
        {
            if (!item.TryGetProperty(property, out var value))
            {
                return null;
            }

            if (value.ValueKind == JsonValueKind.Number)
            {
                if (value.TryGetDecimal(out var decimalValue))
                {
                    return decimalValue;
                }

                if (value.TryGetDouble(out var doubleValue))
                {
                    return decimal.Parse(doubleValue.ToString(CultureInfo.InvariantCulture), CultureInfo.InvariantCulture);
                }
            }

            return null;
        }
    }
}
