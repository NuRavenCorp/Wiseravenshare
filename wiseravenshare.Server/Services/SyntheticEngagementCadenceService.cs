using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Infrastructure.Data;

namespace Wiseravenshare.Server.Services;

public sealed class SyntheticEngagementCadenceService
{
    private const string SyntheticMarker = "[TRANSPARENT_AI_SEED]";
    private static readonly HashSet<string> StopWords =
    [
        "this", "that", "with", "from", "have", "your", "about", "there", "their", "would",
        "could", "should", "will", "just", "what", "when", "where", "which", "into", "over",
        "under", "then", "than", "because", "while", "after", "before", "been", "being", "also",
        "they", "them", "ours", "ourselves", "post", "thread", "share", "shared", "using"
    ];

    private readonly AppDbContext _db;
    private readonly ILogger<SyntheticEngagementCadenceService> _logger;

    public SyntheticEngagementCadenceService(AppDbContext db, ILogger<SyntheticEngagementCadenceService> logger)
    {
        _db = db;
        _logger = logger;
    }

    public async Task<SyntheticCadenceRunResult> RunCycleAsync(SyntheticCadenceRunRequest request, CancellationToken ct)
    {
        var prefix = NormalizePrefix(request.Prefix);
        var domain = NormalizeDomain(request.EmailDomain);

        var bots = await _db.Users
            .Where(u => !u.IsDeleted &&
                        (u.Role == UserRole.AIAgent ||
                         u.Username.StartsWith(prefix + "_") ||
                         u.Email.EndsWith("@" + domain)))
            .OrderBy(u => u.Username)
            .ToListAsync(ct);

        if (bots.Count == 0)
        {
            return new SyntheticCadenceRunResult
            {
                BotCount = 0,
                CreatedPosts = 0,
                CreatedReplies = 0,
                Prefix = prefix,
                EmailDomain = domain,
                ActiveWindowOpen = false
            };
        }

        var now = DateTime.UtcNow;
        var cycleStart = ResolveCycleStart(now, request.ActiveStartHourUtc);
        var activeWindowEnd = cycleStart.AddHours(request.ActiveHours);
        var cycleEnd = cycleStart.AddHours(request.ActiveHours + request.RestHours);

        if (now >= activeWindowEnd || now < cycleStart)
        {
            return new SyntheticCadenceRunResult
            {
                BotCount = bots.Count,
                CreatedPosts = 0,
                CreatedReplies = 0,
                Prefix = prefix,
                EmailDomain = domain,
                ActiveWindowOpen = false,
                CycleStartUtc = cycleStart,
                CycleEndUtc = cycleEnd
            };
        }

        var botIds = bots.Select(b => b.Id).ToList();

        var existingPosts = await _db.Posts
            .Where(p => !p.IsDeleted && botIds.Contains(p.UserId) && p.CreatedAt >= cycleStart && p.CreatedAt < activeWindowEnd)
            .Select(p => new { p.Id, p.UserId, p.ReplyToId, p.CreatedAt })
            .ToListAsync(ct);

        var recentTargets = await _db.Posts
            .Where(p => !p.IsDeleted && p.CreatedAt >= now.AddHours(-36))
            .OrderByDescending(p => p.CreatedAt)
            .Take(1200)
            .Select(p => new { p.Id, p.UserId, p.Content, p.CreatedAt })
            .ToListAsync(ct);

        var createdPosts = 0;
        var createdReplies = 0;
        var newRows = new List<Post>();
        var random = Random.Shared;

        var slotTimes = Enumerable.Range(0, request.PostsPerCycle)
            .Select(i => cycleStart.AddHours(i * request.PostSpacingHours))
            .Where(slot => slot <= now)
            .ToList();

        foreach (var bot in bots)
        {
            var identity = BuildIdentity(bot);
            var botTopLevel = existingPosts.Where(p => p.UserId == bot.Id && p.ReplyToId == null).ToList();
            var botReplies = existingPosts.Where(p => p.UserId == bot.Id && p.ReplyToId != null).ToList();

            // 6 posts per 18h active cycle, roughly 3h apart.
            foreach (var slot in slotTimes)
            {
                var hasSlotPost = botTopLevel.Any(p => Math.Abs((p.CreatedAt - slot).TotalMinutes) <= request.AllowedSlotDriftMinutes);
                if (hasSlotPost) continue;

                var topic = PickTopic(request.TopicHints, random);
                newRows.Add(new Post
                {
                    UserId = bot.Id,
                    Content = ComposeTopLevel(identity, topic),
                    Type = PostType.Text,
                    IsSensitive = false,
                    CreatedAt = now,
                    UpdatedAt = now
                });
                createdPosts++;
            }

            // Minimum 4 replies per active cycle.
            var existingReplyCount = botReplies.Count;
            var deficit = Math.Max(0, request.MinRepliesPerCycle - existingReplyCount);
            if (deficit <= 0) continue;

            var repliedToSet = botReplies.Where(r => r.ReplyToId.HasValue).Select(r => r.ReplyToId!.Value).ToHashSet();
            var candidateTargets = recentTargets
                .Where(t => t.UserId != bot.Id && !repliedToSet.Contains(t.Id))
                .Take(300)
                .ToList();

            for (var i = 0; i < deficit && candidateTargets.Count > 0; i++)
            {
                var target = candidateTargets[random.Next(candidateTargets.Count)];
                candidateTargets.Remove(target);
                var topic = ExtractTopicFromPost(target.Content, request.TopicHints);

                newRows.Add(new Post
                {
                    UserId = bot.Id,
                    ReplyToId = target.Id,
                    Content = ComposeReply(identity, topic),
                    Type = PostType.Text,
                    IsSensitive = false,
                    CreatedAt = now,
                    UpdatedAt = now
                });
                createdReplies++;
            }
        }

        if (newRows.Count > 0)
        {
            await _db.Posts.AddRangeAsync(newRows, ct);
            await _db.SaveChangesAsync(ct);
        }

        _logger.LogInformation(
            "Transparent synthetic cadence run completed. Bots={Bots} Posts={Posts} Replies={Replies} CycleStart={CycleStart}",
            bots.Count,
            createdPosts,
            createdReplies,
            cycleStart);

        return new SyntheticCadenceRunResult
        {
            BotCount = bots.Count,
            CreatedPosts = createdPosts,
            CreatedReplies = createdReplies,
            Prefix = prefix,
            EmailDomain = domain,
            ActiveWindowOpen = true,
            CycleStartUtc = cycleStart,
            CycleEndUtc = cycleEnd
        };
    }

    private static DateTime ResolveCycleStart(DateTime nowUtc, int startHourUtc)
    {
        var clampedHour = Math.Clamp(startHourUtc, 0, 23);
        var cycleStart = new DateTime(nowUtc.Year, nowUtc.Month, nowUtc.Day, clampedHour, 0, 0, DateTimeKind.Utc);
        if (nowUtc < cycleStart) cycleStart = cycleStart.AddDays(-1);
        return cycleStart;
    }

    private static string PickTopic(IReadOnlyList<string> hints, Random random)
    {
        if (hints.Count > 0) return hints[random.Next(hints.Count)];
        var defaults = new[] { "community growth", "creator workflows", "trust and safety", "social discovery", "collaboration" };
        return defaults[random.Next(defaults.Length)];
    }

    private static string ExtractTopicFromPost(string? content, IReadOnlyList<string> fallbackHints)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return fallbackHints.Count > 0 ? fallbackHints[0] : "community discussion";
        }

        var text = content
            .Replace(SyntheticMarker, string.Empty, StringComparison.OrdinalIgnoreCase)
            .Replace("[SYNTHETIC_TEST]", string.Empty, StringComparison.OrdinalIgnoreCase)
            .Replace("\n", " ")
            .Trim();

        var words = text
            .Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Select(w => new string(w.Where(char.IsLetterOrDigit).ToArray()).ToLowerInvariant())
            .Where(w => w.Length >= 4 && !StopWords.Contains(w))
            .Take(40)
            .ToList();

        if (words.Count == 0)
        {
            return fallbackHints.Count > 0 ? fallbackHints[0] : "community discussion";
        }

        return string.Join(' ', words.Distinct().Take(3));
    }

    private static string ComposeTopLevel((string DisplayName, string CharacterId) identity, string topic)
        => $"{SyntheticMarker} [{identity.CharacterId}] {identity.DisplayName}: sharing a transparent seed post on {topic}.";

    private static string ComposeReply((string DisplayName, string CharacterId) identity, string topic)
        => $"{SyntheticMarker} [{identity.CharacterId}] {identity.DisplayName}: staying on-topic — this thread's key theme is {topic}.";

    private static (string DisplayName, string CharacterId) BuildIdentity(User bot)
    {
        var characterId = "AI-000";
        var display = string.IsNullOrWhiteSpace(bot.DisplayName) ? "AI Seed Persona" : bot.DisplayName;
        var marker = "CharacterId=";
        if (!string.IsNullOrWhiteSpace(bot.Bio))
        {
            var idx = bot.Bio.IndexOf(marker, StringComparison.OrdinalIgnoreCase);
            if (idx >= 0)
            {
                characterId = bot.Bio[(idx + marker.Length)..].Split('.', StringSplitOptions.RemoveEmptyEntries)[0].Trim();
            }
        }
        return (display, characterId);
    }

    private static string NormalizePrefix(string? input)
    {
        var value = string.IsNullOrWhiteSpace(input) ? "syntheticbot" : input.Trim().ToLowerInvariant();
        value = string.Concat(value.Where(char.IsLetterOrDigit));
        return string.IsNullOrWhiteSpace(value) ? "syntheticbot" : value;
    }

    private static string NormalizeDomain(string? input)
    {
        if (string.IsNullOrWhiteSpace(input)) return "synthetic.wise-ravens.local";
        var normalized = input.Trim().ToLowerInvariant();
        return normalized.StartsWith("@") ? normalized[1..] : normalized;
    }
}

public sealed class SyntheticCadenceRunRequest
{
    public int PostsPerCycle { get; set; } = 6;
    public int MinRepliesPerCycle { get; set; } = 4;
    public int PostSpacingHours { get; set; } = 3;
    public int ActiveHours { get; set; } = 18;
    public int RestHours { get; set; } = 6;
    public int ActiveStartHourUtc { get; set; } = 0;
    public int AllowedSlotDriftMinutes { get; set; } = 80;
    public string? Prefix { get; set; }
    public string? EmailDomain { get; set; }
    public List<string>? Topics { get; set; }

    public IReadOnlyList<string> TopicHints => (Topics ?? new List<string>())
        .Where(v => !string.IsNullOrWhiteSpace(v))
        .Select(v => v.Trim())
        .Distinct(StringComparer.OrdinalIgnoreCase)
        .Take(20)
        .ToList();
}

public sealed class SyntheticCadenceRunResult
{
    public int BotCount { get; set; }
    public int CreatedPosts { get; set; }
    public int CreatedReplies { get; set; }
    public string Prefix { get; set; } = string.Empty;
    public string EmailDomain { get; set; } = string.Empty;
    public bool ActiveWindowOpen { get; set; }
    public DateTime CycleStartUtc { get; set; }
    public DateTime CycleEndUtc { get; set; }
}

public sealed class SyntheticEngagementCadenceOptions
{
    public const string SectionName = "SyntheticEngagement:Cadence";

    public bool Enabled { get; set; } = true;
    public int PollIntervalMinutes { get; set; } = 30;
    public int PostsPerCycle { get; set; } = 6;
    public int MinRepliesPerCycle { get; set; } = 4;
    public int PostSpacingHours { get; set; } = 3;
    public int ActiveHours { get; set; } = 18;
    public int RestHours { get; set; } = 6;
    public int ActiveStartHourUtc { get; set; } = 0;
    public int AllowedSlotDriftMinutes { get; set; } = 80;
    public string? Prefix { get; set; }
    public string? EmailDomain { get; set; }
    public List<string> Topics { get; set; } = new();
}

public sealed class SyntheticEngagementCadenceHostedService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IOptions<SyntheticEngagementCadenceOptions> _options;
    private readonly IConfiguration _configuration;
    private readonly ILogger<SyntheticEngagementCadenceHostedService> _logger;

    public SyntheticEngagementCadenceHostedService(
        IServiceScopeFactory scopeFactory,
        IOptions<SyntheticEngagementCadenceOptions> options,
        IConfiguration configuration,
        ILogger<SyntheticEngagementCadenceHostedService> logger)
    {
        _scopeFactory = scopeFactory;
        _options = options;
        _configuration = configuration;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(TimeSpan.FromSeconds(20), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var syntheticEnabled = bool.TryParse(_configuration["SyntheticEngagement:Enabled"], out var enabled) && enabled;
                var options = _options.Value ?? new SyntheticEngagementCadenceOptions();

                if (syntheticEnabled && options.Enabled)
                {
                    await using var scope = _scopeFactory.CreateAsyncScope();
                    var service = scope.ServiceProvider.GetRequiredService<SyntheticEngagementCadenceService>();
                    await service.RunCycleAsync(new SyntheticCadenceRunRequest
                    {
                        PostsPerCycle = options.PostsPerCycle,
                        MinRepliesPerCycle = options.MinRepliesPerCycle,
                        PostSpacingHours = options.PostSpacingHours,
                        ActiveHours = options.ActiveHours,
                        RestHours = options.RestHours,
                        ActiveStartHourUtc = options.ActiveStartHourUtc,
                        AllowedSlotDriftMinutes = options.AllowedSlotDriftMinutes,
                        Prefix = options.Prefix,
                        EmailDomain = options.EmailDomain,
                        Topics = options.Topics
                    }, stoppingToken);
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogError(ex, "Transparent synthetic engagement cadence loop failed.");
            }

            var delayMinutes = Math.Clamp(_options.Value.PollIntervalMinutes, 5, 120);
            await Task.Delay(TimeSpan.FromMinutes(delayMinutes), stoppingToken);
        }
    }
}
