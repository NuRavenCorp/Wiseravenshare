using System.Text.Json;
using NuRavenCorpLLM.Services;

namespace NuRavenCorpLLM.Application.Services.Ai;

public interface ILlmIntentRouter
{
    Task<RoutedIntent> RouteAsync(string userPrompt, CancellationToken ct = default);
}

public class RoutedIntent
{
    public string Intent { get; set; } = "count";
    public List<string> Sources { get; set; } = new();
    public DateTime? From { get; set; }
    public DateTime? To { get; set; }
    public string? Dimension { get; set; }
    public string? Metric { get; set; }
    public int Limit { get; set; } = 20;
    public Dictionary<string, object>? Filters { get; set; }
    public string? Narrative { get; set; }
    public List<string> OutputBlocks { get; set; } = new();
}

public class LlmIntentRouter : ILlmIntentRouter
{
    private readonly ILlmGateway _llm;
    private readonly ILogger<LlmIntentRouter> _logger;

    public LlmIntentRouter(ILlmGateway llm, ILogger<LlmIntentRouter> logger)
    {
        _llm = llm;
        _logger = logger;
    }

    public async Task<RoutedIntent> RouteAsync(string userPrompt, CancellationToken ct = default)
    {
        var system = """
You route user questions about the WiseRavenShare platform to structured data queries.
Available sources: posts, videos, radio, podcasts, planner, currency, truth, collaboration, users.
Intents: count | top | trend | time_series | distribution | compare | latest | aggregate.
Dimensions: day | week | month | author | creator | type | category | platform | region | station | daypart | priority | status | verdict.
Metrics vary per source.

Return strict JSON:
{
  "intent": "...",
  "sources": ["..."],
  "from": "ISO date or null",
  "to": "ISO date or null",
  "dimension": "... or null",
  "metric": "... or null",
  "limit": 20,
  "filters": { } | null,
  "outputBlocks": ["metrics","chart","table","text"],
  "narrative": "short restatement of the user's goal"
}
Only include sources that are actually needed. If unsure, prefer ["posts"] plus the most likely source.
""";

        try
        {
            var resp = await _llm.CompleteAsync(new LlmRequest
            {
                SystemPrompt = system,
                Messages = new() { new LlmMessage("user", userPrompt) },
                JsonMode = true,
                Temperature = 0.1,
                MaxTokens = 500
            }, ct);

            using var doc = JsonDocument.Parse(resp.Content);
            var r = doc.RootElement;

            var routed = new RoutedIntent
            {
                Intent = r.TryGetProperty("intent", out var i) ? i.GetString() ?? "count" : "count",
                Sources = r.TryGetProperty("sources", out var s)
                    ? s.EnumerateArray().Select(x => x.GetString() ?? string.Empty).Where(x => x.Length > 0).Distinct().ToList()
                    : new List<string>(),
                Dimension = r.TryGetProperty("dimension", out var d) ? d.GetString() : null,
                Metric = r.TryGetProperty("metric", out var m) ? m.GetString() : null,
                Limit = r.TryGetProperty("limit", out var l) && l.TryGetInt32(out var parsedLimit)
                    ? Math.Clamp(parsedLimit, 1, 200)
                    : 20,
                Narrative = r.TryGetProperty("narrative", out var n) ? n.GetString() : null
            };

            if (r.TryGetProperty("from", out var from) && from.ValueKind == JsonValueKind.String)
            {
                routed.From = DateTime.TryParse(from.GetString(), out var value) ? value : null;
            }

            if (r.TryGetProperty("to", out var to) && to.ValueKind == JsonValueKind.String)
            {
                routed.To = DateTime.TryParse(to.GetString(), out var value) ? value : null;
            }

            if (r.TryGetProperty("outputBlocks", out var outputBlocks) && outputBlocks.ValueKind == JsonValueKind.Array)
            {
                routed.OutputBlocks = outputBlocks
                    .EnumerateArray()
                    .Select(x => x.GetString() ?? string.Empty)
                    .Where(x => x.Length > 0)
                    .Distinct()
                    .ToList();
            }

            if (r.TryGetProperty("filters", out var filters) && filters.ValueKind == JsonValueKind.Object)
            {
                routed.Filters = JsonSerializer.Deserialize<Dictionary<string, object>>(filters.GetRawText());
            }

            if (routed.Sources.Count == 0)
            {
                routed.Sources.Add("posts");
            }

            if (routed.OutputBlocks.Count == 0)
            {
                routed.OutputBlocks = new() { "metrics", "text" };
            }

            return routed;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Intent routing failed, using fallback route");
            return new RoutedIntent
            {
                Intent = "count",
                Sources = new() { "posts" },
                OutputBlocks = new() { "metrics", "text" },
                Narrative = userPrompt
            };
        }
    }
}
