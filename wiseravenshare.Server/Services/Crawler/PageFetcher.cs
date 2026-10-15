using System.Diagnostics;

namespace Wiseravenshare.Server.Services.Crawler;

public sealed class PageFetcher : IPageFetcher
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<PageFetcher> _logger;

    public PageFetcher(IHttpClientFactory httpClientFactory, ILogger<PageFetcher> logger)
    {
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    public async Task<FetchResult> FetchAsync(string url, FetchOptions options, CancellationToken ct = default)
    {
        var sw = Stopwatch.StartNew();
        var result = new FetchResult { Url = url };

        using var client = _httpClientFactory.CreateClient("SiteCrawlerClient");
        client.Timeout = options.Timeout;

        using var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.UserAgent.ParseAdd(options.UserAgent);
        request.Headers.Accept.ParseAdd("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
        request.Headers.AcceptEncoding.ParseAdd("gzip, deflate, br");
        request.Headers.AcceptLanguage.ParseAdd("en-US,en;q=0.9");

        if (options.Headers is { Count: > 0 })
        {
            foreach (var (key, value) in options.Headers)
            {
                request.Headers.TryAddWithoutValidation(key, value);
            }
        }

        try
        {
            using var response = await client.SendAsync(request, HttpCompletionOption.ResponseContentRead, ct);
            result.StatusCode = (int)response.StatusCode;
            result.ContentType = response.Content.Headers.ContentType?.MediaType;
            result.ContentLength = response.Content.Headers.ContentLength ?? 0;

            foreach (var header in response.Headers)
            {
                result.Headers[header.Key] = string.Join(", ", header.Value);
            }

            foreach (var header in response.Content.Headers)
            {
                result.Headers[header.Key] = string.Join(", ", header.Value);
            }

            if (ShouldReadBody(result.ContentType))
            {
                result.Content = await response.Content.ReadAsStringAsync(ct);
            }
        }
        catch (TaskCanceledException ex) when (!ct.IsCancellationRequested)
        {
            _logger.LogWarning(ex, "Request timed out for {Url}", url);
            result.StatusCode = 408;
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "Request failed for {Url}", url);
            result.StatusCode = (int?)ex.StatusCode ?? 0;
        }
        finally
        {
            sw.Stop();
            result.ElapsedMs = sw.ElapsedMilliseconds;
        }

        return result;
    }

    private static bool ShouldReadBody(string? contentType)
        => contentType?.StartsWith("text", StringComparison.OrdinalIgnoreCase) == true
           || contentType?.Contains("html", StringComparison.OrdinalIgnoreCase) == true
           || contentType?.Contains("xml", StringComparison.OrdinalIgnoreCase) == true
           || contentType?.Contains("json", StringComparison.OrdinalIgnoreCase) == true;
}
