using Microsoft.Playwright;

namespace Wiseravenshare.Server.Services.Crawler;

public sealed class PlaywrightJavaScriptRenderer : IJavaScriptRenderer
{
    private readonly ILogger<PlaywrightJavaScriptRenderer> _logger;

    public PlaywrightJavaScriptRenderer(ILogger<PlaywrightJavaScriptRenderer> logger)
    {
        _logger = logger;
    }

    public async Task<BrowserRenderResult?> RenderAsync(string url, CancellationToken ct = default)
    {
        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(TimeSpan.FromSeconds(30));

            using var playwright = await Microsoft.Playwright.Playwright.CreateAsync();
            await using var browser = await playwright.Chromium.LaunchAsync(new BrowserTypeLaunchOptions
            {
                Headless = true
            });

            var page = await browser.NewPageAsync();
            await page.GotoAsync(url, new PageGotoOptions
            {
                WaitUntil = WaitUntilState.NetworkIdle,
                Timeout = 25_000
            });

            var text = await page.TextContentAsync("body");
            var words = string.IsNullOrWhiteSpace(text)
                ? 0
                : text.Split(' ', StringSplitOptions.RemoveEmptyEntries).Length;

            return new BrowserRenderResult
            {
                WordCount = words
            };
        }
        catch (PlaywrightException ex)
        {
            _logger.LogWarning(ex, "Playwright render failed for {Url}", url);
            return null;
        }
        catch (TaskCanceledException)
        {
            _logger.LogWarning("Playwright render timed out for {Url}", url);
            return null;
        }
    }
}
