using System.Text.RegularExpressions;
using HtmlAgilityPack;
using Microsoft.Extensions.Options;

namespace WiseRavenShare.Server.Application.Services.Assistant;

public interface IWebGroundingService
{
    Task<WebSnippet[]> SearchAsync(string query, int topN, CancellationToken ct = default);
}

public class WebGroundingOptions
{
    public string Provider { get; set; } = "brave";
    public string? ApiKey { get; set; }
    public string? Endpoint { get; set; }
    public bool ExtractPageContent { get; set; } = true;
    public int ExtractMaxChars { get; set; } = 2000;
}

public class WebGroundingService : IWebGroundingService
{
    private readonly HttpClient _http;
    private readonly WebGroundingOptions _opts;
    private readonly ILogger<WebGroundingService> _logger;

    public WebGroundingService(HttpClient http, IOptions<WebGroundingOptions> opts, ILogger<WebGroundingService> logger)
    {
        _http = http;
        _opts = opts.Value;
        _logger = logger;
    }

    public async Task<WebSnippet[]> SearchAsync(string query, int topN, CancellationToken ct = default)
    {
        try
        {
            var url = _opts.Provider.ToLowerInvariant() switch
            {
                "brave" => $"https://api.search.brave.com/res/v1/web/search?q={Uri.EscapeDataString(query)}&count={topN}",
                "bing" => $"https://api.bing.microsoft.com/v7.0/search?q={Uri.EscapeDataString(query)}&count={topN}",
                _ => $"https://serpapi.com/search.json?q={Uri.EscapeDataString(query)}&num={topN}&api_key={_opts.ApiKey}"
            };

            using var req = new HttpRequestMessage(HttpMethod.Get, url);
            if (_opts.Provider.Equals("brave", StringComparison.OrdinalIgnoreCase))
                req.Headers.Add("X-Subscription-Token", _opts.ApiKey);
            else if (_opts.Provider.Equals("bing", StringComparison.OrdinalIgnoreCase))
                req.Headers.Add("Ocp-Apim-Subscription-Key", _opts.ApiKey);

            using var resp = await _http.SendAsync(req, ct);
            resp.EnsureSuccessStatusCode();

            using var doc = await System.Text.Json.JsonDocument.ParseAsync(
                await resp.Content.ReadAsStreamAsync(ct), cancellationToken: ct);

            var snippets = ParseResults(doc.RootElement, _opts.Provider);
            return snippets.ToArray();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Web search failed for query {Query}", query);
            return Array.Empty<WebSnippet>();
        }
    }

    private static List<WebSnippet> ParseResults(System.Text.Json.JsonElement root, string provider)
    {
        var list = new List<WebSnippet>();
        try
        {
            if (provider == "brave")
            {
                foreach (var r in root.GetProperty("web").GetProperty("results").EnumerateArray())
                {
                    list.Add(new WebSnippet(
                        r.GetProperty("title").GetString() ?? "",
                        r.GetProperty("url").GetString() ?? "",
                        r.TryGetProperty("description", out var d) ? d.GetString() ?? "" : ""));
                }
            }
            else if (provider == "bing")
            {
                foreach (var r in root.GetProperty("webPages").GetProperty("value").EnumerateArray())
                {
                    list.Add(new WebSnippet(
                        r.GetProperty("name").GetString() ?? "",
                        r.GetProperty("url").GetString() ?? "",
                        r.TryGetProperty("snippet", out var s) ? s.GetString() ?? "" : ""));
                }
            }
            else
            {
                foreach (var r in root.GetProperty("organic_results").EnumerateArray())
                {
                    list.Add(new WebSnippet(
                        r.TryGetProperty("title", out var t) ? t.GetString() ?? "" : "",
                        r.TryGetProperty("link", out var l) ? l.GetString() ?? "" : "",
                        r.TryGetProperty("snippet", out var s) ? s.GetString() ?? "" : ""));
                }
            }
        }
        catch { /* malformed */ }
        return list;
    }
}
