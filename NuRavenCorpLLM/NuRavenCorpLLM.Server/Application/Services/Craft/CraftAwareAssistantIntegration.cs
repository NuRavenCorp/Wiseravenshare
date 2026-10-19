// Application/Services/Craft/CraftAwareAssistantIntegration.cs
using System.Text.RegularExpressions;
using NuRavenCorpLLM.Core.Interfaces.Repositories.Craft;

namespace NuRavenCorpLLM.Application.Services.Craft;

public interface ICraftAwareAssistantIntegration
{
    Task<string?> BuildCraftContextAsync(string userQuery, string? domainHint, CancellationToken ct = default);
    bool IsCraftQuery(string userQuery, out string? domainHint);
}

public class CraftAwareAssistantIntegration : ICraftAwareAssistantIntegration
{
    private static readonly Dictionary<string, string> KeywordMap = new(StringComparer.OrdinalIgnoreCase)
    {
        ["headline"] = "journalism",
        ["lede"] = "journalism",
        ["source"] = "journalism",
        ["invert pyramid"] = "journalism",
        ["fact-check"] = "journalism",
        ["hook"] = "content_creation",
        ["thumbnail"] = "content_creation",
        ["cta"] = "content_creation",
        ["segue"] = "radio",
        ["talkup"] = "radio",
        ["daypart"] = "radio",
        ["cold open"] = "podcast",
        ["episode"] = "podcast",
        ["retention"] = "podcast",
        ["b-roll"] = "videography",
        ["cut"] = "videography",
        ["color grade"] = "videography",
        ["shot list"] = "videography",
        ["composition"] = "photography",
        ["iso"] = "photography",
        ["aperture"] = "photography",
        ["golden hour"] = "photography",
        ["mix"] = "music_production",
        ["master"] = "music_production",
        ["sidechain"] = "music_production",
        ["onboarding"] = "community",
        ["moderation"] = "community",
        ["ritual"] = "community"
    };

    private readonly ICraftRetriever _retriever;
    private readonly ICraftDomainRepository _domains;

    public CraftAwareAssistantIntegration(ICraftRetriever retriever, ICraftDomainRepository domains)
    {
        _retriever = retriever; _domains = domains;
    }

    public bool IsCraftQuery(string userQuery, out string? domainHint)
    {
        domainHint = null;
        var lower = userQuery.ToLowerInvariant();

        foreach (var (kw, dom) in KeywordMap)
        {
            if (lower.Contains(kw)) { domainHint = dom; return true; }
        }

        // Generic craft intent
        var intentWords = new[] { "how do i", "how to", "best way", "tips for", "improve my",
            "review this", "critique", "craft", "technique", "style", "practice" };
        if (intentWords.Any(lower.Contains)) return true;

        return false;
    }

    public async Task<string?> BuildCraftContextAsync(string userQuery, string? domainHint, CancellationToken ct = default)
    {
        if (!IsCraftQuery(userQuery, out var detected)) return null;
        var domain = domainHint ?? detected ?? "content_creation";

        var principles = await _retriever.RetrievePrinciplesAsync(domain, userQuery, 6, ct);
        var insights = await _retriever.RetrieveInsightsAsync(userQuery, 4, ct);

        if (principles.Count == 0 && insights.Count == 0) return null;

        var sb = new System.Text.StringBuilder();
        sb.AppendLine($"[CRAFT CONTEXT — {domain}]");
        sb.AppendLine("Ground your answer in these master principles when relevant.");
        sb.AppendLine();
        foreach (var p in principles)
        {
            sb.AppendLine($"• [{p.Kind}] {p.Title} — {p.Body}");
        }
        if (insights.Count > 0)
        {
            sb.AppendLine();
            sb.AppendLine("[ADDITIONAL INSIGHTS]");
            foreach (var i in insights)
            {
                sb.AppendLine($"• {i.Title} — {i.Content} (source: {i.Source})");
            }
        }
        return sb.ToString();
    }
}
