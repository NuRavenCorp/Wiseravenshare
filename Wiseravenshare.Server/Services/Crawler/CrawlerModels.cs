using Wiseravenshare.Server.Entities.Crawler;

namespace Wiseravenshare.Server.Services.Crawler;

public interface IPageFetcher
{
    Task<FetchResult> FetchAsync(string url, FetchOptions options, CancellationToken ct = default);
}

public class FetchOptions
{
    public string UserAgent { get; set; } = "WiseRavenShare-Crawler/1.0";
    public TimeSpan Timeout { get; set; } = TimeSpan.FromSeconds(30);
    public bool FollowRedirects { get; set; } = true;
    public Dictionary<string, string>? Headers { get; set; }
}

public class FetchResult
{
    public string Url { get; set; } = string.Empty;
    public int StatusCode { get; set; }
    public string? Content { get; set; }
    public string? ContentType { get; set; }
    public long ContentLength { get; set; }
    public Dictionary<string, string> Headers { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public long ElapsedMs { get; set; }
}

public interface IHtmlParser
{
    ParsedHtml Parse(string html, string baseUrl);
}

public class ParsedHtml
{
    public string? Title { get; set; }
    public string? MetaDescription { get; set; }
    public string? MetaRobots { get; set; }
    public string? CanonicalUrl { get; set; }
    public bool HasViewportMeta { get; set; }
    public string? LangAttribute { get; set; }
    public string MainText { get; set; } = string.Empty;
    public int WordCount { get; set; }
    public bool RequiresJavaScript { get; set; }
    public List<HeadingInfo> Headings { get; set; } = [];
    public List<ImageInfo> Images { get; set; } = [];
    public List<LinkInfo> Links { get; set; } = [];
    public List<ScriptInfo> Scripts { get; set; } = [];
    public List<string> Stylesheets { get; set; } = [];
    public Dictionary<string, string> OpenGraphTags { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, string> TwitterCardTags { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public List<string> SchemaTypes { get; set; } = [];
    public List<FormInfo> Forms { get; set; } = [];
    public List<ButtonInfo> Buttons { get; set; } = [];
    public bool HasStructuredData { get; set; }
}

public record HeadingInfo(int Level, string Text);
public record ImageInfo(string Src, string? Alt, int? Width, int? Height, bool HasLazyLoading, string? Srcset);
public record LinkInfo(string Href, string Text, string Rel, bool IsExternal);
public record ScriptInfo(string? Src, bool IsAsync, bool IsDefer);
public record FormInfo(int InputCount, int LabelCount, bool HasAction);
public record ButtonInfo(string? Text, string? AriaLabel);

public interface IPageAnalyzer
{
    string Name { get; }
    IssueCategory Category { get; }
    Task<IEnumerable<CrawlIssue>> AnalyzeAsync(PageAnalysisContext context, CancellationToken ct);
}

public class PageAnalysisContext
{
    public CrawlJob Job { get; set; } = null!;
    public CrawledPage Page { get; set; } = null!;
    public ParsedHtml ParsedHtml { get; set; } = null!;
    public FetchResult Response { get; set; } = null!;
}

public class HealthScores
{
    public decimal Overall { get; set; }
    public decimal Seo { get; set; }
    public decimal Performance { get; set; }
    public decimal Accessibility { get; set; }
    public decimal Security { get; set; }
    public decimal Content { get; set; }
    public decimal Links { get; set; }
    public decimal AvgResponseTimeMs { get; set; }
}

public class BrowserRenderResult
{
    public int WordCount { get; set; }
    public string? ScreenshotUrl { get; set; }
    public string? MobileScreenshotUrl { get; set; }
}

public interface IJavaScriptRenderer
{
    Task<BrowserRenderResult?> RenderAsync(string url, CancellationToken ct = default);
}
