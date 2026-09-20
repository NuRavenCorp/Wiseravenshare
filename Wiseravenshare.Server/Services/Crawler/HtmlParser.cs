using System.Net;
using System.Text.Json;
using HtmlAgilityPack;

namespace Wiseravenshare.Server.Services.Crawler;

public sealed class HtmlParser : IHtmlParser
{
    public ParsedHtml Parse(string html, string baseUrl)
    {
        var doc = new HtmlDocument();
        doc.LoadHtml(html);

        var result = new ParsedHtml();

        result.Title = doc.DocumentNode.SelectSingleNode("//title")?.InnerText?.Trim();
        var htmlNode = doc.DocumentNode.SelectSingleNode("//html");
        result.LangAttribute = htmlNode?.GetAttributeValue("lang", null);

        foreach (var meta in doc.DocumentNode.SelectNodes("//meta") ?? Enumerable.Empty<HtmlNode>())
        {
            var name = meta.GetAttributeValue("name", "").ToLowerInvariant();
            var property = meta.GetAttributeValue("property", "").ToLowerInvariant();
            var content = meta.GetAttributeValue("content", "");

            if (name == "description")
            {
                result.MetaDescription = content;
            }
            else if (name == "robots")
            {
                result.MetaRobots = content;
            }
            else if (name == "viewport")
            {
                result.HasViewportMeta = true;
            }

            if (property.StartsWith("og:", StringComparison.Ordinal))
            {
                result.OpenGraphTags[property] = content;
            }

            if (property.StartsWith("twitter:", StringComparison.Ordinal) || name.StartsWith("twitter:", StringComparison.Ordinal))
            {
                result.TwitterCardTags[string.IsNullOrWhiteSpace(property) ? name : property] = content;
            }
        }

        var canonical = doc.DocumentNode.SelectSingleNode("//link[@rel='canonical']");
        if (canonical is not null)
        {
            result.CanonicalUrl = canonical.GetAttributeValue("href", "");
        }

        foreach (var heading in doc.DocumentNode.SelectNodes("//h1|//h2|//h3|//h4|//h5|//h6") ?? Enumerable.Empty<HtmlNode>())
        {
            if (int.TryParse(heading.Name[1..], out var level))
            {
                result.Headings.Add(new HeadingInfo(level, heading.InnerText?.Trim() ?? string.Empty));
            }
        }

        foreach (var image in doc.DocumentNode.SelectNodes("//img") ?? Enumerable.Empty<HtmlNode>())
        {
            result.Images.Add(new ImageInfo(
                image.GetAttributeValue("src", ""),
                image.GetAttributeValue("alt", null),
                ParseInt(image.GetAttributeValue("width", null)),
                ParseInt(image.GetAttributeValue("height", null)),
                image.GetAttributeValue("loading", "").Equals("lazy", StringComparison.OrdinalIgnoreCase),
                image.GetAttributeValue("srcset", null)));
        }

        foreach (var anchor in doc.DocumentNode.SelectNodes("//a[@href]") ?? Enumerable.Empty<HtmlNode>())
        {
            var href = anchor.GetAttributeValue("href", "");
            result.Links.Add(new LinkInfo(
                href,
                anchor.InnerText?.Trim() ?? string.Empty,
                anchor.GetAttributeValue("rel", ""),
                IsExternal(href, baseUrl)));
        }

        foreach (var script in doc.DocumentNode.SelectNodes("//script") ?? Enumerable.Empty<HtmlNode>())
        {
            result.Scripts.Add(new ScriptInfo(
                script.GetAttributeValue("src", null),
                script.Attributes["async"] is not null,
                script.Attributes["defer"] is not null));
        }

        foreach (var stylesheet in doc.DocumentNode.SelectNodes("//link[@rel='stylesheet']") ?? Enumerable.Empty<HtmlNode>())
        {
            result.Stylesheets.Add(stylesheet.GetAttributeValue("href", ""));
        }

        foreach (var sd in doc.DocumentNode.SelectNodes("//script[@type='application/ld+json']") ?? Enumerable.Empty<HtmlNode>())
        {
            result.HasStructuredData = true;
            try
            {
                using var jsonDoc = JsonDocument.Parse(sd.InnerText);
                if (jsonDoc.RootElement.TryGetProperty("@type", out var typeElement))
                {
                    var type = typeElement.GetString();
                    if (!string.IsNullOrWhiteSpace(type))
                    {
                        result.SchemaTypes.Add(type);
                    }
                }
            }
            catch (JsonException)
            {
            }
        }

        foreach (var form in doc.DocumentNode.SelectNodes("//form") ?? Enumerable.Empty<HtmlNode>())
        {
            var inputs = form.SelectNodes(".//input|.//textarea|.//select")?.Count ?? 0;
            var labels = form.SelectNodes(".//label")?.Count ?? 0;
            var hasAction = !string.IsNullOrWhiteSpace(form.GetAttributeValue("action", ""));
            result.Forms.Add(new FormInfo(inputs, labels, hasAction));
        }

        foreach (var button in doc.DocumentNode.SelectNodes("//button") ?? Enumerable.Empty<HtmlNode>())
        {
            result.Buttons.Add(new ButtonInfo(button.InnerText?.Trim(), button.GetAttributeValue("aria-label", null)));
        }

        var body = doc.DocumentNode.SelectSingleNode("//body");
        if (body is not null)
        {
            foreach (var removable in (body.SelectNodes(".//script|.//style") ?? Enumerable.Empty<HtmlNode>()).ToList())
            {
                removable.Remove();
            }

            result.MainText = System.Text.RegularExpressions.Regex.Replace(
                WebUtility.HtmlDecode(body.InnerText), @"\s+", " ").Trim();
            result.WordCount = result.MainText.Split(' ', StringSplitOptions.RemoveEmptyEntries).Length;
            result.RequiresJavaScript = result.WordCount < 100 && result.Scripts.Count > 3;
        }

        return result;
    }

    private static int? ParseInt(string? value)
        => int.TryParse(value, out var parsed) ? parsed : null;

    private static bool IsExternal(string href, string baseUrl)
    {
        if (string.IsNullOrWhiteSpace(href) || href.StartsWith('#') || href.StartsWith('/') || href.StartsWith('?'))
        {
            return false;
        }

        if (!Uri.TryCreate(href, UriKind.Absolute, out var uri))
        {
            return false;
        }

        if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out var baseUri))
        {
            return false;
        }

        return !string.Equals(uri.Host, baseUri.Host, StringComparison.OrdinalIgnoreCase);
    }
}
