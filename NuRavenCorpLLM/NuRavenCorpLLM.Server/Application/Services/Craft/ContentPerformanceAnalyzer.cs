// Application/Services/Craft/ContentPerformanceAnalyzer.cs
using System.Text.Json;
using NuRavenCorpLLM.Core.Interfaces.Repositories.Craft;
using NuRavenCorpLLM.Entities.Craft;
using NuRavenCorpLLM.Services;

namespace NuRavenCorpLLM.Application.Services.Craft;

public interface IContentPerformanceAnalyzer
{
    Task AnalyzeAsync(Guid contentId, string domain, CancellationToken ct = default);
}

public class ContentPerformanceAnalyzer : IContentPerformanceAnalyzer
{
    private readonly ICraftObservationRepository _observations;
    private readonly IContentFeatureExtractor _features;
    private readonly IPerformanceSignalCollector _signals;
    private readonly IUserCraftSkillRepository _skills;
    private readonly ILlmGateway _llm;
    private readonly ILogger<ContentPerformanceAnalyzer> _logger;

    public ContentPerformanceAnalyzer(
        ICraftObservationRepository observations,
        IContentFeatureExtractor features,
        IPerformanceSignalCollector signals,
        IUserCraftSkillRepository skills,
        ILlmGateway llm,
        ILogger<ContentPerformanceAnalyzer> logger)
    {
        _observations = observations; _features = features; _signals = signals;
        _skills = skills; _llm = llm; _logger = logger;
    }

    public async Task AnalyzeAsync(Guid contentId, string domain, CancellationToken ct = default)
    {
        var features = await _features.ExtractAsync(contentId, domain, ct);
        var metrics = await _signals.CollectAsync(contentId, ct);

        // Ask LLM to correlate features to outcomes and identify craft signals
        var prompt = $@"
You are a craft analyst for {domain}. Given CONTENT FEATURES and PERFORMANCE METRICS, return JSON:
- signals: array of {{ skillKey, direction (up|down|neutral), strength (0-1), note }}
- detectedPattern: short description of the dominant pattern
- improvementSuggestion: one sentence

CONTENT FEATURES: {JsonSerializer.Serialize(features)}
PERFORMANCE: {JsonSerializer.Serialize(metrics)}
";
        var resp = await _llm.CompleteAsync(new LlmRequest
        {
            SystemPrompt = "You analyze craft quality. Output only JSON.",
            Messages = new() { new LlmMessage("user", prompt) },
            JsonMode = true,
            Temperature = 0.2
        });

        JsonDocument parsed;
        try { parsed = JsonDocument.Parse(resp.Content); } catch { return; }

        var obs = new CraftObservation
        {
            UserId = features.UserId,
            ContentId = contentId,
            DomainKey = domain,
            Type = ObservationType.ContentPublished,
            Action = CraftAction.Monitored,
            SuccessMetric = (decimal?)metrics.EngagementRate,
            MetricName = "engagement_rate",
            Signals = parsed.RootElement.TryGetProperty("signals", out var s) ? JsonDocument.Parse(s.GetRawText()) : null,
            Features = JsonDocument.Parse(JsonSerializer.Serialize(features)),
            Context = JsonDocument.Parse(JsonSerializer.Serialize(metrics)),
            DetectedPattern = parsed.RootElement.TryGetProperty("detectedPattern", out var dp) ? dp.GetString() : null
        };

        await _observations.AddAsync(obs);

        // Update user skill scores
        await UpdateSkillScoresAsync(features.UserId, parsed.RootElement, ct);
    }

    private async Task UpdateSkillScoresAsync(Guid userId, JsonElement analysis, CancellationToken ct)
    {
        if (!analysis.TryGetProperty("signals", out var signals)) return;

        foreach (var sig in signals.EnumerateArray())
        {
            var skillKey = sig.GetProperty("skillKey").GetString() ?? "";
            var strength = sig.GetProperty("strength").GetDouble();
            var direction = sig.GetProperty("direction").GetString() ?? "neutral";
            if (string.IsNullOrEmpty(skillKey)) continue;

            var delta = direction == "up" ? strength * 3 : direction == "down" ? -strength * 3 : 0;
            await _skills.AdjustScoreAsync(userId, skillKey, (decimal)delta);
        }
    }
}

public record ContentFeatures(
    Guid ContentId, Guid UserId, string Domain,
    string? Title, string? Hook, int WordCount, int DurationSec,
    string? Format, Dictionary<string, double> Stats);
