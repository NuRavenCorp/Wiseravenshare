using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.DTOs.Affirmations;
using Wiseravenshare.Server.DTOs.Post;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Entities.Currency;
using Wiseravenshare.Server.Entities.Personalization;
using Wiseravenshare.Server.Infrastructure.Data;
using Wiseravenshare.Server.Services.Currency;

namespace Wiseravenshare.Server.Services.Affirmations;

public interface IAffirmationsAlgorithmService
{
    AffirmationClassificationDto ClassifyText(string text);
    Task<DailyAffirmationDto> GetDailyAffirmationAsync(Guid userId, bool isFatigued = false, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<DailyAffirmationDto>> GetAffirmationStreamAsync(
        Guid userId,
        AffirmationPillar? pillar = null,
        CircadianPhase? phase = null,
        bool isFatigued = false,
        int count = 20,
        CancellationToken cancellationToken = default);
    Task<AffirmationReflectionResultDto> ReflectOnAffirmationAsync(
        Guid userId,
        Guid affirmationId,
        ReflectOnAffirmationRequestDto request,
        CancellationToken cancellationToken = default);
    Task<AffirmationStreakDto> GetUserAffirmationStreakAsync(Guid userId, CancellationToken cancellationToken = default);
}

public sealed class AffirmationsAlgorithmService : IAffirmationsAlgorithmService
{
    private static readonly Dictionary<AffirmationPillar, HashSet<string>> PillarLexicons = new()
    {
        [AffirmationPillar.Gratitude] = new(StringComparer.OrdinalIgnoreCase)
        {
            "grateful", "gratitude", "thankful", "blessed", "appreciate", "appreciation",
            "gift", "grace", "abundance", "cherish", "welcome", "treasure"
        },
        [AffirmationPillar.Resilience] = new(StringComparer.OrdinalIgnoreCase)
        {
            "resilience", "resilient", "overcome", "endure", "persevere", "strength",
            "unbroken", "rise", "storm", "steady", "weather", "anchor", "brave", "courage"
        },
        [AffirmationPillar.Growth] = new(StringComparer.OrdinalIgnoreCase)
        {
            "growth", "grow", "evolve", "progress", "learn", "transform", "potential",
            "discipline", "step by step", "practice", "journey", "bloom", "expand"
        },
        [AffirmationPillar.Mindfulness] = new(StringComparer.OrdinalIgnoreCase)
        {
            "breathe", "breath", "presence", "present", "stillness", "calm", "center",
            "clarity", "peace", "rest", "gentle", "mindful", "now", "release", "pause"
        },
        [AffirmationPillar.Empowerment] = new(StringComparer.OrdinalIgnoreCase)
        {
            "empower", "worthy", "capable", "sovereign", "claim", "power", "confident",
            "vision", "lead", "creator", "stand tall", "infinite", "limitless"
        },
        [AffirmationPillar.Compassion] = new(StringComparer.OrdinalIgnoreCase)
        {
            "kindness", "compassion", "empathy", "forgive", "forgiveness", "love",
            "unity", "heal", "healing", "belong", "together", "warmth", "community"
        },
        [AffirmationPillar.Wisdom] = new(StringComparer.OrdinalIgnoreCase)
        {
            "wisdom", "truth", "insight", "discernment", "perspective", "patience",
            "illuminate", "understand", "clarity", "deep", "guide", "light"
        }
    };

    private static readonly IReadOnlyList<CanonicalAffirmationSeed> SeedAffirmations = new CanonicalAffirmationSeed[]
    {
        new(
            Guid.Parse("11111111-1111-1111-1111-111111110001"),
            "I step forward with clarity and intention. Every breath fuels my quiet, unshakeable purpose.",
            AffirmationPillar.Empowerment,
            CircadianPhase.Morning,
            "What one small intention can guide your highest actions today?"
        ),
        new(
            Guid.Parse("11111111-1111-1111-1111-111111110002"),
            "When the storm is loud, I become the anchor. Resilience is not fighting the wave, but knowing I can swim.",
            AffirmationPillar.Resilience,
            CircadianPhase.Midday,
            "Where in your life can you replace struggle with steady composure right now?"
        ),
        new(
            Guid.Parse("11111111-1111-1111-1111-111111110003"),
            "I release what I cannot control and give sincere thanks for the quiet gifts of this day.",
            AffirmationPillar.Gratitude,
            CircadianPhase.Evening,
            "Name three simple things that supported or comforted you today."
        ),
        new(
            Guid.Parse("11111111-1111-1111-1111-111111110004"),
            "I pause, unclench, and breathe. Nothing is missing in this present moment.",
            AffirmationPillar.Mindfulness,
            CircadianPhase.Midday,
            "Take three deep breaths. Notice the stillness right beneath the noise."
        ),
        new(
            Guid.Parse("11111111-1111-1111-1111-111111110005"),
            "I am evolving every single day. Mastery is built through patient, repeated devotion to what matters.",
            AffirmationPillar.Growth,
            CircadianPhase.Morning,
            "What skill or mindset are you patiently tending to this week?"
        ),
        new(
            Guid.Parse("11111111-1111-1111-1111-111111110006"),
            "True strength is gentle. In offering empathy to others, I restore harmony within myself.",
            AffirmationPillar.Compassion,
            CircadianPhase.Evening,
            "Whom can you silently send goodwill or compassion to tonight?"
        ),
        new(
            Guid.Parse("11111111-1111-1111-1111-111111110007"),
            "Truth needs no loud defense; it endures in calm discernment. Wisdom is seeing through temporary tides.",
            AffirmationPillar.Wisdom,
            CircadianPhase.Midday,
            "What perspective shifts when you look at today's challenge from 5 years in the future?"
        )
    };

    private readonly AppDbContext _db;
    private readonly IWiseCoinService _wiseCoinService;
    private readonly ILogger<AffirmationsAlgorithmService> _logger;

    public AffirmationsAlgorithmService(
        AppDbContext db,
        IWiseCoinService wiseCoinService,
        ILogger<AffirmationsAlgorithmService> logger)
    {
        _db = db;
        _wiseCoinService = wiseCoinService;
        _logger = logger;
    }

    public AffirmationClassificationDto ClassifyText(string text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return new AffirmationClassificationDto
            {
                IsAffirmation = false,
                AffirmationScore = 0d,
                PrimaryPillar = AffirmationPillar.Wisdom,
                CircadianPhase = CircadianPhase.Morning
            };
        }

        var normalized = text.ToLowerInvariant();
        var words = Regex.Matches(normalized, @"\b[a-z]{3,}\b").Select(m => m.Value).ToHashSet();
        var matchedKeywords = new List<string>();

        var pillarScores = new Dictionary<AffirmationPillar, int>();
        foreach (var (pillar, lexicon) in PillarLexicons)
        {
            var count = 0;
            foreach (var keyword in lexicon)
            {
                if (normalized.Contains(keyword) || words.Contains(keyword))
                {
                    count++;
                    matchedKeywords.Add(keyword);
                }
            }
            pillarScores[pillar] = count;
        }

        var topPillar = pillarScores.OrderByDescending(p => p.Value).First();
        var secondaryPillars = pillarScores
            .Where(p => p.Key != topPillar.Key && p.Value > 0)
            .OrderByDescending(p => p.Value)
            .Select(p => p.Key)
            .Take(2)
            .ToList();

        var totalMatches = matchedKeywords.Distinct(StringComparer.OrdinalIgnoreCase).Count();

        // Calculate affirmation score based on keyword density and tone
        var wordCount = Math.Max(1, words.Count);
        var density = (double)totalMatches / Math.Min(30, wordCount);
        var baseScore = Math.Clamp(totalMatches * 0.25d + density * 0.35d, 0d, 1d);

        var isAffirmation = baseScore >= 0.45d || totalMatches >= 2;
        var circadianPhase = MapPillarToPhase(topPillar.Key);

        var isRestorative = topPillar.Key is AffirmationPillar.Mindfulness or AffirmationPillar.Compassion or AffirmationPillar.Gratitude;

        return new AffirmationClassificationDto
        {
            IsAffirmation = isAffirmation,
            AffirmationScore = Math.Round(baseScore, 3),
            PrimaryPillar = topPillar.Key,
            SecondaryPillars = secondaryPillars,
            CircadianPhase = circadianPhase,
            IsRestorativeForFatigue = isRestorative,
            MatchedKeywords = matchedKeywords.Distinct().ToList()
        };
    }

    public async Task<DailyAffirmationDto> GetDailyAffirmationAsync(Guid userId, bool isFatigued = false, CancellationToken cancellationToken = default)
    {
        var nowUtc = DateTime.UtcNow;
        var currentPhase = DetermineCurrentCircadianPhase(nowUtc.Hour);

        // Check if user already reflected today
        var todayStartUtc = new DateTime(nowUtc.Year, nowUtc.Month, nowUtc.Day, 0, 0, 0, DateTimeKind.Utc);
        var hasReflectedToday = await _db.UserInteractionEvents
            .AsNoTracking()
            .AnyAsync(e =>
                e.UserId == userId &&
                e.TargetType == "affirmation" &&
                e.CreatedAt >= todayStartUtc,
                cancellationToken);

        var streakInfo = await GetUserAffirmationStreakAsync(userId, cancellationToken);

        // If user is exhibiting feed fatigue, deliberately surface restorative mindfulness/peace
        CanonicalAffirmationSeed selectedSeed;
        if (isFatigued)
        {
            selectedSeed = SeedAffirmations.FirstOrDefault(a => a.Pillar == AffirmationPillar.Mindfulness)
                ?? SeedAffirmations[3];
        }
        else
        {
            // Select based on circadian phase and date hashing for daily consistency
            var dayOfYear = nowUtc.DayOfYear;
            var phaseCandidates = SeedAffirmations.Where(a => a.Phase == currentPhase).ToList();
            if (phaseCandidates.Count == 0) phaseCandidates = SeedAffirmations.ToList();

            selectedSeed = phaseCandidates[dayOfYear % phaseCandidates.Count];
        }

        // Count community reflections for this affirmation
        var reflectionCount = await _db.UserInteractionEvents
            .AsNoTracking()
            .CountAsync(e => e.TargetType == "affirmation" && e.TargetId == selectedSeed.Id, cancellationToken);

        // Effort-based reward calculation: base 0.25 WSC, scaling with streak up to 1.0 WSC
        var potentialReward = Math.Min(1.0m, 0.25m + (streakInfo.CurrentStreakDays * 0.10m));

        return new DailyAffirmationDto
        {
            Id = selectedSeed.Id,
            AffirmationText = selectedSeed.Text,
            Pillar = selectedSeed.Pillar,
            CircadianPhase = currentPhase,
            ReflectionPrompt = selectedSeed.ReflectionPrompt,
            AuthorName = "Raven Wisdom",
            IsCommunitySubmission = false,
            TotalReflectionsCount = reflectionCount,
            HasReflectedToday = hasReflectedToday,
            UserCurrentStreakDays = streakInfo.CurrentStreakDays,
            PotentialRewardWsc = potentialReward,
            IsFatigueCalmingRecommendation = isFatigued
        };
    }

    public async Task<IReadOnlyList<DailyAffirmationDto>> GetAffirmationStreamAsync(
        Guid userId,
        AffirmationPillar? pillar = null,
        CircadianPhase? phase = null,
        bool isFatigued = false,
        int count = 20,
        CancellationToken cancellationToken = default)
    {
        var result = new List<DailyAffirmationDto>();

        // 1. Gather filtered seed affirmations
        var filteredSeeds = SeedAffirmations.AsEnumerable();
        if (pillar.HasValue)
        {
            filteredSeeds = filteredSeeds.Where(s => s.Pillar == pillar.Value);
        }
        if (phase.HasValue)
        {
            filteredSeeds = filteredSeeds.Where(s => s.Phase == phase.Value);
        }
        if (isFatigued)
        {
            filteredSeeds = filteredSeeds.OrderByDescending(s =>
                s.Pillar is AffirmationPillar.Mindfulness or AffirmationPillar.Gratitude or AffirmationPillar.Compassion);
        }

        foreach (var seed in filteredSeeds)
        {
            result.Add(new DailyAffirmationDto
            {
                Id = seed.Id,
                AffirmationText = seed.Text,
                Pillar = seed.Pillar,
                CircadianPhase = seed.Phase,
                ReflectionPrompt = seed.ReflectionPrompt,
                AuthorName = "Raven Wisdom",
                IsCommunitySubmission = false,
                PotentialRewardWsc = 0.25m,
                IsFatigueCalmingRecommendation = isFatigued && (seed.Pillar is AffirmationPillar.Mindfulness or AffirmationPillar.Gratitude)
            });
        }

        // 2. Weave community posts categorized as affirmations
        var communityAffirmationPosts = await _db.Posts
            .AsNoTracking()
            .Include(p => p.User)
            .Where(p => !p.IsDeleted && p.Type == PostType.Affirmation)
            .OrderByDescending(p => p.CreatedAt)
            .Take(count)
            .ToListAsync(cancellationToken);

        foreach (var post in communityAffirmationPosts)
        {
            var classification = ClassifyText(post.Content);
            if (pillar.HasValue && classification.PrimaryPillar != pillar.Value) continue;

            result.Add(new DailyAffirmationDto
            {
                Id = post.Id,
                AffirmationText = post.Content,
                Pillar = classification.PrimaryPillar,
                CircadianPhase = classification.CircadianPhase,
                ReflectionPrompt = "Reflect on this insight from our community.",
                AuthorName = post.User?.DisplayName ?? post.User?.Username ?? "Community Member",
                IsCommunitySubmission = true,
                SourcePostId = post.Id,
                TotalReflectionsCount = post.LikesCount + post.CommentsCount,
                PotentialRewardWsc = 0.20m,
                IsFatigueCalmingRecommendation = isFatigued && classification.IsRestorativeForFatigue
            });
        }

        return result.Take(count).ToList();
    }

    public async Task<AffirmationReflectionResultDto> ReflectOnAffirmationAsync(
        Guid userId,
        Guid affirmationId,
        ReflectOnAffirmationRequestDto request,
        CancellationToken cancellationToken = default)
    {
        var nowUtc = DateTime.UtcNow;
        var todayStartUtc = new DateTime(nowUtc.Year, nowUtc.Month, nowUtc.Day, 0, 0, 0, DateTimeKind.Utc);

        var alreadyReflectedToday = await _db.UserInteractionEvents
            .AsNoTracking()
            .AnyAsync(e =>
                e.UserId == userId &&
                e.TargetType == "affirmation" &&
                e.CreatedAt >= todayStartUtc,
                cancellationToken);

        // 1. Record the interaction event
        var reflectionEvent = new UserInteractionEvent
        {
            UserId = userId,
            Type = InteractionEventType.Complete,
            TargetType = "affirmation",
            TargetId = affirmationId,
            DurationSeconds = request.DurationSeconds.GetValueOrDefault(30),
            TargetTitle = string.IsNullOrWhiteSpace(request.PersonalNote) ? "Mindful Reflection" : request.PersonalNote,
            CreatedAt = nowUtc
        };
        await _db.UserInteractionEvents.AddAsync(reflectionEvent, cancellationToken);

        // 2. Calculate streak
        var streakInfo = await GetUserAffirmationStreakAsync(userId, cancellationToken);
        var newStreak = streakInfo.CurrentStreakDays;
        if (!alreadyReflectedToday)
        {
            newStreak++;
        }

        // 3. Award effort-based WiseCoin reward
        var wscReward = 0m;
        if (!alreadyReflectedToday)
        {
            wscReward = Math.Min(1.0m, 0.25m + (newStreak * 0.08m));
            try
            {
                await _wiseCoinService.EarnWSCAsync(
                    userId,
                    wscReward,
                    TransactionType.EngagementReward,
                    $"Daily Mindful Affirmation Reflection ({newStreak}-day streak)",
                    applyMultipliers: true);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to award WiseCoin reward for affirmation reflection for user {UserId}", userId);
            }
        }

        // 4. Log UserActivity
        var activity = new UserActivity
        {
            ActorUserId = userId,
            ActivityType = UserActivityType.AffirmationReflected,
            TargetId = affirmationId,
            TargetType = "Affirmation",
            Summary = $"Reflected mindfully (Streak: {newStreak} days)",
            CreatedAt = nowUtc
        };
        await _db.UserActivities.AddAsync(activity, cancellationToken);

        // 5. Check milestone badges
        string? unlockedBadge = null;
        if (newStreak == 7)
        {
            await _wiseCoinService.AwardJobWellDoneBadgeAsync(userId, "affirmation_streak_7", 7);
            unlockedBadge = "Steady Mind (7-Day Streak)";
        }
        else if (newStreak == 30)
        {
            await _wiseCoinService.AwardJobWellDoneBadgeAsync(userId, "affirmation_streak_30", 30);
            unlockedBadge = "Resilience Sentinel (30-Day Streak)";
        }

        // 6. Optionally create linked community post
        Guid? createdPostId = null;
        if (request.ShareAsPost && !string.IsNullOrWhiteSpace(request.PersonalNote))
        {
            var seed = SeedAffirmations.FirstOrDefault(s => s.Id == affirmationId);
            var affirmationQuote = seed != null ? $"\"{seed.Text}\"\n\n" : "";
            var postContent = $"{affirmationQuote}Reflection: {request.PersonalNote.Trim()}\n\n#Wisdom #Affirmation #{seed?.Pillar ?? AffirmationPillar.Mindfulness}";

            var post = new Post
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                Content = postContent,
                Type = PostType.Affirmation,
                CreatedAt = nowUtc
            };
            await _db.Posts.AddAsync(post, cancellationToken);
            createdPostId = post.Id;
        }

        await _db.SaveChangesAsync(cancellationToken);

        return new AffirmationReflectionResultDto
        {
            Success = true,
            AffirmationId = affirmationId,
            StreakDays = newStreak,
            WscRewardEarned = wscReward,
            Message = alreadyReflectedToday
                ? "Reflection recorded! You've already maintained today's streak."
                : $"Daily reflection complete! {newStreak}-day streak active.",
            UnlockedBadge = unlockedBadge,
            CreatedPostId = createdPostId
        };
    }

    public async Task<AffirmationStreakDto> GetUserAffirmationStreakAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var nowUtc = DateTime.UtcNow;
        var today = nowUtc.Date;

        var reflectionDates = await _db.UserInteractionEvents
            .AsNoTracking()
            .Where(e => e.UserId == userId && e.TargetType == "affirmation")
            .Select(e => e.CreatedAt.Date)
            .Distinct()
            .OrderByDescending(d => d)
            .Take(120)
            .ToListAsync(cancellationToken);

        if (reflectionDates.Count == 0)
        {
            return new AffirmationStreakDto
            {
                CurrentStreakDays = 0,
                LongestStreakDays = 0,
                TotalReflectionsCompleted = 0,
                HasCompletedToday = false,
                TotalWiseCoinEarned = 0m,
                UnlockedPillars = Enum.GetValues<AffirmationPillar>()
            };
        }

        var hasCompletedToday = reflectionDates[0] == today;
        var currentStreak = 0;
        var cursor = hasCompletedToday ? today : today.AddDays(-1);

        foreach (var date in reflectionDates)
        {
            if (date == cursor)
            {
                currentStreak++;
                cursor = cursor.AddDays(-1);
            }
            else if (date < cursor)
            {
                break;
            }
        }

        // Calculate longest streak in sample
        var longestStreak = 0;
        var tempStreak = 0;
        DateTime? previousDate = null;

        var sortedAsc = reflectionDates.OrderBy(d => d).ToList();
        foreach (var date in sortedAsc)
        {
            if (previousDate == null || date == previousDate.Value.AddDays(1))
            {
                tempStreak++;
            }
            else
            {
                tempStreak = 1;
            }
            if (tempStreak > longestStreak) longestStreak = tempStreak;
            previousDate = date;
        }

        var totalCount = await _db.UserInteractionEvents
            .AsNoTracking()
            .CountAsync(e => e.UserId == userId && e.TargetType == "affirmation", cancellationToken);

        return new AffirmationStreakDto
        {
            CurrentStreakDays = currentStreak,
            LongestStreakDays = Math.Max(longestStreak, currentStreak),
            TotalReflectionsCompleted = totalCount,
            LastReflectedAtUtc = reflectionDates[0],
            HasCompletedToday = hasCompletedToday,
            TotalWiseCoinEarned = Math.Round(totalCount * 0.28m, 2),
            UnlockedPillars = Enum.GetValues<AffirmationPillar>()
        };
    }

    private static CircadianPhase DetermineCurrentCircadianPhase(int hourUtc)
    {
        return hourUtc switch
        {
            >= 5 and < 12 => CircadianPhase.Morning,
            >= 12 and < 18 => CircadianPhase.Midday,
            _ => CircadianPhase.Evening
        };
    }

    private static CircadianPhase MapPillarToPhase(AffirmationPillar pillar)
    {
        return pillar switch
        {
            AffirmationPillar.Empowerment or AffirmationPillar.Growth => CircadianPhase.Morning,
            AffirmationPillar.Resilience or AffirmationPillar.Wisdom => CircadianPhase.Midday,
            _ => CircadianPhase.Evening
        };
    }

    private sealed record CanonicalAffirmationSeed(
        Guid Id,
        string Text,
        AffirmationPillar Pillar,
        CircadianPhase Phase,
        string ReflectionPrompt);
}
