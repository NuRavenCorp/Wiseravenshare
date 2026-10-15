using Microsoft.Extensions.Options;
using Wiseravenshare.Server.Entities.Crawler;

namespace Wiseravenshare.Server.Services.Crawler;

internal static class IssueFactory
{
    public static CrawlIssue Create(
        IssueCategory category,
        IssueType type,
        IssueSeverity severity,
        string code,
        string title,
        string description,
        string recommendation,
        int priority,
        string? evidence = null)
        => new()
        {
            Category = category,
            Type = type,
            Severity = severity,
            Code = code,
            Title = title,
            Description = description,
            Recommendation = recommendation,
            Priority = priority,
            Evidence = evidence
        };
}

public sealed class SeoAnalyzer : IPageAnalyzer
{
    public string Name => "SEO Analyzer";
    public IssueCategory Category => IssueCategory.Seo;

    public Task<IEnumerable<CrawlIssue>> AnalyzeAsync(PageAnalysisContext ctx, CancellationToken ct)
    {
        var issues = new List<CrawlIssue>();
        var page = ctx.Page;

        if (string.IsNullOrWhiteSpace(page.Title))
        {
            issues.Add(IssueFactory.Create(Category, IssueType.MissingTitle, IssueSeverity.High, "MISSING_TITLE",
                "Page is missing a title tag",
                "The <title> tag is essential for SEO and click-through rate.",
                "Add a unique title between 50 and 60 characters.", 90));
        }
        else if (page.Title.Length > 60)
        {
            issues.Add(IssueFactory.Create(Category, IssueType.TitleTooLong, IssueSeverity.Low, "TITLE_TOO_LONG",
                $"Title is {page.Title.Length} characters",
                "Titles over 60 characters are often truncated.",
                "Keep titles between 50 and 60 characters.", 40));
        }
        else if (page.Title.Length < 30)
        {
            issues.Add(IssueFactory.Create(Category, IssueType.TitleTooShort, IssueSeverity.Low, "TITLE_TOO_SHORT",
                $"Title is {page.Title.Length} characters",
                "Very short titles often miss important keywords.",
                "Expand the title with specific intent and keywords.", 40));
        }

        if (string.IsNullOrWhiteSpace(page.MetaDescription))
        {
            issues.Add(IssueFactory.Create(Category, IssueType.MissingMetaDescription, IssueSeverity.Medium, "MISSING_META_DESCRIPTION",
                "Page is missing a meta description",
                "Search snippets depend on clear meta descriptions.",
                "Add a unique description with 150-160 characters.", 70));
        }
        else if (page.MetaDescription.Length > 160)
        {
            issues.Add(IssueFactory.Create(Category, IssueType.MetaDescriptionTooLong, IssueSeverity.Low, "META_DESCRIPTION_TOO_LONG",
                $"Meta description is {page.MetaDescription.Length} characters",
                "Long descriptions are truncated by search engines.",
                "Keep descriptions under 160 characters.", 40));
        }

        if (!page.HasH1)
        {
            issues.Add(IssueFactory.Create(Category, IssueType.MissingH1, IssueSeverity.High, "MISSING_H1",
                "Page has no H1 heading",
                "A clear H1 helps search engines and users understand page purpose.",
                "Add exactly one H1 heading.", 85));
        }
        else if (page.H1Count > 1)
        {
            issues.Add(IssueFactory.Create(Category, IssueType.MultipleH1, IssueSeverity.Medium, "MULTIPLE_H1",
                $"Page has {page.H1Count} H1 headings",
                "Multiple H1 headings reduce semantic clarity.",
                "Use a single primary H1.", 60));
        }

        var previous = 0;
        foreach (var heading in ctx.ParsedHtml.Headings)
        {
            if (previous > 0 && heading.Level > previous + 1)
            {
                issues.Add(IssueFactory.Create(Category, IssueType.SkippedHeadingLevels, IssueSeverity.Low, "SKIPPED_HEADING",
                    $"Heading level skipped: H{previous} -> H{heading.Level}",
                    "Skipped heading levels weaken semantic structure.",
                    "Use heading levels sequentially.", 30));
                break;
            }

            previous = heading.Level;
        }

        if (!page.HasCanonical)
        {
            issues.Add(IssueFactory.Create(Category, IssueType.MissingCanonical, IssueSeverity.Medium, "MISSING_CANONICAL",
                "Page is missing a canonical URL",
                "Canonical tags help consolidate ranking signals.",
                "Add a canonical link to the preferred URL.", 55));
        }

        if (!page.HasViewportMeta)
        {
            issues.Add(IssueFactory.Create(Category, IssueType.MissingViewport, IssueSeverity.High, "MISSING_VIEWPORT",
                "Page is missing viewport meta",
                "Viewport metadata is required for proper mobile rendering.",
                "Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">.", 90));
        }

        if (!page.HasOpenGraph)
        {
            issues.Add(IssueFactory.Create(Category, IssueType.MissingOpenGraph, IssueSeverity.Low, "MISSING_OPEN_GRAPH",
                "Page is missing Open Graph tags",
                "Open Graph controls social sharing previews.",
                "Add og:title, og:description, og:image, and og:url.", 35));
        }

        if (!page.HasTwitterCard)
        {
            issues.Add(IssueFactory.Create(Category, IssueType.MissingTwitterCard, IssueSeverity.Low, "MISSING_TWITTER_CARD",
                "Page is missing Twitter card tags",
                "Twitter cards improve social visibility.",
                "Add twitter:card, twitter:title, twitter:description, and twitter:image.", 30));
        }

        return Task.FromResult<IEnumerable<CrawlIssue>>(issues);
    }
}

public sealed class PerformanceAnalyzer : IPageAnalyzer
{
    private readonly PerformanceAnalyzerOptions _options;
    public string Name => "Performance Analyzer";
    public IssueCategory Category => IssueCategory.Performance;

    public PerformanceAnalyzer(IOptions<PerformanceAnalyzerOptions> options)
    {
        _options = options.Value;
    }

    public Task<IEnumerable<CrawlIssue>> AnalyzeAsync(PageAnalysisContext ctx, CancellationToken ct)
    {
        var issues = new List<CrawlIssue>();
        var page = ctx.Page;

        if (page.ResponseTimeMs > _options.SlowResponseThresholdMs)
        {
            var severity = page.ResponseTimeMs > 3000 ? IssueSeverity.High : IssueSeverity.Medium;
            issues.Add(IssueFactory.Create(Category, IssueType.SlowResponseTime, severity, "SLOW_RESPONSE",
                $"Slow server response: {page.ResponseTimeMs} ms",
                "Slow responses increase bounce rates and reduce crawl efficiency.",
                "Optimize server-side render path and enable edge caching.", severity == IssueSeverity.High ? 80 : 50));
        }

        if (page.ContentSizeBytes > _options.LargePageSizeBytes)
        {
            issues.Add(IssueFactory.Create(Category, IssueType.LargePageSize, IssueSeverity.Medium, "LARGE_PAGE_SIZE",
                $"Large HTML payload: {page.ContentSizeBytes / 1024} KB",
                "Large payloads slow down initial page render.",
                "Reduce HTML size and defer non-critical content.", 55));
        }

        var encoding = ctx.Response.Headers.GetValueOrDefault("Content-Encoding", "");
        if (string.IsNullOrWhiteSpace(encoding) && page.ContentSizeBytes > 50_000)
        {
            issues.Add(IssueFactory.Create(Category, IssueType.MissingCompression, IssueSeverity.Medium, "MISSING_COMPRESSION",
                "Response is not compressed",
                "Uncompressed HTML increases transfer time.",
                "Enable gzip or brotli compression.", 65));
        }

        if (string.IsNullOrWhiteSpace(ctx.Response.Headers.GetValueOrDefault("Cache-Control", "")))
        {
            issues.Add(IssueFactory.Create(Category, IssueType.NoCaching, IssueSeverity.Low, "MISSING_CACHE_CONTROL",
                "No Cache-Control header",
                "Caching directives are required for predictable browser/CDN behavior.",
                "Add Cache-Control with explicit max-age policy.", 35));
        }

        if (ctx.ParsedHtml.Stylesheets.Count > 5)
        {
            issues.Add(IssueFactory.Create(Category, IssueType.RenderBlockingResources, IssueSeverity.Medium, "RENDER_BLOCKING_CSS",
                $"{ctx.ParsedHtml.Stylesheets.Count} render-blocking stylesheets",
                "Too many render-blocking stylesheets delay first paint.",
                "Inline critical CSS and lazy-load non-critical styles.", 60));
        }

        var blockingJs = ctx.ParsedHtml.Scripts.Count(s => !s.IsAsync && !s.IsDefer && !string.IsNullOrWhiteSpace(s.Src));
        if (blockingJs > 0)
        {
            issues.Add(IssueFactory.Create(Category, IssueType.RenderBlockingResources, IssueSeverity.Medium, "RENDER_BLOCKING_JS",
                $"{blockingJs} render-blocking scripts",
                "Synchronous scripts block parsing and rendering.",
                "Use defer or async for non-critical scripts.", 60));
        }

        var domNodeEstimate = System.Text.RegularExpressions.Regex.Matches(ctx.Response.Content ?? string.Empty, "<[a-zA-Z]").Count;
        if (domNodeEstimate > _options.LargeDomThreshold)
        {
            issues.Add(IssueFactory.Create(Category, IssueType.ExcessiveDomSize, IssueSeverity.Low, "LARGE_DOM",
                "DOM size is very large",
                "Large DOM trees degrade runtime performance and interactivity.",
                "Simplify nested markup and virtualize long lists.", 40));
        }

        var nonModern = ctx.ParsedHtml.Images.Count(i =>
            !i.Src.EndsWith(".webp", StringComparison.OrdinalIgnoreCase) &&
            !i.Src.EndsWith(".avif", StringComparison.OrdinalIgnoreCase));
        if (ctx.ParsedHtml.Images.Count > 3 && nonModern > 0)
        {
            issues.Add(IssueFactory.Create(Category, IssueType.UncompressedImages, IssueSeverity.Low, "IMAGE_FORMAT",
                $"{nonModern} images not using next-gen formats",
                "WebP/AVIF formats are significantly smaller than legacy formats.",
                "Serve responsive WebP/AVIF variants.", 35));
        }

        return Task.FromResult<IEnumerable<CrawlIssue>>(issues);
    }
}

public sealed class AccessibilityAnalyzer : IPageAnalyzer
{
    public string Name => "Accessibility Analyzer";
    public IssueCategory Category => IssueCategory.Accessibility;

    public Task<IEnumerable<CrawlIssue>> AnalyzeAsync(PageAnalysisContext ctx, CancellationToken ct)
    {
        var issues = new List<CrawlIssue>();

        var missingAlt = ctx.ParsedHtml.Images.Count(i => string.IsNullOrWhiteSpace(i.Alt));
        if (missingAlt > 0)
        {
            issues.Add(IssueFactory.Create(Category, IssueType.MissingAltText, IssueSeverity.High, "MISSING_ALT",
                $"{missingAlt} image(s) without alt text",
                "Alternative text is required for screen readers.",
                "Provide descriptive alt text or empty alt for decorative images.", 85));
        }

        if (string.IsNullOrWhiteSpace(ctx.ParsedHtml.LangAttribute))
        {
            issues.Add(IssueFactory.Create(Category, IssueType.MissingLangAttribute, IssueSeverity.Medium, "MISSING_LANG",
                "Page has no lang attribute on <html>",
                "Language metadata helps assistive technologies.",
                "Set html lang attribute to the page language.", 60));
        }

        var emptyButtons = ctx.ParsedHtml.Buttons.Count(b => string.IsNullOrWhiteSpace(b.Text) && string.IsNullOrWhiteSpace(b.AriaLabel));
        if (emptyButtons > 0)
        {
            issues.Add(IssueFactory.Create(Category, IssueType.EmptyButtons, IssueSeverity.High, "EMPTY_BUTTONS",
                $"{emptyButtons} button(s) without accessible name",
                "Buttons need text or aria-label to be announced correctly.",
                "Add visible text or aria-label to each button.", 80));
        }

        if (ctx.ParsedHtml.Forms.Any(form => form.InputCount > 0 && form.LabelCount == 0))
        {
            issues.Add(IssueFactory.Create(Category, IssueType.MissingFormLabels, IssueSeverity.High, "MISSING_FORM_LABELS",
                "Form inputs without labels",
                "Unlabeled form controls are not accessible.",
                "Associate every input/select/textarea with a label.", 80));
        }

        return Task.FromResult<IEnumerable<CrawlIssue>>(issues);
    }
}

public sealed class SecurityAnalyzer : IPageAnalyzer
{
    public string Name => "Security Analyzer";
    public IssueCategory Category => IssueCategory.Security;

    public Task<IEnumerable<CrawlIssue>> AnalyzeAsync(PageAnalysisContext ctx, CancellationToken ct)
    {
        var issues = new List<CrawlIssue>();
        var headers = ctx.Response.Headers;

        if (!ctx.Page.Url.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
        {
            issues.Add(IssueFactory.Create(Category, IssueType.MissingHttps, IssueSeverity.Critical, "MISSING_HTTPS",
                "Page is served over HTTP",
                "Unencrypted traffic can be intercepted.",
                "Redirect all HTTP traffic to HTTPS and enforce TLS.", 100));
        }

        ValidateHeader(headers, "Strict-Transport-Security", issues, "MISSING_HSTS", "Missing HSTS header", 60);
        ValidateHeader(headers, "X-Content-Type-Options", issues, "MISSING_XCTO", "Missing X-Content-Type-Options header", 50);
        ValidateHeader(headers, "X-Frame-Options", issues, "MISSING_XFO", "Missing X-Frame-Options header", 50);

        if (string.IsNullOrWhiteSpace(headers.GetValueOrDefault("Content-Security-Policy", "")))
        {
            issues.Add(IssueFactory.Create(Category, IssueType.MissingSecurityHeaders, IssueSeverity.High, "MISSING_CSP",
                "Missing Content-Security-Policy header",
                "CSP protects against XSS and code injection.",
                "Add a strict Content-Security-Policy tailored to site resources.", 75));
        }

        if (!string.IsNullOrWhiteSpace(headers.GetValueOrDefault("Server", "")))
        {
            issues.Add(IssueFactory.Create(Category, IssueType.ExposedServerInfo, IssueSeverity.Low, "EXPOSED_SERVER",
                "Server header exposes server details",
                "Server technology disclosure increases reconnaissance risk.",
                "Suppress or generalize Server response headers.", 30));
        }

        if (!string.IsNullOrWhiteSpace(headers.GetValueOrDefault("X-Powered-By", "")))
        {
            issues.Add(IssueFactory.Create(Category, IssueType.ExposedServerInfo, IssueSeverity.Low, "EXPOSED_POWERED_BY",
                "X-Powered-By header exposes framework details",
                "Technology disclosure can aid targeted attacks.",
                "Remove X-Powered-By response headers.", 30));
        }

        if (ctx.Page.Url.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
        {
            var mixed = System.Text.RegularExpressions.Regex.Matches(
                ctx.Response.Content ?? string.Empty,
                "(src|href)=[\"']http://[^\"']+[\"']",
                System.Text.RegularExpressions.RegexOptions.IgnoreCase).Count;
            if (mixed > 0)
            {
                issues.Add(IssueFactory.Create(Category, IssueType.MixedContent, IssueSeverity.High, "MIXED_CONTENT",
                    $"{mixed} insecure resource(s) referenced",
                    "Mixed content can be blocked and weakens transport security.",
                    "Use HTTPS for all resource references.", 75));
            }
        }

        return Task.FromResult<IEnumerable<CrawlIssue>>(issues);
    }

    private static void ValidateHeader(IDictionary<string, string> headers, string name, List<CrawlIssue> issues, string code, string title, int priority)
    {
        if (!headers.ContainsKey(name))
        {
            issues.Add(IssueFactory.Create(IssueCategory.Security, IssueType.MissingSecurityHeaders, IssueSeverity.Medium, code,
                title, $"Missing required security header: {name}.", $"Add {name} header to responses.", priority));
        }
    }
}

public sealed class ContentAnalyzer : IPageAnalyzer
{
    public string Name => "Content Analyzer";
    public IssueCategory Category => IssueCategory.Content;

    public Task<IEnumerable<CrawlIssue>> AnalyzeAsync(PageAnalysisContext ctx, CancellationToken ct)
    {
        var issues = new List<CrawlIssue>();

        if (ctx.Page.WordCount < 300)
        {
            var severity = ctx.Page.WordCount < 150 ? IssueSeverity.Medium : IssueSeverity.Low;
            issues.Add(IssueFactory.Create(Category, IssueType.ThinContent, severity, "THIN_CONTENT",
                $"Thin content: {ctx.Page.WordCount} words",
                "Pages with little text often underperform in search and user satisfaction.",
                "Expand content with substantial, relevant copy.", severity == IssueSeverity.Medium ? 55 : 35));
        }

        var placeholder = System.Text.RegularExpressions.Regex.IsMatch(
            ctx.ParsedHtml.MainText, @"\b(lorem ipsum|todo|placeholder|coming soon)\b",
            System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        if (placeholder)
        {
            issues.Add(IssueFactory.Create(Category, IssueType.PlaceholderContent, IssueSeverity.High, "PLACEHOLDER_CONTENT",
                "Page contains placeholder text",
                "Placeholder content hurts credibility and discoverability.",
                "Replace placeholders with production content.", 80));
        }

        var brokenImages = ctx.ParsedHtml.Images.Count(i => string.IsNullOrWhiteSpace(i.Src));
        if (brokenImages > 0)
        {
            issues.Add(IssueFactory.Create(Category, IssueType.BrokenImage, IssueSeverity.Medium, "BROKEN_IMAGE",
                $"{brokenImages} image(s) with empty src",
                "Images without valid src fail to render.",
                "Fix source URLs or remove invalid image tags.", 55));
        }

        return Task.FromResult<IEnumerable<CrawlIssue>>(issues);
    }
}

public sealed class LinkAnalyzer : IPageAnalyzer
{
    private readonly IPageFetcher _fetcher;
    public string Name => "Link Analyzer";
    public IssueCategory Category => IssueCategory.Links;

    public LinkAnalyzer(IPageFetcher fetcher)
    {
        _fetcher = fetcher;
    }

    public async Task<IEnumerable<CrawlIssue>> AnalyzeAsync(PageAnalysisContext ctx, CancellationToken ct)
    {
        var issues = new List<CrawlIssue>();
        var sampleExternalLinks = ctx.ParsedHtml.Links.Where(link => link.IsExternal).Take(5).ToList();

        foreach (var link in sampleExternalLinks)
        {
            try
            {
                var response = await _fetcher.FetchAsync(link.Href, new FetchOptions { Timeout = TimeSpan.FromSeconds(5) }, ct);
                if (response.StatusCode >= 400)
                {
                    issues.Add(IssueFactory.Create(Category, IssueType.BrokenExternalLink, IssueSeverity.Medium, "BROKEN_EXTERNAL_LINK",
                        $"Broken external link ({response.StatusCode})",
                        $"External URL returned HTTP {response.StatusCode}.",
                        "Update or remove the broken external link.", 50, link.Href));
                }
            }
            catch (HttpRequestException)
            {
                issues.Add(IssueFactory.Create(Category, IssueType.BrokenExternalLink, IssueSeverity.Medium, "BROKEN_EXTERNAL_LINK",
                    "External link request failed",
                    "External URL could not be reached during crawl.",
                    "Validate external link availability and update if needed.", 50, link.Href));
            }
            catch (TaskCanceledException)
            {
                issues.Add(IssueFactory.Create(Category, IssueType.BrokenExternalLink, IssueSeverity.Low, "EXTERNAL_LINK_TIMEOUT",
                    "External link timed out",
                    "External URL timed out during check.",
                    "Review external link reliability.", 30, link.Href));
            }
        }

        var emptyAnchors = ctx.ParsedHtml.Links.Count(link =>
            string.IsNullOrWhiteSpace(link.Text) && !link.Href.Contains("image", StringComparison.OrdinalIgnoreCase));
        if (emptyAnchors > 3)
        {
            issues.Add(IssueFactory.Create(Category, IssueType.BrokenInternalLink, IssueSeverity.Low, "EMPTY_ANCHOR",
                $"{emptyAnchors} links without anchor text",
                "Anchor text helps users and search engines understand destination context.",
                "Use descriptive anchor text.", 30));
        }

        return issues;
    }
}

public sealed class MobileAnalyzer : IPageAnalyzer
{
    public string Name => "Mobile Analyzer";
    public IssueCategory Category => IssueCategory.Mobile;

    public Task<IEnumerable<CrawlIssue>> AnalyzeAsync(PageAnalysisContext ctx, CancellationToken ct)
    {
        var issues = new List<CrawlIssue>();

        if (!ctx.Page.HasViewportMeta)
        {
            issues.Add(IssueFactory.Create(Category, IssueType.NotMobileFriendly, IssueSeverity.High, "NOT_MOBILE_FRIENDLY",
                "Page is not configured for mobile viewports",
                "Without viewport metadata, mobile layout scaling is unreliable.",
                "Add a responsive viewport meta tag.", 85));
        }

        var fixedWidths = System.Text.RegularExpressions.Regex.Matches(ctx.Response.Content ?? string.Empty, @"width\s*:\s*(\d{4,})px").Count;
        if (fixedWidths > 0)
        {
            issues.Add(IssueFactory.Create(Category, IssueType.HorizontalScroll, IssueSeverity.Medium, "FIXED_WIDTH",
                $"{fixedWidths} fixed-width element(s) detected",
                "Large fixed widths can cause horizontal scrolling on small screens.",
                "Use responsive units like %, rem, and vw.", 55));
        }

        return Task.FromResult<IEnumerable<CrawlIssue>>(issues);
    }
}

public sealed class StructuredDataAnalyzer : IPageAnalyzer
{
    public string Name => "Structured Data Analyzer";
    public IssueCategory Category => IssueCategory.StructuredData;

    public Task<IEnumerable<CrawlIssue>> AnalyzeAsync(PageAnalysisContext ctx, CancellationToken ct)
    {
        if (ctx.ParsedHtml.HasStructuredData)
        {
            return Task.FromResult<IEnumerable<CrawlIssue>>([]);
        }

        var issue = IssueFactory.Create(Category, IssueType.MissingSchema, IssueSeverity.Low, "MISSING_SCHEMA",
            "Page has no structured data",
            "Structured data enables rich results in search engines.",
            "Add JSON-LD schema relevant to page type.", 35);
        return Task.FromResult<IEnumerable<CrawlIssue>>([issue]);
    }
}

public sealed class BestPracticesAnalyzer : IPageAnalyzer
{
    public string Name => "Best Practices Analyzer";
    public IssueCategory Category => IssueCategory.BestPractices;

    public Task<IEnumerable<CrawlIssue>> AnalyzeAsync(PageAnalysisContext ctx, CancellationToken ct)
    {
        var issues = new List<CrawlIssue>();
        var content = ctx.Response.Content ?? string.Empty;

        var hasFavicon = System.Text.RegularExpressions.Regex.IsMatch(
            content,
            "<link[^>]+rel=[\"'](?:shortcut )?icon[\"']",
            System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        if (!hasFavicon)
        {
            issues.Add(IssueFactory.Create(Category, IssueType.MissingFavicon, IssueSeverity.Low, "MISSING_FAVICON",
                "Page has no favicon link",
                "Favicons improve brand recognition in tabs and bookmarks.",
                "Add <link rel=\"icon\" href=\"/favicon.ico\">.", 25));
        }

        if (System.Text.RegularExpressions.Regex.IsMatch(content, "<center|<font|<marquee", System.Text.RegularExpressions.RegexOptions.IgnoreCase))
        {
            issues.Add(IssueFactory.Create(Category, IssueType.DeprecatedHtml, IssueSeverity.Low, "DEPRECATED_HTML",
                "Deprecated HTML tags found",
                "Deprecated tags are obsolete and can cause inconsistent rendering.",
                "Replace deprecated tags with semantic HTML and CSS.", 25));
        }

        return Task.FromResult<IEnumerable<CrawlIssue>>(issues);
    }
}
