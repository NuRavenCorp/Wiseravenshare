namespace Wiseravenshare.Server.Services.Crawler;

public sealed class NoOpJavaScriptRenderer : IJavaScriptRenderer
{
    public Task<BrowserRenderResult?> RenderAsync(string url, CancellationToken ct = default)
        => Task.FromResult<BrowserRenderResult?>(null);
}
