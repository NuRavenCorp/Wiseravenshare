using System.Text.RegularExpressions;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Infrastructure.Data;
using Wiseravenshare.Server.Services.AiAssistant;

namespace Wiseravenshare.Server.Services;

public interface IJournalismIntegrityAgentService
{
    Task<JournalismIntegrityEvaluationResult> EvaluateAsync(
        JournalismIntegrityEvaluationRequest request,
        CancellationToken cancellationToken = default);

    Task<JournalismIntegrityEvaluationResult> EvaluateAndApplyAsync(
        JournalismIntegrityEvaluationRequest request,
        bool canApplyDecision,
        CancellationToken cancellationToken = default);
}

public sealed class JournalismIntegrityAgentService : IJournalismIntegrityAgentService
{
    private static readonly Regex UrlRegex = new(@"https?://", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex AllCapsWordRegex = new(@"\b[A-Z]{5,}\b", RegexOptions.Compiled);
    private static readonly Regex SensationalRegex = new(@"(!{2,}|\b(shocking|explosive|must see|guaranteed|secret exposed)\b)", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex WordRegex = new(@"[\p{L}\p{N}]+", RegexOptions.Compiled);

    private readonly AppDbContext _db;
    private readonly ILogger<JournalismIntegrityAgentService> _logger;
    private readonly NuRavenCorpLlmChatService _nuRavenCorpLlmChatService;

    public JournalismIntegrityAgentService(
        AppDbContext db,
        ILogger<JournalismIntegrityAgentService> logger,
        NuRavenCorpLlmChatService nuRavenCorpLlmChatService)
    {
        _db = db;
        _logger = logger;
        _nuRavenCorpLlmChatService = nuRavenCorpLlmChatService;
    }

    public async Task<JournalismIntegrityEvaluationResult> EvaluateAsync(
        JournalismIntegrityEvaluationRequest request,
        CancellationToken cancellationToken = default)
    {
        var material = await BuildMaterialAsync(request, cancellationToken);
        var result = await EvaluateInternalAsync(request, material, cancellationToken);
        result.AppliedToReport = false;
        return result;
    }

    public async Task<JournalismIntegrityEvaluationResult> EvaluateAndApplyAsync(
        JournalismIntegrityEvaluationRequest request,
        bool canApplyDecision,
        CancellationToken cancellationToken = default)
    {
        var material = await BuildMaterialAsync(request, cancellationToken);
        var result = await EvaluateInternalAsync(request, material, cancellationToken);

        if (!request.ApplyDecision || string.IsNullOrWhiteSpace(material.ReportId))
        {
            result.AppliedToReport = false;
            return result;
        }

        if (!canApplyDecision)
        {
            result.AppliedToReport = false;
            result.Messages.Add("Decision was not applied: admin privileges required.");
            return result;
        }

        var row = await _db.CompatJournalismReports.FirstOrDefaultAsync(
            r => r.Id == material.ReportId,
            cancellationToken);
        if (row is null)
        {
            result.AppliedToReport = false;
            result.Messages.Add("Decision was not applied: report not found.");
            return result;
        }

        ApplyPublicationOutcome(row, result);
        if (!string.IsNullOrWhiteSpace(row.PostId) && Guid.TryParse(row.PostId, out var postId))
        {
            var post = await _db.Posts.FirstOrDefaultAsync(p => p.Id == postId, cancellationToken);
            if (post is not null)
            {
                if (result.RecommendedStatus == "verified")
                {
                    post.IsDeleted = false;
                    post.DeletedAt = null;
                    post.IsSensitive = false;
                    post.TruthStatus = "verified";
                }
                else
                {
                    post.IsDeleted = true;
                    post.DeletedAt = DateTime.UtcNow;
                }
            }
        }

        row.UpdatedDate = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
        result.AppliedToReport = true;
        return result;
    }

    private async Task<JournalismMaterial> BuildMaterialAsync(
        JournalismIntegrityEvaluationRequest request,
        CancellationToken cancellationToken)
    {
        var reportId = request.ReportId?.Trim();
        var headline = request.Headline?.Trim();
        var description = request.Description?.Trim();
        var sourceUrl = request.SourceUrl?.Trim();
        var region = request.Region?.Trim();
        var postId = request.PostId?.Trim();
        string? truthStatus = null;

        if (!string.IsNullOrWhiteSpace(reportId))
        {
            var report = await _db.CompatJournalismReports
                .AsNoTracking()
                .FirstOrDefaultAsync(r => r.Id == reportId, cancellationToken);
            if (report is not null)
            {
                headline ??= report.Headline?.Trim();
                description ??= report.Description?.Trim();
                sourceUrl ??= report.SourceUrl?.Trim();
                region ??= report.Region?.Trim();
                postId ??= report.PostId?.Trim();
            }
        }

        if (!string.IsNullOrWhiteSpace(postId) && Guid.TryParse(postId, out var parsedPostId))
        {
            var post = await _db.Posts
                .AsNoTracking()
                .Where(p => p.Id == parsedPostId)
                .Select(p => new { p.Content, p.TruthStatus })
                .FirstOrDefaultAsync(cancellationToken);
            if (post is not null)
            {
                if (string.IsNullOrWhiteSpace(description))
                {
                    description = post.Content?.Trim();
                }
                truthStatus = post.TruthStatus?.Trim().ToLowerInvariant();
            }
        }

        return new JournalismMaterial
        {
            ReportId = reportId,
            PostId = postId,
            Headline = headline ?? string.Empty,
            Description = description ?? string.Empty,
            SourceUrl = sourceUrl ?? string.Empty,
            Region = region ?? string.Empty,
            TruthStatus = truthStatus
        };
    }

    private async Task<JournalismIntegrityEvaluationResult> EvaluateInternalAsync(
        JournalismIntegrityEvaluationRequest request,
        JournalismMaterial material,
        CancellationToken cancellationToken)
    {
        var score = 100d;
        var factors = new List<IntegrityFactor>();
        var messages = new List<string>();

        var combined = $"{material.Headline} {material.Description}".Trim();
        if (string.IsNullOrWhiteSpace(combined))
        {
            factors.Add(Factor("content_presence", -60, "No content to evaluate."));
            score -= 60;
        }

        // Content depth and structure
        var wordCount = CountWords(combined);
        if (wordCount < 80)
        {
            factors.Add(Factor("content_depth", -20, $"Short article body ({wordCount} words)."));
            score -= 20;
        }
        else if (wordCount < 140)
        {
            factors.Add(Factor("content_depth", -8, $"Moderate article depth ({wordCount} words)."));
            score -= 8;
        }
        else
        {
            factors.Add(Factor("content_depth", +5, $"Sufficient article depth ({wordCount} words)."));
            score += 5;
        }

        // Source / citation quality
        var hasSourceUrl = !string.IsNullOrWhiteSpace(material.SourceUrl) && UrlRegex.IsMatch(material.SourceUrl);
        var hasInBodyCitation = UrlRegex.IsMatch(material.Description) || material.Description.Contains("according to", StringComparison.OrdinalIgnoreCase);
        if (!hasSourceUrl && !hasInBodyCitation)
        {
            factors.Add(Factor("source_evidence", -22, "No clear source URL or citation phrase detected."));
            score -= 22;
        }
        else if (hasSourceUrl)
        {
            factors.Add(Factor("source_evidence", +10, "Source URL provided."));
            score += 10;
        }
        else
        {
            factors.Add(Factor("source_evidence", +4, "Inline citation evidence detected."));
            score += 4;
        }

        // Sensationalism and language integrity
        var allCapsCount = AllCapsWordRegex.Matches(combined).Count;
        if (allCapsCount >= 3 || SensationalRegex.IsMatch(combined))
        {
            factors.Add(Factor("language_integrity", -14, "Potentially sensational wording detected."));
            score -= 14;
        }
        else
        {
            factors.Add(Factor("language_integrity", +3, "Language profile appears neutral."));
            score += 3;
        }

        // Repetition / duplicate detection
        var repetition = await EvaluateRepetitionAsync(material, cancellationToken);
        score += repetition.ScoreAdjustment;
        factors.AddRange(repetition.Factors);
        messages.AddRange(repetition.Messages);

        // Precedent checks from historical verification outcomes
        var precedent = await EvaluatePrecedentAsync(material, cancellationToken);
        score += precedent.ScoreAdjustment;
        factors.AddRange(precedent.Factors);
        messages.AddRange(precedent.Messages);

        // Truth status precedent from linked post
        if (!string.IsNullOrWhiteSpace(material.TruthStatus))
        {
            switch (material.TruthStatus)
            {
                case "false":
                case "disputed":
                    factors.Add(Factor("truth_precedent", -25, $"Linked post truth status is '{material.TruthStatus}'."));
                    score -= 25;
                    break;
                case "verified":
                case "expert_verified":
                case "source_verified":
                    factors.Add(Factor("truth_precedent", +10, $"Linked post truth status is '{material.TruthStatus}'."));
                    score += 10;
                    break;
            }
        }

        score = Math.Clamp(score, 0, 100);
        var heuristicRecommended = score >= 75
            ? "verified"
            : score >= 50
                ? "under_review"
                : "rejected";
        var recommended = heuristicRecommended;
        var approvalScore = Math.Round(score, 2);

        var llmDecision = await TryEvaluateViaNuRavenCorpLlmAsync(material, cancellationToken);
        if (llmDecision is not null)
        {
            recommended = llmDecision.RecommendedStatus;
            approvalScore = llmDecision.OverallScore;
            factors.Add(Factor("nuravencorpllm_decision", 0, llmDecision.Reason));
            messages.Add("Final approval decision assigned by NuRavenCorpLLM agent.");
        }
        else
        {
            messages.Add("NuRavenCorpLLM unavailable; fallback integrity heuristics applied.");
        }

        return new JournalismIntegrityEvaluationResult
        {
            ReportId = material.ReportId,
            PostId = material.PostId,
            OverallScore = approvalScore,
            ApprovedForPublication = recommended == "verified",
            RecommendedStatus = recommended,
            Reasons = factors.OrderBy(f => f.Weight).Take(6).Select(f => f.Reason).ToList(),
            Factors = factors.OrderBy(f => f.Name).ToList(),
            Messages = messages,
            EvaluatedAtUtc = DateTime.UtcNow
        };
    }

    private async Task<FactorEvaluation> EvaluateRepetitionAsync(
        JournalismMaterial material,
        CancellationToken cancellationToken)
    {
        var factors = new List<IntegrityFactor>();
        var messages = new List<string>();
        var scoreAdjustment = 0d;

        var since = DateTime.UtcNow.AddDays(-90);
        var rows = await _db.CompatJournalismReports
            .AsNoTracking()
            .Where(r => r.CreatedDate >= since
                        && (string.IsNullOrWhiteSpace(material.ReportId) || r.Id != material.ReportId))
            .OrderByDescending(r => r.CreatedDate)
            .Take(500)
            .Select(r => new
            {
                r.Id,
                r.Headline,
                r.Description,
                r.SourceUrl,
                r.VerificationStatus,
                r.CreatedDate
            })
            .ToListAsync(cancellationToken);

        var candidateText = $"{material.Headline} {material.Description}";
        var candidateTokens = Tokenize(candidateText);
        var normalizedHeadline = NormalizeText(material.Headline);
        var candidateDomain = ExtractDomain(material.SourceUrl);

        double maxSimilarity = 0;
        string? closestId = null;
        bool exactHeadlineDuplicate = false;
        bool sameSourceDuplicate = false;

        foreach (var row in rows)
        {
            var existingHeadline = NormalizeText(row.Headline);
            if (!string.IsNullOrWhiteSpace(normalizedHeadline)
                && string.Equals(normalizedHeadline, existingHeadline, StringComparison.Ordinal))
            {
                exactHeadlineDuplicate = true;
            }

            var sim = Jaccard(candidateTokens, Tokenize($"{row.Headline} {row.Description}"));
            if (sim > maxSimilarity)
            {
                maxSimilarity = sim;
                closestId = row.Id;
            }

            if (!string.IsNullOrWhiteSpace(candidateDomain)
                && string.Equals(candidateDomain, ExtractDomain(row.SourceUrl), StringComparison.OrdinalIgnoreCase)
                && sim >= 0.70)
            {
                sameSourceDuplicate = true;
            }
        }

        if (exactHeadlineDuplicate)
        {
            scoreAdjustment -= 35;
            factors.Add(Factor("repetition_exact_headline", -35, "Headline exactly matches a recent report."));
            messages.Add("Exact headline duplication detected.");
        }

        if (maxSimilarity >= 0.82)
        {
            scoreAdjustment -= 30;
            factors.Add(Factor("repetition_content_similarity", -30, $"Very high content similarity ({maxSimilarity:P0}) to recent report {closestId}."));
            messages.Add($"Closest similar report id: {closestId} ({maxSimilarity:P0}).");
        }
        else if (maxSimilarity >= 0.65)
        {
            scoreAdjustment -= 15;
            factors.Add(Factor("repetition_content_similarity", -15, $"Moderate/high content similarity ({maxSimilarity:P0}) detected."));
        }
        else
        {
            factors.Add(Factor("repetition_content_similarity", +4, "No substantial repetition detected in recent reports."));
            scoreAdjustment += 4;
        }

        if (sameSourceDuplicate)
        {
            scoreAdjustment -= 10;
            factors.Add(Factor("repetition_source_overlap", -10, "Likely duplicate from same source domain and similar text."));
        }

        return new FactorEvaluation(scoreAdjustment, factors, messages);
    }

    private async Task<FactorEvaluation> EvaluatePrecedentAsync(
        JournalismMaterial material,
        CancellationToken cancellationToken)
    {
        var factors = new List<IntegrityFactor>();
        var messages = new List<string>();
        var scoreAdjustment = 0d;

        var since = DateTime.UtcNow.AddDays(-180);
        var domain = ExtractDomain(material.SourceUrl);
        var region = material.Region?.Trim();

        var query = _db.CompatJournalismReports
            .AsNoTracking()
            .Where(r => r.CreatedDate >= since);

        if (!string.IsNullOrWhiteSpace(domain))
        {
            query = query.Where(r => r.SourceUrl != null && r.SourceUrl.Contains(domain));
        }
        else if (!string.IsNullOrWhiteSpace(region))
        {
            query = query.Where(r => r.Region == region);
        }

        var precedentRows = await query
            .Take(300)
            .Select(r => r.VerificationStatus)
            .ToListAsync(cancellationToken);

        var sampleSize = precedentRows.Count;
        if (sampleSize < 3)
        {
            factors.Add(Factor("precedent_sample", 0, "Insufficient historical sample for precedent weighting."));
            return new FactorEvaluation(scoreAdjustment, factors, messages);
        }

        var rejected = precedentRows.Count(s => string.Equals(s, "rejected", StringComparison.OrdinalIgnoreCase));
        var verified = precedentRows.Count(s => string.Equals(s, "verified", StringComparison.OrdinalIgnoreCase));
        var rejectedRatio = (double)rejected / sampleSize;
        var verifiedRatio = (double)verified / sampleSize;

        if (rejectedRatio >= 0.60)
        {
            scoreAdjustment -= 18;
            factors.Add(Factor("precedent_rejection_ratio", -18, $"High historical rejection ratio ({rejectedRatio:P0}) for similar precedent."));
            messages.Add($"Precedent sample={sampleSize}, rejected={rejected}, verified={verified}.");
        }
        else if (verifiedRatio >= 0.70)
        {
            scoreAdjustment += 10;
            factors.Add(Factor("precedent_verified_ratio", +10, $"Strong historical verification ratio ({verifiedRatio:P0}) for similar precedent."));
            messages.Add($"Precedent sample={sampleSize}, rejected={rejected}, verified={verified}.");
        }
        else
        {
            factors.Add(Factor("precedent_mixed", -4, $"Mixed precedent profile (verified {verifiedRatio:P0}, rejected {rejectedRatio:P0})."));
            scoreAdjustment -= 4;
        }

        return new FactorEvaluation(scoreAdjustment, factors, messages);
    }

    private static IntegrityFactor Factor(string name, double weight, string reason)
        => new()
        {
            Name = name,
            Weight = Math.Round(weight, 2),
            Reason = reason
        };

    private static string NormalizeText(string? input)
    {
        if (string.IsNullOrWhiteSpace(input))
        {
            return string.Empty;
        }

        var chars = input.ToLowerInvariant()
            .Where(ch => char.IsLetterOrDigit(ch) || char.IsWhiteSpace(ch))
            .ToArray();
        return string.Join(' ', new string(chars)
            .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
    }

    private static HashSet<string> Tokenize(string? input)
    {
        if (string.IsNullOrWhiteSpace(input))
        {
            return [];
        }

        var tokens = new HashSet<string>(StringComparer.Ordinal);
        foreach (Match match in WordRegex.Matches(input.ToLowerInvariant()))
        {
            var token = match.Value.Trim();
            if (token.Length >= 3)
            {
                tokens.Add(token);
            }
        }

        return tokens;
    }

    private static double Jaccard(HashSet<string> a, HashSet<string> b)
    {
        if (a.Count == 0 && b.Count == 0) return 1;
        if (a.Count == 0 || b.Count == 0) return 0;
        var intersection = a.Count(x => b.Contains(x));
        var union = a.Count + b.Count - intersection;
        return union == 0 ? 0 : (double)intersection / union;
    }

    private static int CountWords(string input)
        => WordRegex.Matches(input).Count;

    private static string ExtractDomain(string? url)
    {
        if (string.IsNullOrWhiteSpace(url))
        {
            return string.Empty;
        }

        try
        {
            if (!Uri.TryCreate(url, UriKind.Absolute, out var uri))
            {
                return string.Empty;
            }
            return uri.Host.Trim().ToLowerInvariant();
        }
        catch
        {
            return string.Empty;
        }
    }

    private void ApplyPublicationOutcome(CompatJournalismReport row, JournalismIntegrityEvaluationResult result)
    {
        row.VerificationStatus = result.RecommendedStatus;
        if (result.RecommendedStatus == "verified")
        {
            row.IsBlocked = false;
            row.QueueStatus = "queued_for_consumption";
            row.IsImmediatelyAvailable = true;
            row.ApprovedAtUtc = DateTime.UtcNow;
            row.ApprovedBy = "nuravencorpllm-agent";
            return;
        }

        row.IsBlocked = true;
        row.IsImmediatelyAvailable = false;
        row.ApprovedAtUtc = null;
        row.ApprovedBy = null;
        row.QueueStatus = result.RecommendedStatus == "rejected"
            ? "rejected"
            : "pending_review";
    }

    private async Task<NuRavenCorpDecision?> TryEvaluateViaNuRavenCorpLlmAsync(
        JournalismMaterial material,
        CancellationToken cancellationToken)
    {
        var prompt = string.Join("\n", [
            "You are NuRavenCorpLLM acting as the final journalism approval agent.",
            "Decide if this report should be available to end users immediately.",
            "Respond with JSON only and no markdown.",
            "Schema: {\"recommended_status\":\"verified|under_review|rejected\",\"overall_score\":0-100,\"reason\":\"short reason\"}",
            $"Headline: {material.Headline}",
            $"Description: {material.Description}",
            $"Source URL: {material.SourceUrl}",
            $"Region: {material.Region}",
            $"Linked Truth Status: {material.TruthStatus ?? "unknown"}"
        ]);

        try
        {
            var response = await _nuRavenCorpLlmChatService.ChatAsync(new AiChatRequest
            {
                Message = prompt,
                Model = "nuravencorpllm-assistant",
                UseCrawlerContext = false
            });

            if (!response.Success || string.IsNullOrWhiteSpace(response.Reply))
            {
                return null;
            }

            var jsonPayload = TryExtractJsonObject(response.Reply);
            if (string.IsNullOrWhiteSpace(jsonPayload))
            {
                return null;
            }

            using var doc = JsonDocument.Parse(jsonPayload);
            if (doc.RootElement.ValueKind != JsonValueKind.Object)
            {
                return null;
            }

            var statusRaw = doc.RootElement.TryGetProperty("recommended_status", out var statusNode)
                ? statusNode.GetString()
                : null;
            var reason = doc.RootElement.TryGetProperty("reason", out var reasonNode)
                ? reasonNode.GetString()
                : "Approval decision returned by NuRavenCorpLLM.";
            var normalizedStatus = NormalizeRecommendedStatus(statusRaw);
            if (normalizedStatus is null)
            {
                return null;
            }

            double score = 50;
            if (doc.RootElement.TryGetProperty("overall_score", out var scoreNode))
            {
                if (scoreNode.ValueKind == JsonValueKind.Number && scoreNode.TryGetDouble(out var numeric))
                {
                    score = numeric;
                }
                else if (scoreNode.ValueKind == JsonValueKind.String && double.TryParse(scoreNode.GetString(), out var parsed))
                {
                    score = parsed;
                }
            }

            return new NuRavenCorpDecision(
                normalizedStatus,
                Math.Round(Math.Clamp(score, 0, 100), 2),
                string.IsNullOrWhiteSpace(reason) ? "Approval decision returned by NuRavenCorpLLM." : reason.Trim());
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "NuRavenCorpLLM approval decision could not be parsed.");
            return null;
        }
    }

    private static string? NormalizeRecommendedStatus(string? status)
    {
        if (string.IsNullOrWhiteSpace(status))
        {
            return null;
        }

        return status.Trim().ToLowerInvariant() switch
        {
            "verified" or "approve" or "approved" => "verified",
            "under_review" or "review" or "pending" => "under_review",
            "rejected" or "reject" => "rejected",
            _ => null
        };
    }

    private static string? TryExtractJsonObject(string rawReply)
    {
        var text = rawReply.Trim();
        if (text.Length == 0)
        {
            return null;
        }

        if (text.StartsWith("```", StringComparison.Ordinal))
        {
            var cleaned = text.Replace("```json", string.Empty, StringComparison.OrdinalIgnoreCase)
                .Replace("```", string.Empty, StringComparison.Ordinal)
                .Trim();
            text = cleaned;
        }

        var start = text.IndexOf('{');
        var end = text.LastIndexOf('}');
        if (start < 0 || end <= start)
        {
            return null;
        }

        return text[start..(end + 1)];
    }
}

public sealed class JournalismIntegrityEvaluationRequest
{
    public string? ReportId { get; set; }
    public string? PostId { get; set; }
    public string? Headline { get; set; }
    public string? Description { get; set; }
    public string? SourceUrl { get; set; }
    public string? Region { get; set; }
    public bool ApplyDecision { get; set; }
}

public sealed class JournalismIntegrityEvaluationResult
{
    public string? ReportId { get; set; }
    public string? PostId { get; set; }
    public double OverallScore { get; set; }
    public bool ApprovedForPublication { get; set; }
    /// <summary>verified | under_review | rejected</summary>
    public string RecommendedStatus { get; set; } = "under_review";
    public List<string> Reasons { get; set; } = [];
    public List<IntegrityFactor> Factors { get; set; } = [];
    public List<string> Messages { get; set; } = [];
    public bool AppliedToReport { get; set; }
    public DateTime EvaluatedAtUtc { get; set; }
}

public sealed class IntegrityFactor
{
    public string Name { get; set; } = string.Empty;
    public double Weight { get; set; }
    public string Reason { get; set; } = string.Empty;
}

internal sealed class JournalismMaterial
{
    public string? ReportId { get; set; }
    public string? PostId { get; set; }
    public string Headline { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string SourceUrl { get; set; } = string.Empty;
    public string Region { get; set; } = string.Empty;
    public string? TruthStatus { get; set; }
}

internal sealed record FactorEvaluation(
    double ScoreAdjustment,
    List<IntegrityFactor> Factors,
    List<string> Messages);

internal sealed record NuRavenCorpDecision(
    string RecommendedStatus,
    double OverallScore,
    string Reason);
