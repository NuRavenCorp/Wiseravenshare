// Application/Services/Craft/ChatterCraftObserver.cs
using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using NuRavenCorpLLM.Core.Interfaces.Repositories.Craft;
using NuRavenCorpLLM.Entities;
using NuRavenCorpLLM.Entities.Craft;
using NuRavenCorpLLM.Services;

namespace NuRavenCorpLLM.Application.Services.Craft;

public interface IChatterCraftObserver
{
    Task ObservePostAsync(Guid postId, CancellationToken ct = default);
    Task ObserveCommentAsync(Guid commentId, CancellationToken ct = default);
    Task ExtractPatternsAsync(string domain, int batchSize = 100, CancellationToken ct = default);
}

public class ChatterCraftObserver(
    ICraftObservationRepository observations,
    ICraftPatternRepository patterns,
    IPostRepository posts,
    ICommentRepository comments,
    ILlmGateway llm,
    ILogger<ChatterCraftObserver> logger) : IChatterCraftObserver
{
    private readonly ICraftObservationRepository _observations = observations;
    private readonly ICraftPatternRepository _patterns = patterns;
    private readonly IPostRepository _posts = posts;
    private readonly ICommentRepository _comments = comments;
    private readonly ILlmGateway _llm = llm;
    private readonly ILogger<ChatterCraftObserver> _logger = logger;

    public async Task ObservePostAsync(Guid postId, CancellationToken ct = default)
    {
        var post = await _posts.GetByIdAsync(postId);
        if (post == null) return;

        // Attribute to a craft domain heuristically, or mark "content_creation"
        var domain = ClassifyDomain(post.Content ?? "");

        var obs = new CraftObservation
        {
            UserId = post.UserId,
            ContentId = post.Id,
            DomainKey = domain,
            Type = ObservationType.ContentPublished,
            Action = CraftAction.Created,
            Features = JsonDocument.Parse(JsonSerializer.Serialize(new
            {
                wordCount = (post.Content ?? "").Split(' ', StringSplitOptions.RemoveEmptyEntries).Length,
                hasMedia = post.MediaUrls?.Length > 0,
                hasReply = post.ReplyToId.HasValue
            }))
        };
        await _observations.AddAsync(obs);
    }

    public async Task ObserveCommentAsync(Guid commentId, CancellationToken ct = default)
    {
        var comment = await _comments.GetByIdAsync(commentId);
        if (comment == null) return;

        var obs = new CraftObservation
        {
            UserId = comment.UserId,
            ContentId = comment.Id,
            DomainKey = "community",
            Type = ObservationType.AudienceReaction,
            Action = CraftAction.Created,
            Features = JsonDocument.Parse(JsonSerializer.Serialize(new
            {
                length = comment.Content?.Length ?? 0,
                sentiment = AnalyzeSentimentSimple(comment.Content ?? "")
            }))
        };
        await _observations.AddAsync(obs);
    }

    public async Task ExtractPatternsAsync(string domain, int batchSize = 100, CancellationToken ct = default)
    {
        var observations = await _observations.GetRecentByDomainAsync(domain, batchSize);
        if (observations.Count < 20) return;

        var sample = observations.Select(o => new
        {
            o.SuccessMetric,
            o.MetricName,
            features = o.Features?.ToString(),
            signals = o.Signals?.ToString()
        }).ToList();

        var prompt = $@"
You are a craft researcher. Analyze these {observations.Count} observations of {domain} content and their outcomes.
Return JSON with:
{{
  ""patterns"": [
    {{
      ""name"": ""short pattern name"",
      ""description"": ""2-3 sentences about what works"",
      ""evidence"": ""what in the data supports this"",
      ""confidence"": 0.0-1.0,
      ""example"": ""concrete example"",
      ""counterexample"": ""what fails""
    }}
  ]
}}

DATA: {JsonSerializer.Serialize(sample)}";

        var resp = await _llm.CompleteAsync(new LlmRequest
        {
            SystemPrompt = "You discover data-driven craft patterns. Output JSON.",
            Messages = new() { new LlmMessage("user", prompt) },
            JsonMode = true,
            Temperature = 0.3,
            MaxTokens = 2000
        });

        try
        {
            using var doc = JsonDocument.Parse(resp.Content);
            if (!doc.RootElement.TryGetProperty("patterns", out var patterns)) return;

            foreach (var p in patterns.EnumerateArray())
            {
                var pattern = new CraftPattern
                {
                    DomainKey = domain,
                    Name = p.GetProperty("name").GetString() ?? "",
                    Description = p.GetProperty("description").GetString() ?? "",
                    Evidence = p.TryGetProperty("evidence", out var ev) ? ev.GetString() : null,
                    Confidence = p.TryGetProperty("confidence", out var cf) ? cf.GetDecimal() : 0.5m,
                    Example = p.TryGetProperty("example", out var ex) ? ex.GetString() : null,
                    CounterExample = p.TryGetProperty("counterExample", out var ce) ? ce.GetString() : null,
                    SampleSize = observations.Count
                };
                await _patterns.AddAsync(pattern);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Pattern extraction failed");
        }
    }

    private static string ClassifyDomain(string content)
    {
        var lower = content.ToLowerInvariant();
        if (lower.Contains("report") || lower.Contains("source") || lower.Contains("investigat")) return "journalism";
        if (lower.Contains("episode") || lower.Contains("podcast")) return "podcast";
        if (lower.Contains("radio") || lower.Contains("station")) return "radio";
        if (lower.Contains("video") || lower.Contains("clip")) return "videography";
        if (lower.Contains("photo") || lower.Contains("image")) return "photography";
        if (lower.Contains("beat") || lower.Contains("sample") || lower.Contains("track")) return "music_production";
        return "content_creation";
    }

    private static double AnalyzeSentimentSimple(string text)
    {
        var positive = new[] { "great", "love", "amazing", "excellent", "brilliant" };
        var negative = new[] { "bad", "hate", "terrible", "awful", "worst" };
        var lower = text.ToLowerInvariant();
        int p = positive.Count(lower.Contains);
        int n = negative.Count(lower.Contains);
        return p - n;
    }
}

