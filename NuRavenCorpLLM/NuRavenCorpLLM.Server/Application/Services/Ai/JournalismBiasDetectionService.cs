using System.Text;
using System.Text.Json;
using NuRavenCorpLLM.Entities.Ai.DataSources;
using NuRavenCorpLLM.Services;

namespace NuRavenCorpLLM.Application.Services.Ai;

public interface IJournalismBiasDetectionService
{
    Task<JournalismBiasAssessment> AnalyzeAsync(
        string prompt,
        RoutedIntent route,
        IReadOnlyCollection<DataResult> results,
        CancellationToken ct = default);
}

public sealed class JournalismBiasAssessment
{
    public bool Applied { get; set; }
    public string Target { get; set; } = "amateur_journalism_feed";
    public string RiskLevel { get; set; } = "none";
    public double BiasScore { get; set; }
    public double PrejudiceScore { get; set; }
    public int AffirmationTally { get; set; }
    public int FlaggedItems { get; set; }
    public List<string> Reasons { get; set; } = new();
    public List<string> FlaggedSnippets { get; set; } = new();
    public string Summary { get; set; } = "No journalism bias scan executed.";
}

public sealed class JournalismBiasDetectionService : IJournalismBiasDetectionService
{
    private static readonly string[] JournalismKeywords =
    [
        "journalism", "journalist", "news", "report", "headline", "source", "fact-check", "amateur"
    ];

    private static readonly string[] BiasCueLexicon =
    [
        "obviously", "clearly", "always", "never", "everyone knows", "all of them", "none of them"
    ];

    private static readonly string[] PrejudiceCueLexicon =
    [
        "those people", "their kind", "inferior", "subhuman", "vermin", "illegal alien"
    ];

    private readonly ILlmGateway _llm;
    private readonly ILogger<JournalismBiasDetectionService> _logger;

    public JournalismBiasDetectionService(
        ILlmGateway llm,
        ILogger<JournalismBiasDetectionService> logger)
    {
        _llm = llm;
        _logger = logger;
    }

    public async Task<JournalismBiasAssessment> AnalyzeAsync(
        string prompt,
        RoutedIntent route,
        IReadOnlyCollection<DataResult> results,
        CancellationToken ct = default)
    {
        if (!ShouldApply(prompt, route))
        {
            return new JournalismBiasAssessment
            {
                Applied = false,
                Summary = "Skipped: request does not target the amateur journalism feed."
            };
        }

        var snippets = BuildSnippets(results);
        var affirmationTally = CalculateAffirmationTally(results);

        if (snippets.Count == 0)
        {
            return new JournalismBiasAssessment
            {
                Applied = true,
                AffirmationTally = affirmationTally,
                Summary = "Applied with no content snippets available for scoring."
            };
        }

        var heuristic = RunHeuristic(snippets, affirmationTally);

        try
        {
            var llmAssessment = await AnalyzeWithLlmAsync(prompt, snippets, affirmationTally, ct);
            if (llmAssessment is not null)
            {
                llmAssessment.Applied = true;
                llmAssessment.AffirmationTally = affirmationTally;
                llmAssessment.Target = "amateur_journalism_feed";
                return llmAssessment;
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Bias detection LLM pass failed; using heuristic fallback.");
        }

        heuristic.Applied = true;
        heuristic.Target = "amateur_journalism_feed";
        return heuristic;
    }

    private static bool ShouldApply(string prompt, RoutedIntent route)
    {
        var includesPosts = route.Sources.Any(x => string.Equals(x, "posts", StringComparison.OrdinalIgnoreCase));
        if (!includesPosts)
        {
            return false;
        }

        var lower = (prompt ?? string.Empty).ToLowerInvariant();
        return JournalismKeywords.Any(k => lower.Contains(k, StringComparison.OrdinalIgnoreCase));
    }

    private static List<string> BuildSnippets(IReadOnlyCollection<DataResult> results)
    {
        var snippets = new List<string>();
        foreach (var result in results)
        {
            foreach (var row in result.Rows.Take(40))
            {
                var candidate = ExtractRowText(row);
                if (!string.IsNullOrWhiteSpace(candidate))
                {
                    snippets.Add(candidate.Trim());
                }
            }
        }

        return snippets
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(80)
            .ToList();
    }

    private static string ExtractRowText(Dictionary<string, object> row)
    {
        var preferredKeys = new[] { "headline", "title", "name", "content", "summary", "body", "text", "caption" };
        foreach (var key in preferredKeys)
        {
            if (row.TryGetValue(key, out var value) && value is not null)
            {
                var text = value.ToString();
                if (!string.IsNullOrWhiteSpace(text))
                {
                    return text;
                }
            }
        }

        var merged = string.Join(" | ", row.Select(kv => $"{kv.Key}:{kv.Value}"));
        return merged.Length > 500 ? merged[..500] : merged;
    }

    private static int CalculateAffirmationTally(IReadOnlyCollection<DataResult> results)
    {
        var total = 0;
        foreach (var row in results.SelectMany(r => r.Rows))
        {
            total += ReadInt(row, "likes");
            total += ReadInt(row, "comments");
            total += ReadInt(row, "reposts");
            total += ReadInt(row, "shares");
            total += ReadInt(row, "bookmarks");
            total += ReadInt(row, "affirmations");
        }

        return total;
    }

    private static int ReadInt(Dictionary<string, object> row, string key)
    {
        if (!row.TryGetValue(key, out var value) || value is null) return 0;
        if (value is int i) return i;
        if (value is long l) return (int)Math.Clamp(l, int.MinValue, int.MaxValue);
        if (value is decimal d) return (int)d;
        if (value is double dbl) return (int)dbl;
        return int.TryParse(value.ToString(), out var parsed) ? parsed : 0;
    }

    private static JournalismBiasAssessment RunHeuristic(IReadOnlyCollection<string> snippets, int affirmationTally)
    {
        var flagged = new List<string>();
        var reasons = new List<string>();
        var biasHits = 0;
        var prejudiceHits = 0;

        foreach (var snippet in snippets)
        {
            var lower = snippet.ToLowerInvariant();
            var hasBias = BiasCueLexicon.Any(cue => lower.Contains(cue, StringComparison.OrdinalIgnoreCase));
            var hasPrejudice = PrejudiceCueLexicon.Any(cue => lower.Contains(cue, StringComparison.OrdinalIgnoreCase));

            if (hasBias || hasPrejudice)
            {
                flagged.Add(snippet.Length > 240 ? $"{snippet[..240]}..." : snippet);
            }
            if (hasBias) biasHits++;
            if (hasPrejudice) prejudiceHits++;
        }

        var count = Math.Max(1, snippets.Count);
        var biasScore = Math.Clamp((double)biasHits / count, 0d, 1d);
        var prejudiceScore = Math.Clamp((double)prejudiceHits / count, 0d, 1d);

        if (biasHits > 0) reasons.Add("Detected absolutist or over-generalized framing cues.");
        if (prejudiceHits > 0) reasons.Add("Detected potential group-targeting or demeaning language cues.");
        if (affirmationTally > 0) reasons.Add($"Affirmations tallied across sampled feed items: {affirmationTally}.");

        var risk = prejudiceScore >= 0.35 || biasScore >= 0.55
            ? "high"
            : prejudiceScore >= 0.15 || biasScore >= 0.3
                ? "medium"
                : "low";

        return new JournalismBiasAssessment
        {
            Applied = true,
            RiskLevel = risk,
            BiasScore = Math.Round(biasScore, 3),
            PrejudiceScore = Math.Round(prejudiceScore, 3),
            FlaggedItems = flagged.Count,
            Reasons = reasons,
            FlaggedSnippets = flagged.Take(8).ToList(),
            AffirmationTally = affirmationTally,
            Summary = $"Heuristic scan complete: {flagged.Count} flagged item(s), risk={risk}."
        };
    }

    private async Task<JournalismBiasAssessment?> AnalyzeWithLlmAsync(
        string prompt,
        IReadOnlyCollection<string> snippets,
        int affirmationTally,
        CancellationToken ct)
    {
        var content = new StringBuilder();
        content.AppendLine($"Prompt: {prompt}");
        content.AppendLine($"Affirmation tally: {affirmationTally}");
        content.AppendLine("Sampled feed snippets:");
        foreach (var snippet in snippets.Take(25))
        {
            content.AppendLine($"- {snippet}");
        }

        var response = await _llm.CompleteAsync(new LlmRequest
        {
            JsonMode = true,
            Temperature = 0.1,
            MaxTokens = 600,
            SystemPrompt = """
You are a bias and prejudice detection layer for an amateur journalism feed.
Evaluate text snippets and return strict JSON:
{
  "riskLevel": "low|medium|high",
  "biasScore": 0.0,
  "prejudiceScore": 0.0,
  "flaggedItems": 0,
  "reasons": ["..."],
  "flaggedSnippets": ["..."],
  "summary": "..."
}
Rules:
- biasScore and prejudiceScore must be between 0 and 1
- reasons should be concrete and short
- do not invent snippets; only use provided snippets
""",
            Messages = new() { new LlmMessage("user", content.ToString()) }
        }, ct);

        using var doc = JsonDocument.Parse(response.Content);
        var root = doc.RootElement;
        if (root.ValueKind != JsonValueKind.Object) return null;

        var risk = root.TryGetProperty("riskLevel", out var riskEl) ? riskEl.GetString() : "low";
        var bias = root.TryGetProperty("biasScore", out var biasEl) && biasEl.TryGetDouble(out var biasVal) ? biasVal : 0d;
        var prejudice = root.TryGetProperty("prejudiceScore", out var prejudiceEl) && prejudiceEl.TryGetDouble(out var prejVal) ? prejVal : 0d;
        var flagged = root.TryGetProperty("flaggedItems", out var flaggedEl) && flaggedEl.TryGetInt32(out var count) ? count : 0;
        var summary = root.TryGetProperty("summary", out var summaryEl) ? summaryEl.GetString() : null;

        var reasons = new List<string>();
        if (root.TryGetProperty("reasons", out var reasonsEl) && reasonsEl.ValueKind == JsonValueKind.Array)
        {
            reasons = reasonsEl.EnumerateArray()
                .Select(x => x.GetString() ?? string.Empty)
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Take(8)
                .ToList();
        }

        var flaggedSnippets = new List<string>();
        if (root.TryGetProperty("flaggedSnippets", out var snippetsEl) && snippetsEl.ValueKind == JsonValueKind.Array)
        {
            flaggedSnippets = snippetsEl.EnumerateArray()
                .Select(x => x.GetString() ?? string.Empty)
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Take(8)
                .ToList();
        }

        return new JournalismBiasAssessment
        {
            Applied = true,
            RiskLevel = string.IsNullOrWhiteSpace(risk) ? "low" : risk!.Trim().ToLowerInvariant(),
            BiasScore = Math.Clamp(bias, 0d, 1d),
            PrejudiceScore = Math.Clamp(prejudice, 0d, 1d),
            FlaggedItems = Math.Max(0, flagged),
            Reasons = reasons,
            FlaggedSnippets = flaggedSnippets,
            Summary = summary ?? "LLM bias scan complete."
        };
    }
}
