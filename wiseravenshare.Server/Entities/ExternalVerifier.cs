namespace Wiseravenshare.Server.Entities;

/// <summary>
/// Registry entry for an external fact-verification source.
/// Admins can add/remove/tune sources and their weights at runtime without a deploy.
/// </summary>
public sealed class ExternalVerifier
{
    /// <summary>Stable short slug used as a cache key and display identifier.</summary>
    public string Id { get; set; } = string.Empty;

    /// <summary>Human-readable display name, e.g. "PolitiFact".</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// Base URL used to build search/query requests.
    /// May contain {query} template token — replaced at call time.
    /// </summary>
    public string EndpointTemplate { get; set; } = string.Empty;

    /// <summary>
    /// How results are fetched: "rss" | "rest_json" | "scrape" | "stub".
    /// "stub" — disabled/demo entry; returns neutral 0.50 so it contributes weight without calling anything.
    /// </summary>
    public string FetchType { get; set; } = "stub";

    /// <summary>
    /// Optional API key stored as an environment-variable name (not the raw key).
    /// e.g. "POLITIFACT_API_KEY" — the engine reads Environment.GetEnvironmentVariable(ApiKeyEnvVar).
    /// </summary>
    public string? ApiKeyEnvVar { get; set; }

    /// <summary>
    /// Relative weight assigned to this verifier in the composite score.
    /// All active verifier weights are summed, then each is divided by the total
    /// (alongside the fixed internal weights), keeping the grand total at 1.0.
    /// </summary>
    public decimal Weight { get; set; } = 0.10m;

    /// <summary>Whether this verifier participates in scoring.</summary>
    public bool IsEnabled { get; set; } = true;

    /// <summary>
    /// Optional query field / path template in the response where the truth score lives.
    /// e.g. "articles[0].truthRating" — parsed by the evaluation service.
    /// </summary>
    public string? ScoreJsonPath { get; set; }

    /// <summary>Free-text notes visible only to admins.</summary>
    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
