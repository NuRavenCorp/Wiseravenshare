using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.DTOs.Posting;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Entities.Personalization;
using Wiseravenshare.Server.Infrastructure.Data;
using Wiseravenshare.Server.Services.Affirmations;

namespace Wiseravenshare.Server.Services.Posting;

public interface IPostingAlgorithmService
{
    Task<IReadOnlyList<OptimalPostingWindowDto>> PredictOptimalPostingWindowsAsync(Guid userId, CancellationToken cancellationToken = default);
    PostHealthEvaluationDto EvaluatePostHealth(EvaluatePostHealthRequestDto request);
}

public sealed class PostingAlgorithmService : IPostingAlgorithmService
{
    private static readonly Regex HashtagRegex = new(@"#([a-zA-Z0-9_]{2,64})", RegexOptions.Compiled);
    private static readonly Regex RepetitionRegex = new(@"(.)\1{3,}", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex WordRegex = new(@"\b[a-zA-Z]{2,}\b", RegexOptions.Compiled);

    private static readonly HashSet<string> ConstructiveKeywords = new(StringComparer.OrdinalIgnoreCase)
    {
        "build", "create", "grow", "learn", "insight", "inspire", "solution", "vision",
        "progress", "forward", "resilience", "empower", "gratitude", "thankful", "truth",
        "community", "collaborate", "discovery", "future", "mindset", "balance", "strength"
    };

    private static readonly HashSet<string> LowQualitySpamPhrases = new(StringComparer.OrdinalIgnoreCase)
    {
        "click here", "dm me", "fast cash", "guaranteed return", "free crypto", "follow for follow",
        "f4f", "sub4sub", "check bio", "link in bio", "limited time offer", "urgent message"
    };

    private readonly AppDbContext _db;
    private readonly IAffirmationsAlgorithmService _affirmationsService;
    private readonly ILogger<PostingAlgorithmService> _logger;

    public PostingAlgorithmService(
        AppDbContext db,
        IAffirmationsAlgorithmService affirmationsService,
        ILogger<PostingAlgorithmService> logger)
    {
        _db = db;
        _affirmationsService = affirmationsService;
        _logger = logger;
    }

    public async Task<IReadOnlyList<OptimalPostingWindowDto>> PredictOptimalPostingWindowsAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var nowUtc = DateTime.UtcNow;
        var followerIds = await _db.UserFollows
            .AsNoTracking()
            .Where(f => f.FollowingId == userId)
            .Select(f => f.FollowerId)
            .Take(1000)
            .ToListAsync(cancellationToken);

        // Analyze audience interaction events over the past 60 days
        var cutoff = nowUtc.AddDays(-60);
        var audienceEvents = await _db.UserInteractionEvents
            .AsNoTracking()
            .Where(e => followerIds.Contains(e.UserId) && e.CreatedAt >= cutoff)
            .Select(e => new { e.CreatedAt, e.Type })
            .Take(5000)
            .ToListAsync(cancellationToken);

        // Distribution of active interactions across 7 days x 24 hours
        var grid = new double[7, 24];
        var totalAudienceEvents = audienceEvents.Count;

        if (totalAudienceEvents >= 20)
        {
            foreach (var evt in audienceEvents)
            {
                var dayIdx = (int)evt.CreatedAt.DayOfWeek;
                var hour = evt.CreatedAt.Hour;
                var weight = evt.Type switch
                {
                    InteractionEventType.Share => 2.5d,
                    InteractionEventType.Comment => 2.0d,
                    InteractionEventType.Like => 1.2d,
                    InteractionEventType.Complete => 1.5d,
                    _ => 1.0d
                };
                grid[dayIdx, hour] += weight;
            }
        }
        else
        {
            // Fallback: Global platform circadian engagement model
            for (var d = 0; d < 7; d++)
            {
                var isWeekend = (d == 0 || d == 6);
                for (var h = 0; h < 24; h++)
                {
                    // Diurnal curve with Morning peak (8-10 UTC), Midday peak (12-14 UTC), Evening peak (18-21 UTC)
                    var morningPeak = Math.Exp(-Math.Pow((h - 9), 2) / 8.0);
                    var middayPeak = Math.Exp(-Math.Pow((h - 13), 2) / 6.0);
                    var eveningPeak = Math.Exp(-Math.Pow((h - 19.5), 2) / 10.0);
                    var weekendOffset = isWeekend ? 0.85d : 1.15d;

                    grid[d, h] = (morningPeak * 0.75 + middayPeak * 0.85 + eveningPeak * 1.0) * weekendOffset;
                }
            }
        }

        // Kernel density smoothing across adjacent hours
        var smoothedGrid = new List<(DayOfWeek Day, int Hour, double Score)>();
        var maxScore = 0.001d;

        for (var d = 0; d < 7; d++)
        {
            var dayOfWeek = (DayOfWeek)d;
            for (var h = 0; h < 24; h++)
            {
                var prevH = (h + 23) % 24;
                var nextH = (h + 1) % 24;
                var smoothed = (grid[d, prevH] * 0.25d) + (grid[d, h] * 0.50d) + (grid[d, nextH] * 0.25d);
                if (smoothed > maxScore) maxScore = smoothed;
                smoothedGrid.Add((dayOfWeek, h, smoothed));
            }
        }

        // Rank and construct top recommendations
        var topWindows = smoothedGrid
            .OrderByDescending(w => w.Score)
            .Take(5)
            .Select(w =>
            {
                var density = Math.Clamp(w.Score / maxScore, 0.1d, 1.0d);
                var reachMultiplier = Math.Round(1.0 + (density * 1.4d), 2);
                var (slotLabel, focusCategory) = ClassifyPostingSlot(w.Hour);

                return new OptimalPostingWindowDto
                {
                    DayOfWeek = w.Day,
                    HourUtc = w.Hour,
                    LocalHourLabel = $"{w.Hour:D2}:00 UTC",
                    TimeSlotLabel = slotLabel,
                    ExpectedReachMultiplier = reachMultiplier,
                    AudienceActivityDensity = Math.Round(density, 3),
                    RecommendedCategory = focusCategory,
                    RecommendationConfidence = Math.Round(Math.Min(1.0, 0.4 + (totalAudienceEvents / 200.0)), 2)
                };
            })
            .ToList();

        return topWindows;
    }

    public PostHealthEvaluationDto EvaluatePostHealth(EvaluatePostHealthRequestDto request)
    {
        var content = request.Content?.Trim() ?? string.Empty;
        var feedback = new List<string>();
        var suggestions = new List<string>();

        if (string.IsNullOrWhiteSpace(content))
        {
            return new PostHealthEvaluationDto
            {
                ContentQualityScore = 0d,
                Feedback = new[] { "Post content is empty." },
                Suggestions = new[] { "Add thoughtful text, media, or reflection." }
            };
        }

        // 1. Lexical and length metrics
        var length = content.Length;
        var lengthScore = length switch
        {
            < 15 => 0.35d,
            < 50 => 0.65d,
            <= 500 => 1.0d,
            <= 1000 => 0.85d,
            _ => 0.60d
        };

        var words = WordRegex.Matches(content).Select(m => m.Value).ToList();
        var uniqueWords = words.Select(w => w.ToLowerInvariant()).Distinct().Count();
        var vocabularyDiversity = words.Count > 0 ? (double)uniqueWords / words.Count : 0d;

        // 2. Repetition & Spam risk heuristics
        var hasRepetitiveChars = RepetitionRegex.IsMatch(content);
        var spamPhraseMatches = LowQualitySpamPhrases.Count(phrase =>
            content.IndexOf(phrase, StringComparison.OrdinalIgnoreCase) >= 0);

        var spamRiskScore = 0.05d;
        if (hasRepetitiveChars) spamRiskScore += 0.25d;
        if (spamPhraseMatches > 0) spamRiskScore += Math.Min(0.60d, spamPhraseMatches * 0.30d);
        if (vocabularyDiversity < 0.35d && words.Count > 10) spamRiskScore += 0.20d;
        spamRiskScore = Math.Clamp(spamRiskScore, 0.0d, 1.0d);

        // 3. Hashtag saturation analysis
        var extractedTags = HashtagRegex.Matches(content).Select(m => m.Groups[1].Value).ToList();
        if (request.Hashtags != null && request.Hashtags.Length > 0)
        {
            extractedTags.AddRange(request.Hashtags.Select(t => t.Trim().TrimStart('#')));
        }
        var totalTags = extractedTags.Distinct(StringComparer.OrdinalIgnoreCase).Count();

        var (hashtagSaturationScore, hasExcessiveTags) = totalTags switch
        {
            0 => (0.75d, false),
            >= 1 and <= 3 => (1.0d, false),
            >= 4 and <= 6 => (0.70d, false),
            >= 7 and <= 10 => (0.40d, true),
            _ => (0.15d, true)
        };

        // 4. Constructive tone analysis
        var constructiveWordCount = words.Count(w => ConstructiveKeywords.Contains(w));
        var constructiveToneScore = Math.Clamp(0.50d + (constructiveWordCount * 0.12d) - (spamRiskScore * 0.40d), 0.1d, 1.0d);

        // 5. Readability scoring (Flesch-Kincaid proxy)
        var sentenceCount = Math.Max(1, content.Split(new[] { '.', '!', '?', '\n' }, StringSplitOptions.RemoveEmptyEntries).Length);
        var avgSentenceLength = (double)words.Count / sentenceCount;
        var readabilityScore = avgSentenceLength switch
        {
            >= 4 and <= 25 => 0.95d,
            < 4 => 0.70d,
            _ => Math.Clamp(1.0 - ((avgSentenceLength - 25) * 0.03), 0.3d, 0.9d)
        };

        // 6. Media enrichment
        var mediaCount = request.MediaUrls?.Length ?? 0;
        var mediaEnrichmentScore = mediaCount switch
        {
            0 => 0.50d,
            1 => 0.90d,
            2 or 3 => 1.0d,
            _ => 0.80d
        };

        // 7. Overall Content Quality Score
        var contentQualityScore = Math.Round(Math.Clamp(
            (lengthScore * 0.25d) +
            (vocabularyDiversity * 0.20d) +
            (constructiveToneScore * 0.25d) +
            (readabilityScore * 0.15d) +
            (hashtagSaturationScore * 0.15d) -
            (spamRiskScore * 0.35d),
            0.05d, 1.0d
        ), 3);

        // 8. Affirmation classification check
        var affirmationClassification = _affirmationsService.ClassifyText(content);

        // 9. Predicted engagement tier
        var predictedTier = (contentQualityScore, totalTags) switch
        {
            ( >= 0.85, <= 4) => "Breakout",
            ( >= 0.70, <= 6) => "HighVelocity",
            ( >= 0.50, _) => "Elevated",
            _ => "Standard"
        };

        // 10. Construct actionable feedback
        if (hasExcessiveTags)
        {
            feedback.Add($"Found {totalTags} hashtags. High hashtag saturation can trigger feed spam dampeners.");
            suggestions.Add("Keep hashtags between 2 and 4 targeted community tags for optimal reach.");
        }
        if (hasRepetitiveChars)
        {
            feedback.Add("Repetitive characters detected.");
            suggestions.Add("Smooth out elongated letter repetitions for better readability.");
        }
        if (spamRiskScore >= 0.40d)
        {
            feedback.Add("Detected phrases commonly associated with promotional or spam content.");
            suggestions.Add("Frame content around genuine insights or questions to boost community engagement.");
        }
        if (length < 30)
        {
            suggestions.Add("Adding context or questions often increases comment depth by 2.5x.");
        }
        if (mediaCount == 0 && request.PostType.Equals("Text", StringComparison.OrdinalIgnoreCase))
        {
            suggestions.Add("Posts with an image, audio clip, or quote visual receive higher viewer dwell time.");
        }
        if (affirmationClassification.IsAffirmation)
        {
            feedback.Add($"Identified as a high-resonance {affirmationClassification.PrimaryPillar} affirmation!");
        }

        return new PostHealthEvaluationDto
        {
            ContentQualityScore = contentQualityScore,
            ConstructiveToneScore = Math.Round(constructiveToneScore, 3),
            SpamRiskScore = Math.Round(spamRiskScore, 3),
            ReadabilityScore = Math.Round(readabilityScore, 3),
            HashtagSaturationScore = Math.Round(hashtagSaturationScore, 3),
            HasExcessiveHashtags = hasExcessiveTags,
            MediaEnrichmentScore = Math.Round(mediaEnrichmentScore, 3),
            PredictedEngagementTier = predictedTier,
            IsAffirmationCandidate = affirmationClassification.IsAffirmation,
            AffirmationPillar = affirmationClassification.IsAffirmation ? affirmationClassification.PrimaryPillar.ToString() : null,
            Feedback = feedback,
            Suggestions = suggestions
        };
    }

    private static (string SlotLabel, string FocusCategory) ClassifyPostingSlot(int hourUtc)
    {
        return hourUtc switch
        {
            >= 5 and < 11 => ("Morning Awakening", "Inspirational & Goal Setting"),
            >= 11 and < 15 => ("Midday Breakthrough", "Industry Insights & Case Studies"),
            >= 15 and < 18 => ("Afternoon Drive", "Discussions & Q&A"),
            >= 18 and < 22 => ("Evening Prime Resonance", "Deep Dives, Creative Media & Affirmations"),
            _ => ("Quiet Hours", "Global Audience & Reflections")
        };
    }
}
