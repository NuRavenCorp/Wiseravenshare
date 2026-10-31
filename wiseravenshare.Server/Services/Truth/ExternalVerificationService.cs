using System.Text.Json;
using System.Web;
using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Infrastructure.Data;

namespace Wiseravenshare.Server.Services.Truth;

// ── Public interface ──────────────────────────────────────────────────────────

public interface IExternalVerificationService
{
    Task<IReadOnlyList<ExternalVerifierResult>> QueryAllAsync(string claim, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<ExternalVerifier>> ListVerifiersAsync(CancellationToken cancellationToken = default);
    Task<ExternalVerifier> UpsertVerifierAsync(ExternalVerifier verifier, CancellationToken cancellationToken = default);
    Task<bool> DeleteVerifierAsync(string id, CancellationToken cancellationToken = default);
}

// ── Result model ─────────────────────────────────────────────────────────────

public sealed record ExternalVerifierResult
{
    public string VerifierId { get; init; } = string.Empty;
    public string VerifierName { get; init; } = string.Empty;
    /// <summary>Normalised 0.0–1.0 confidence score from this verifier.</summary>
    public decimal Score { get; init; }
    /// <summary>Weight this verifier contributes in the composite calculation.</summary>
    public decimal Weight { get; init; }
    public bool Succeeded { get; init; }
    public string? Error { get; init; }
    public string? SourceUrl { get; init; }
    public string? Summary { get; init; }
}

// ── Service implementation ────────────────────────────────────────────────────

public sealed class ExternalVerificationService : IExternalVerificationService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly HttpClient _http;
    private readonly ILogger<ExternalVerificationService> _logger;

    // Per-request timeout — keep short; external sites can be slow.
    private static readonly TimeSpan RequestTimeout = TimeSpan.FromSeconds(6);

    public ExternalVerificationService(
        IServiceScopeFactory scopeFactory,
        IHttpClientFactory httpClientFactory,
        ILogger<ExternalVerificationService> logger)
    {
        _scopeFactory = scopeFactory;
        _http = httpClientFactory.CreateClient("ExternalVerifier");
        _http.Timeout = RequestTimeout;
        if (_http.DefaultRequestHeaders.UserAgent.Count == 0)
            _http.DefaultRequestHeaders.UserAgent.ParseAdd("Wiseravenshare-TruthEngine/1.0");
        _logger = logger;
    }

    public async Task<IReadOnlyList<ExternalVerifierResult>> QueryAllAsync(
        string claim,
        CancellationToken cancellationToken = default)
    {
        await EnsureTableExistsAsync(cancellationToken);

        List<ExternalVerifier> verifiers;
        await using (var scope = _scopeFactory.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            verifiers = await db.ExternalVerifiers
                .AsNoTracking()
                .Where(v => v.IsEnabled)
                .ToListAsync(cancellationToken);
        }

        if (verifiers.Count == 0)
            return [];

        var tasks = verifiers
            .Select(v => CallVerifierAsync(v, claim, cancellationToken))
            .ToArray();

        var results = await Task.WhenAll(tasks);
        return results;
    }

    public async Task<IReadOnlyList<ExternalVerifier>> ListVerifiersAsync(CancellationToken cancellationToken = default)
    {
        await EnsureTableExistsAsync(cancellationToken);
        await using var scope = _scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return await db.ExternalVerifiers
            .AsNoTracking()
            .OrderByDescending(v => v.IsEnabled)
            .ThenByDescending(v => v.Weight)
            .ToListAsync(cancellationToken);
    }

    public async Task<ExternalVerifier> UpsertVerifierAsync(
        ExternalVerifier verifier,
        CancellationToken cancellationToken = default)
    {
        await EnsureTableExistsAsync(cancellationToken);
        await using var scope = _scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var existing = await db.ExternalVerifiers.FirstOrDefaultAsync(v => v.Id == verifier.Id, cancellationToken);
        if (existing is null)
        {
            verifier.CreatedAt = DateTime.UtcNow;
            verifier.UpdatedAt = DateTime.UtcNow;
            db.ExternalVerifiers.Add(verifier);
        }
        else
        {
            existing.Name = verifier.Name;
            existing.EndpointTemplate = verifier.EndpointTemplate;
            existing.FetchType = verifier.FetchType;
            existing.ApiKeyEnvVar = verifier.ApiKeyEnvVar;
            existing.Weight = verifier.Weight;
            existing.IsEnabled = verifier.IsEnabled;
            existing.ScoreJsonPath = verifier.ScoreJsonPath;
            existing.Notes = verifier.Notes;
            existing.UpdatedAt = DateTime.UtcNow;
        }

        await db.SaveChangesAsync(cancellationToken);
        return existing ?? verifier;
    }

    public async Task<bool> DeleteVerifierAsync(string id, CancellationToken cancellationToken = default)
    {
        await using var scope = _scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var v = await db.ExternalVerifiers.FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (v is null) return false;
        db.ExternalVerifiers.Remove(v);
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private async Task<ExternalVerifierResult> CallVerifierAsync(
        ExternalVerifier verifier,
        string claim,
        CancellationToken cancellationToken)
    {
        var baseResult = new ExternalVerifierResult
        {
            VerifierId = verifier.Id,
            VerifierName = verifier.Name,
            Weight = verifier.Weight,
        };

        try
        {
            return verifier.FetchType?.ToLowerInvariant() switch
            {
                "rss"       => await FetchRssVerifierAsync(verifier, claim, cancellationToken),
                "rest_json" => await FetchRestJsonVerifierAsync(verifier, claim, cancellationToken),
                // "stub" and anything unknown: return neutral 0.50 — contributes weight without a live call.
                _ => baseResult with { Score = 0.50m, Succeeded = true, Summary = $"Stub — {verifier.Name} contributes a neutral baseline." }
            };
        }
        catch (TaskCanceledException)
        {
            _logger.LogWarning("External verifier {Id} timed out for claim.", verifier.Id);
            return baseResult with { Score = 0.50m, Succeeded = false, Error = "Request timed out." };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "External verifier {Id} failed.", verifier.Id);
            return baseResult with { Score = 0.50m, Succeeded = false, Error = ex.Message };
        }
    }

    private async Task<ExternalVerifierResult> FetchRssVerifierAsync(
        ExternalVerifier verifier,
        string claim,
        CancellationToken cancellationToken)
    {
        var url = BuildUrl(verifier.EndpointTemplate, claim, verifier.ApiKeyEnvVar);
        using var response = await _http.GetAsync(url, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            return new ExternalVerifierResult
            {
                VerifierId = verifier.Id, VerifierName = verifier.Name, Weight = verifier.Weight,
                Score = 0.50m, Succeeded = false, Error = $"HTTP {(int)response.StatusCode}", SourceUrl = url
            };
        }

        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        // Heuristic: count "false/debunked/pants-on-fire" vs "true/correct/supported" keywords in the XML
        var lower = body.ToLowerInvariant();
        var trueHits = CountKeywords(lower, ["true", "correct", "supported", "accurate", "verified"]);
        var falseHits = CountKeywords(lower, ["false", "debunked", "pants-on-fire", "misleading", "incorrect", "wrong"]);
        var total = trueHits + falseHits;
        var score = total == 0 ? 0.50m : Math.Clamp((decimal)trueHits / total, 0m, 1m);

        return new ExternalVerifierResult
        {
            VerifierId = verifier.Id, VerifierName = verifier.Name, Weight = verifier.Weight,
            Score = score, Succeeded = true,
            SourceUrl = url,
            Summary = $"{trueHits} supporting / {falseHits} contradicting signals from {verifier.Name} RSS."
        };
    }

    private async Task<ExternalVerifierResult> FetchRestJsonVerifierAsync(
        ExternalVerifier verifier,
        string claim,
        CancellationToken cancellationToken)
    {
        var url = BuildUrl(verifier.EndpointTemplate, claim, verifier.ApiKeyEnvVar);
        using var response = await _http.GetAsync(url, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            return new ExternalVerifierResult
            {
                VerifierId = verifier.Id, VerifierName = verifier.Name, Weight = verifier.Weight,
                Score = 0.50m, Succeeded = false, Error = $"HTTP {(int)response.StatusCode}", SourceUrl = url
            };
        }

        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        decimal score = 0.50m;
        string? summary = null;

        try
        {
            using var doc = JsonDocument.Parse(body);
            // Try ScoreJsonPath first; fall back to keyword heuristic.
            if (!string.IsNullOrWhiteSpace(verifier.ScoreJsonPath))
            {
                var extracted = ExtractJsonValue(doc.RootElement, verifier.ScoreJsonPath);
                if (extracted is not null && decimal.TryParse(extracted, out var parsed))
                {
                    // Accept both 0–1 and 0–100 scales
                    score = parsed > 1m ? Math.Clamp(parsed / 100m, 0m, 1m) : Math.Clamp(parsed, 0m, 1m);
                }
            }
            else
            {
                // Keyword heuristic on the raw JSON body
                var lower = body.ToLowerInvariant();
                var trueHits = CountKeywords(lower, ["true", "verified", "accurate", "confirmed"]);
                var falseHits = CountKeywords(lower, ["false", "misleading", "incorrect", "debunked"]);
                var total = trueHits + falseHits;
                if (total > 0) score = Math.Clamp((decimal)trueHits / total, 0m, 1m);
                summary = $"{trueHits} supporting / {falseHits} contradicting signals.";
            }
        }
        catch
        {
            // Parsing failed; keep neutral score.
        }

        return new ExternalVerifierResult
        {
            VerifierId = verifier.Id, VerifierName = verifier.Name, Weight = verifier.Weight,
            Score = score, Succeeded = true, SourceUrl = url, Summary = summary
        };
    }

    private static string BuildUrl(string template, string claim, string? apiKeyEnvVar)
    {
        var encodedQuery = HttpUtility.UrlEncode(claim.Length > 120 ? claim[..120] : claim);
        var url = template.Replace("{query}", encodedQuery);
        if (!string.IsNullOrWhiteSpace(apiKeyEnvVar))
        {
            var key = Environment.GetEnvironmentVariable(apiKeyEnvVar) ?? string.Empty;
            url = url.Replace("{api_key}", key);
        }
        return url;
    }

    private static int CountKeywords(string text, string[] keywords)
        => keywords.Sum(k => CountOccurrences(text, k));

    private static int CountOccurrences(string text, string keyword)
    {
        var count = 0;
        var index = 0;
        while ((index = text.IndexOf(keyword, index, StringComparison.Ordinal)) >= 0)
        {
            count++;
            index += keyword.Length;
        }
        return count;
    }

    private static string? ExtractJsonValue(JsonElement root, string dotPath)
    {
        try
        {
            var parts = dotPath.Split('.', StringSplitOptions.RemoveEmptyEntries);
            var current = root;
            foreach (var part in parts)
            {
                if (!current.TryGetProperty(part, out current))
                    return null;
            }
            return current.ValueKind == JsonValueKind.String
                ? current.GetString()
                : current.ToString();
        }
        catch { return null; }
    }

    private async Task EnsureTableExistsAsync(CancellationToken cancellationToken = default)
    {
        await using var scope = _scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await db.Database.ExecuteSqlRawAsync(
            """
            CREATE TABLE IF NOT EXISTS app_data.external_verifiers (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                endpoint_template TEXT NOT NULL DEFAULT '',
                fetch_type TEXT NOT NULL DEFAULT 'stub',
                api_key_env_var TEXT NULL,
                weight NUMERIC NOT NULL DEFAULT 0.10,
                is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
                score_json_path TEXT NULL,
                notes TEXT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS ix_external_verifiers_is_enabled
                ON app_data.external_verifiers(is_enabled);
            """,
            cancellationToken);
    }
}
