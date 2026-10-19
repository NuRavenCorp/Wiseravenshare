using System.Diagnostics;
using System.Text;
using System.Text.Json;
using NuRavenCorpLLM.Application.Services.Ai.Repositories;
using NuRavenCorpLLM.Entities.Ai;
using NuRavenCorpLLM.Entities.Ai.DataSources;
using NuRavenCorpLLM.Services;

namespace NuRavenCorpLLM.Application.Services.Ai;

public interface IAiDataOrchestrator
{
    Task<AiDataResponse> AskAsync(Guid userId, string prompt, CancellationToken ct = default);
    IAsyncEnumerable<AiDataStreamEvent> StreamAsync(Guid userId, string prompt, CancellationToken ct = default);
}

public class AiDataResponse
{
    public Guid QueryId { get; set; }
    public string Prompt { get; set; } = string.Empty;
    public string? Narrative { get; set; }
    public RoutedIntent Route { get; set; } = new();
    public List<DataResult> Results { get; set; } = new();
    public List<OutputBlock> Blocks { get; set; } = new();
    public string? Answer { get; set; }
    public List<SourceCitation> Citations { get; set; } = new();
    public int LatencyMs { get; set; }
    public int TokenUsage { get; set; }
}

public class OutputBlock
{
    public string Type { get; set; } = "text";
    public string? Title { get; set; }
    public JsonElement? Data { get; set; }
}

public record SourceCitation(string SourceKey, string Label, string? Detail = null);
public record AiDataStreamEvent(string Type, string? Delta, object? Payload, string? Error);

public class AiDataOrchestrator : IAiDataOrchestrator
{
    private readonly ILlmIntentRouter _router;
    private readonly IEnumerable<IDataSourceAdapter> _adapters;
    private readonly ILlmGateway _llm;
    private readonly IDataQueryRepository _queries;
    private readonly ILogger<AiDataOrchestrator> _logger;

    public AiDataOrchestrator(
        ILlmIntentRouter router,
        IEnumerable<IDataSourceAdapter> adapters,
        ILlmGateway llm,
        IDataQueryRepository queries,
        ILogger<AiDataOrchestrator> logger)
    {
        _router = router;
        _adapters = adapters;
        _llm = llm;
        _queries = queries;
        _logger = logger;
    }

    public async Task<AiDataResponse> AskAsync(Guid userId, string prompt, CancellationToken ct = default)
    {
        var sw = Stopwatch.StartNew();
        var route = await _router.RouteAsync(prompt, ct);
        var specsFilters = route.Filters != null ? JsonSerializer.SerializeToDocument(route.Filters) : null;

        var tasks = route.Sources
            .Select(key => _adapters.FirstOrDefault(a => a.Key == key))
            .Where(a => a != null)
            .Select(async adapter =>
            {
                try
                {
                    return await adapter!.QueryAsync(new DataQuerySpec
                    {
                        Intent = route.Intent,
                        UserId = userId,
                        From = route.From,
                        To = route.To,
                        Dimension = route.Dimension,
                        Metric = route.Metric,
                        Limit = route.Limit,
                        Filters = specsFilters,
                        FreeText = prompt
                    }, ct);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Adapter {Key} failed", adapter!.Key);
                    return null;
                }
            });

        var results = (await Task.WhenAll(tasks)).Where(x => x != null).Cast<DataResult>().ToList();
        var blocks = ComposeBlocks(results, route.Dimension);
        var evidence = BuildEvidence(results);

        var answerResp = await _llm.CompleteAsync(new LlmRequest
        {
            SystemPrompt = """
You are WiseRaven's data analyst. Given the user's question and structured results, write a 2-5 sentence answer.
Cite sources by display label. Do not invent numbers. If results are empty, say so and suggest adjusting
date range, source, or dimension.
""",
            Messages = new() { new LlmMessage("user", $"QUESTION:\n{prompt}\n\nRESULTS:\n{evidence}") },
            Temperature = 0.3,
            MaxTokens = 400
        }, ct);

        blocks.Insert(0, new OutputBlock
        {
            Type = "text",
            Title = "Answer",
            Data = JsonSerializer.SerializeToElement(answerResp.Content)
        });

        sw.Stop();

        var response = new AiDataResponse
        {
            QueryId = Guid.NewGuid(),
            Prompt = prompt,
            Narrative = route.Narrative,
            Route = route,
            Results = results,
            Blocks = blocks,
            Answer = answerResp.Content,
            Citations = results.Select(r => new SourceCitation(r.SourceKey, r.SourceKey)).ToList(),
            LatencyMs = (int)sw.ElapsedMilliseconds,
            TokenUsage = answerResp.PromptTokens + answerResp.CompletionTokens
        };

        await _queries.AddAsync(new DataQuery
        {
            UserId = userId,
            Prompt = prompt,
            Intent = route.Intent,
            Sources = route.Sources.ToArray(),
            Filters = route.Filters != null ? JsonSerializer.SerializeToDocument(route.Filters) : null,
            Result = JsonSerializer.SerializeToDocument(new
            {
                totals = results.Where(r => r.Total.HasValue)
                    .ToDictionary(r => r.SourceKey, r => r.Total)
            }),
            OutputBlocks = JsonSerializer.SerializeToDocument(blocks),
            LatencyMs = response.LatencyMs,
            TokenUsage = response.TokenUsage,
            RowsReturned = results.Sum(r => r.RowsReturned)
        }, ct);

        return response;
    }

    public async IAsyncEnumerable<AiDataStreamEvent> StreamAsync(
        Guid userId,
        string prompt,
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct = default)
    {
        var route = await _router.RouteAsync(prompt, ct);
        yield return new AiDataStreamEvent("route", null, route, null);

        foreach (var key in route.Sources)
        {
            var adapter = _adapters.FirstOrDefault(a => a.Key == key);
            if (adapter == null)
            {
                continue;
            }

            yield return new AiDataStreamEvent("source_start", null, new { source = key }, null);
            yield return await QuerySourceAsync(adapter, route, userId, prompt, key, ct);
        }

        var final = await AskAsync(userId, prompt, ct);
        yield return new AiDataStreamEvent("final", null, final, null);
    }

    private async Task<AiDataStreamEvent> QuerySourceAsync(
        IDataSourceAdapter adapter,
        RoutedIntent route,
        Guid userId,
        string prompt,
        string key,
        CancellationToken ct)
    {
        try
        {
            var result = await adapter.QueryAsync(new DataQuerySpec
            {
                Intent = route.Intent,
                UserId = userId,
                From = route.From,
                To = route.To,
                Dimension = route.Dimension,
                Metric = route.Metric,
                Limit = route.Limit,
                Filters = route.Filters != null ? JsonSerializer.SerializeToDocument(route.Filters) : null,
                FreeText = prompt
            }, ct);

            return new AiDataStreamEvent("source_result", null, new { source = key, result }, null);
        }
        catch (Exception ex)
        {
            return new AiDataStreamEvent("source_error", null, new { source = key }, ex.Message);
        }
    }

    private static List<OutputBlock> ComposeBlocks(List<DataResult> results, string? dimension)
    {
        var blocks = new List<OutputBlock>();

        if (results.Any(x => x.Total.HasValue))
        {
            blocks.Add(new OutputBlock
            {
                Type = "metrics",
                Title = "Key numbers",
                Data = JsonSerializer.SerializeToElement(
                    results.Where(x => x.Total.HasValue)
                        .Select(x => new { label = x.SourceKey, value = x.Total!.Value }))
            });
        }

        if (results.Any(x => x.Points.Count > 0))
        {
            blocks.Add(new OutputBlock
            {
                Type = "chart",
                Title = $"Trend ({dimension ?? "time"})",
                Data = JsonSerializer.SerializeToElement(
                    results.Where(x => x.Points.Count > 0)
                        .Select(x => new { source = x.SourceKey, points = x.Points }))
            });
        }

        if (results.Any(x => x.Rows.Count > 0))
        {
            blocks.Add(new OutputBlock
            {
                Type = "table",
                Title = "Rows",
                Data = JsonSerializer.SerializeToElement(
                    results.Where(x => x.Rows.Count > 0)
                        .Select(x => new { source = x.SourceKey, rows = x.Rows }))
            });
        }

        return blocks;
    }

    private static string BuildEvidence(List<DataResult> results)
    {
        var sb = new StringBuilder();
        foreach (var result in results)
        {
            sb.AppendLine($"[{result.SourceKey}]");
            if (result.Total.HasValue)
            {
                sb.AppendLine($"  total: {result.Total.Value}");
            }

            if (result.Rows.Count > 0)
            {
                sb.AppendLine($"  rows: {result.Rows.Count}");
                foreach (var row in result.Rows.Take(10))
                {
                    sb.AppendLine($"    {string.Join(", ", row.Select(kv => $"{kv.Key}={kv.Value}"))}");
                }
            }

            if (result.Points.Count > 0)
            {
                sb.AppendLine("  series: " + string.Join("; ", result.Points.Take(30).Select(p => $"{p.Label}={p.Value}")));
            }

            sb.AppendLine();
        }

        return sb.ToString();
    }
}
