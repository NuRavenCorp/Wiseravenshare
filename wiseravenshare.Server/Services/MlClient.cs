using System.Net.Http.Json;
using System.Text.Json.Serialization;

namespace Wiseravenshare.Server.Services;

// ── DTOs ─────────────────────────────────────────────────────────────────────

public sealed record MlViewingEventDto(
    [property: JsonPropertyName("user_id")]         string UserId,
    [property: JsonPropertyName("content_id")]      string ContentId,
    [property: JsonPropertyName("timestamp")]       double Timestamp,
    [property: JsonPropertyName("watch_seconds")]   double WatchSeconds,
    [property: JsonPropertyName("content_duration")] double ContentDuration,
    [property: JsonPropertyName("rewatch_count")]   int RewatchCount     = 0,
    [property: JsonPropertyName("skip_events")]     int SkipEvents       = 0,
    [property: JsonPropertyName("rewind_events")]   int RewindEvents     = 0,
    [property: JsonPropertyName("paused_events")]   int PausedEvents     = 0,
    [property: JsonPropertyName("device")]          string Device        = "unknown",
    [property: JsonPropertyName("time_of_day")]     int TimeOfDay        = 12,
    [property: JsonPropertyName("session_id")]      string SessionId     = "",
    [property: JsonPropertyName("abandoned")]       bool Abandoned       = false
);

public sealed record MlRecommendationDto(
    [property: JsonPropertyName("content_id")] string ContentId,
    [property: JsonPropertyName("title")]      string Title,
    [property: JsonPropertyName("score")]      double Score,
    [property: JsonPropertyName("reason")]     string Reason
);

public sealed record MlRecommendResponseDto(
    [property: JsonPropertyName("user_id")]         string UserId,
    [property: JsonPropertyName("profile")]          Dictionary<string, double> Profile,
    [property: JsonPropertyName("recommendations")] List<MlRecommendationDto> Recommendations,
    [property: JsonPropertyName("latency_ms")]       double LatencyMs
);

public sealed record MlProfileDto(
    [property: JsonPropertyName("user_id")]     string UserId,
    [property: JsonPropertyName("traits")]      Dictionary<string, double> Traits,
    [property: JsonPropertyName("event_count")] int EventCount,
    [property: JsonPropertyName("computed_at")] double ComputedAt
);

// ── HTTP client ───────────────────────────────────────────────────────────────

/// <summary>
/// Typed HTTP client for the WiseRavenStream ML FastAPI microservice.
/// Register via AddHttpClient&lt;MlClient&gt; in Program.cs.
/// </summary>
public sealed class MlClient
{
    private readonly HttpClient _http;
    private readonly ILogger<MlClient> _logger;

    public MlClient(HttpClient http, ILogger<MlClient> logger)
    {
        _http   = http;
        _logger = logger;
    }

    /// <summary>Fire-and-forget: log a viewing event to the ML service.</summary>
    public async Task LogEventAsync(MlViewingEventDto evt, CancellationToken ct = default)
    {
        try
        {
            var resp = await _http.PostAsJsonAsync("/events", evt, ct);
            if (!resp.IsSuccessStatusCode)
                _logger.LogWarning("ML /events returned {Status}", (int)resp.StatusCode);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "ML event log failed (non-critical)");
        }
    }

    /// <summary>Fetch the 10-point behavioral profile for a user.</summary>
    public async Task<MlProfileDto?> GetProfileAsync(string userId, CancellationToken ct = default)
    {
        try
        {
            return await _http.GetFromJsonAsync<MlProfileDto>($"/profile/{Uri.EscapeDataString(userId)}", ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "ML /profile/{UserId} failed", userId);
            return null;
        }
    }

    /// <summary>Get hybrid recommendations for a user.</summary>
    public async Task<MlRecommendResponseDto?> RecommendAsync(
        string userId,
        IEnumerable<MlViewingEventDto> events,
        int topK = 20,
        bool excludeSeen = true,
        bool explain = true,
        CancellationToken ct = default)
    {
        try
        {
            var payload = new
            {
                user_id      = userId,
                events       = events,
                top_k        = topK,
                exclude_seen = excludeSeen,
                explain      = explain,
            };
            var resp = await _http.PostAsJsonAsync("/recommend", payload, ct);
            resp.EnsureSuccessStatusCode();
            return await resp.Content.ReadFromJsonAsync<MlRecommendResponseDto>(ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "ML /recommend failed for user {UserId}", userId);
            return null;
        }
    }

    /// <summary>Reload ALS model on the ML service after nightly training.</summary>
    public async Task<bool> ReloadAlsAsync(CancellationToken ct = default)
    {
        try
        {
            var resp = await _http.PostAsync("/admin/reload-als", null, ct);
            return resp.IsSuccessStatusCode;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "ML /admin/reload-als failed");
            return false;
        }
    }
}
