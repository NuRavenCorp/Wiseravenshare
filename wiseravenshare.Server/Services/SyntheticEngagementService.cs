using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Infrastructure.Data;

namespace Wiseravenshare.Server.Services;

public sealed class SyntheticEngagementService
{
    private const string SyntheticMarker = "[SYNTHETIC_TEST]";
    private readonly AppDbContext _dbContext;
    private readonly ILogger<SyntheticEngagementService> _logger;

    public SyntheticEngagementService(AppDbContext dbContext, ILogger<SyntheticEngagementService> logger)
    {
        _dbContext = dbContext;
        _logger = logger;
    }

    public async Task<SyntheticBootstrapResult> EnsurePersonasAsync(SyntheticBootstrapRequest request, CancellationToken cancellationToken)
    {
        var desiredCount = Math.Clamp(request.BotCount, 1, 250);
        var prefix = NormalizePrefix(request.Prefix);
        var domain = NormalizeDomain(request.EmailDomain);

        var existingBots = await QuerySyntheticUsers(prefix, domain)
            .OrderBy(u => u.Username)
            .ToListAsync(cancellationToken);

        if (existingBots.Count >= desiredCount)
        {
            return new SyntheticBootstrapResult
            {
                RequestedCount = desiredCount,
                CreatedCount = 0,
                ExistingCount = existingBots.Count,
                TotalSyntheticCount = existingBots.Count,
                Prefix = prefix,
                EmailDomain = domain
            };
        }

        var usedUsernames = existingBots
            .Select(user => user.Username)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var usedEmails = existingBots
            .Select(user => user.Email)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var personasToCreate = new List<User>();
        var index = 1;

        while (existingBots.Count + personasToCreate.Count < desiredCount)
        {
            var username = $"{prefix}_{index:D3}";
            var email = $"{prefix}.{index:D3}@{domain}";

            if (usedUsernames.Contains(username) || usedEmails.Contains(email))
            {
                index++;
                continue;
            }

            var identity = BuildIdentity(index);
            personasToCreate.Add(new User
            {
                Email = email,
                Username = username,
                DisplayName = identity.DisplayName,
                PasswordHash = "synthetic-test-only",
                Bio = $"{SyntheticMarker} Synthetic persona for controlled engagement simulations. CharacterId={identity.CharacterId}.",
                AvatarUrl = null,
                CoverPhotoUrl = null,
                Location = identity.Location,
                Website = "https://wise-ravens.com/synthetic-test-persona",
                IsVerified = false,
                IsActive = true,
                IsPrivate = false,
                Role = UserRole.AIAgent,
                TruthScore = 50m,
                ReputationPoints = 0,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            });

            usedUsernames.Add(username);
            usedEmails.Add(email);
            index++;
        }

        if (personasToCreate.Count > 0)
        {
            await _dbContext.Users.AddRangeAsync(personasToCreate, cancellationToken);
            await _dbContext.SaveChangesAsync(cancellationToken);
        }

        var totalCount = await QuerySyntheticUsers(prefix, domain).CountAsync(cancellationToken);

        _logger.LogInformation(
            "Synthetic persona bootstrap completed. Requested={Requested} Created={Created} Total={Total} Prefix={Prefix} Domain={Domain}",
            desiredCount,
            personasToCreate.Count,
            totalCount,
            prefix,
            domain);

        return new SyntheticBootstrapResult
        {
            RequestedCount = desiredCount,
            CreatedCount = personasToCreate.Count,
            ExistingCount = existingBots.Count,
            TotalSyntheticCount = totalCount,
            Prefix = prefix,
            EmailDomain = domain
        };
    }

    public async Task<SyntheticRunResult> GenerateActivityAsync(SyntheticRunRequest request, CancellationToken cancellationToken)
    {
        var prefix = NormalizePrefix(request.Prefix);
        var domain = NormalizeDomain(request.EmailDomain);

        var personas = await QuerySyntheticUsers(prefix, domain)
            .OrderBy(user => user.Username)
            .ToListAsync(cancellationToken);

        if (personas.Count == 0)
        {
            return new SyntheticRunResult
            {
                BotCount = 0,
                CreatedPosts = 0,
                CreatedReplies = 0,
                Prefix = prefix,
                EmailDomain = domain
            };
        }

        var postsToCreate = Math.Clamp(request.PostsToCreate, 0, 5000);
        var repliesToCreate = Math.Clamp(request.RepliesToCreate, 0, 5000);

        var now = DateTime.UtcNow;
        var random = request.Seed.HasValue ? new Random(request.Seed.Value) : Random.Shared;

        var newPosts = new List<Post>(postsToCreate + repliesToCreate);

        for (var i = 0; i < postsToCreate; i++)
        {
            var author = personas[random.Next(personas.Count)];
            var identity = BuildIdentityFromUser(author);
            var content = ComposeTopLevelPost(identity, random, request.TopicHints);

            newPosts.Add(new Post
            {
                UserId = author.Id,
                Content = content,
                Type = PostType.Text,
                IsSensitive = false,
                CreatedAt = now.AddSeconds(-random.Next(0, 600)),
                UpdatedAt = now
            });
        }

        if (newPosts.Count > 0)
        {
            await _dbContext.Posts.AddRangeAsync(newPosts, cancellationToken);
            await _dbContext.SaveChangesAsync(cancellationToken);
        }

        var replyTargets = await _dbContext.Posts
            .Where(post => !post.IsDeleted)
            .OrderByDescending(post => post.CreatedAt)
            .Take(500)
            .ToListAsync(cancellationToken);

        var createdReplies = 0;
        if (replyTargets.Count > 0 && repliesToCreate > 0)
        {
            var replyPosts = new List<Post>(repliesToCreate);
            for (var i = 0; i < repliesToCreate; i++)
            {
                var author = personas[random.Next(personas.Count)];
                var candidateTargets = replyTargets.Where(target => target.UserId != author.Id).ToList();
                if (candidateTargets.Count == 0)
                {
                    break;
                }

                var parent = candidateTargets[random.Next(candidateTargets.Count)];
                var identity = BuildIdentityFromUser(author);
                var replyContent = ComposeReply(identity, random, request.TopicHints);

                replyPosts.Add(new Post
                {
                    UserId = author.Id,
                    Content = replyContent,
                    Type = PostType.Text,
                    ReplyToId = parent.Id,
                    IsSensitive = false,
                    CreatedAt = now.AddSeconds(-random.Next(0, 300)),
                    UpdatedAt = now
                });

                parent.CommentsCount += 1;
            }

            if (replyPosts.Count > 0)
            {
                await _dbContext.Posts.AddRangeAsync(replyPosts, cancellationToken);
                await _dbContext.SaveChangesAsync(cancellationToken);
                createdReplies = replyPosts.Count;
            }
        }

        _logger.LogInformation(
            "Synthetic activity run completed. Bots={Bots} CreatedPosts={Posts} CreatedReplies={Replies} Prefix={Prefix} Domain={Domain}",
            personas.Count,
            newPosts.Count,
            createdReplies,
            prefix,
            domain);

        return new SyntheticRunResult
        {
            BotCount = personas.Count,
            CreatedPosts = newPosts.Count,
            CreatedReplies = createdReplies,
            Prefix = prefix,
            EmailDomain = domain
        };
    }

    public async Task<SyntheticStatusResult> GetStatusAsync(SyntheticStatusRequest request, CancellationToken cancellationToken)
    {
        var prefix = NormalizePrefix(request.Prefix);
        var domain = NormalizeDomain(request.EmailDomain);

        var syntheticUserIds = await QuerySyntheticUsers(prefix, domain)
            .Select(user => user.Id)
            .ToListAsync(cancellationToken);

        var syntheticUserCount = syntheticUserIds.Count;
        if (syntheticUserCount == 0)
        {
            return new SyntheticStatusResult
            {
                BotCount = 0,
                PostsCount = 0,
                RepliesCount = 0,
                Prefix = prefix,
                EmailDomain = domain
            };
        }

        var postsCount = await _dbContext.Posts
            .Where(post => !post.IsDeleted && syntheticUserIds.Contains(post.UserId))
            .CountAsync(cancellationToken);

        var repliesCount = await _dbContext.Posts
            .Where(post => !post.IsDeleted && post.ReplyToId != null && syntheticUserIds.Contains(post.UserId))
            .CountAsync(cancellationToken);

        return new SyntheticStatusResult
        {
            BotCount = syntheticUserCount,
            PostsCount = postsCount,
            RepliesCount = repliesCount,
            Prefix = prefix,
            EmailDomain = domain
        };
    }

    private IQueryable<User> QuerySyntheticUsers(string prefix, string domain)
    {
        return _dbContext.Users
            .Where(user =>
                !user.IsDeleted &&
                (
                    user.Username.StartsWith(prefix + "_") ||
                    user.Email.EndsWith("@" + domain) ||
                    user.Role == UserRole.AIAgent
                ));
    }

    private static string NormalizePrefix(string? input)
    {
        var value = string.IsNullOrWhiteSpace(input)
            ? "syntheticbot"
            : input.Trim().ToLowerInvariant();

        value = string.Concat(value.Where(ch => char.IsLetterOrDigit(ch)));
        return string.IsNullOrWhiteSpace(value) ? "syntheticbot" : value;
    }

    private static string NormalizeDomain(string? input)
    {
        if (string.IsNullOrWhiteSpace(input))
        {
            return "synthetic.wise-ravens.local";
        }

        var normalized = input.Trim().ToLowerInvariant();
        return normalized.StartsWith("@") ? normalized[1..] : normalized;
    }

    private static SyntheticIdentity BuildIdentity(int index)
    {
        var archetypes = new[]
        {
            ("Analyst", "ANL", "Austin"),
            ("Researcher", "RSH", "Seattle"),
            ("Builder", "BLD", "Toronto"),
            ("Strategist", "STR", "Chicago"),
            ("Educator", "EDU", "Boston"),
            ("Journalist", "JRN", "New York"),
            ("Operator", "OPS", "Denver"),
            ("Creator", "CRT", "Los Angeles")
        };

        var selected = archetypes[(index - 1) % archetypes.Length];
        return new SyntheticIdentity(
            DisplayName: $"{selected.Item1} Persona {index:D3}",
            CharacterId: $"{selected.Item2}-{index:D3}",
            Location: selected.Item3);
    }

    private static SyntheticIdentity BuildIdentityFromUser(User user)
    {
        var characterId = "GEN-000";
        if (!string.IsNullOrWhiteSpace(user.Bio))
        {
            var marker = "CharacterId=";
            var index = user.Bio.IndexOf(marker, StringComparison.OrdinalIgnoreCase);
            if (index >= 0)
            {
                var segment = user.Bio[(index + marker.Length)..];
                characterId = segment.Split('.', StringSplitOptions.RemoveEmptyEntries)[0].Trim();
            }
        }

        return new SyntheticIdentity(
            DisplayName: string.IsNullOrWhiteSpace(user.DisplayName) ? "Synthetic Persona" : user.DisplayName,
            CharacterId: characterId,
            Location: string.IsNullOrWhiteSpace(user.Location) ? "Remote" : user.Location);
    }

    private static string ComposeTopLevelPost(SyntheticIdentity identity, Random random, IReadOnlyList<string> topicHints)
    {
        var themes = topicHints.Count > 0
            ? topicHints
            : new List<string>
            {
                "AI policy",
                "community verification",
                "news integrity",
                "creator economy",
                "social trust signals",
                "open-source tooling"
            };

        var starters = new[]
        {
            "Signal check:",
            "Field note:",
            "Quick takeaway:",
            "Experiment update:",
            "Community pulse:"
        };

        var actions = new[]
        {
            "What would improve this thread?",
            "Sharing for calibration feedback.",
            "Curious how others are validating claims.",
            "Testing how clarity impacts engagement.",
            "Looking for thoughtful counterpoints."
        };

        var topic = themes[random.Next(themes.Count)];
        var starter = starters[random.Next(starters.Length)];
        var action = actions[random.Next(actions.Length)];

        return $"{SyntheticMarker} [{identity.CharacterId}] {starter} Our synthetic {identity.DisplayName} is exploring {topic}. {action}";
    }

    private static string ComposeReply(SyntheticIdentity identity, Random random, IReadOnlyList<string> topicHints)
    {
        var acknowledgements = new[]
        {
            "Useful context.",
            "Thanks for sharing this.",
            "Interesting angle.",
            "Appreciate the detail.",
            "Strong point."
        };

        var prompts = topicHints.Count > 0
            ? topicHints
            : new List<string>
            {
                "source confidence",
                "timeline verification",
                "community moderation",
                "false-positive mitigation",
                "audience trust"
            };

        var nextSteps = new[]
        {
            "Could you share how you validated it?",
            "What evidence would move confidence higher?",
            "Do you see any competing explanation?",
            "Would a follow-up data point help?",
            "How should we summarize this for new readers?"
        };

        var opening = acknowledgements[random.Next(acknowledgements.Length)];
        var prompt = prompts[random.Next(prompts.Count)];
        var next = nextSteps[random.Next(nextSteps.Length)];

        return $"{SyntheticMarker} [{identity.CharacterId}] {opening} From this synthetic test persona, I am tracking {prompt}. {next}";
    }

    private sealed record SyntheticIdentity(string DisplayName, string CharacterId, string Location);
}

public sealed class SyntheticBootstrapRequest
{
    public int BotCount { get; set; } = 100;
    public string? Prefix { get; set; }
    public string? EmailDomain { get; set; }
}

public sealed class SyntheticBootstrapResult
{
    public int RequestedCount { get; set; }
    public int CreatedCount { get; set; }
    public int ExistingCount { get; set; }
    public int TotalSyntheticCount { get; set; }
    public string Prefix { get; set; } = string.Empty;
    public string EmailDomain { get; set; } = string.Empty;
}

public sealed class SyntheticRunRequest
{
    public int PostsToCreate { get; set; } = 120;
    public int RepliesToCreate { get; set; } = 180;
    public int? Seed { get; set; }
    public string? Prefix { get; set; }
    public string? EmailDomain { get; set; }
    public List<string>? Topics { get; set; }

    public IReadOnlyList<string> TopicHints => (Topics ?? new List<string>())
        .Where(value => !string.IsNullOrWhiteSpace(value))
        .Select(value => value.Trim())
        .Distinct(StringComparer.OrdinalIgnoreCase)
        .Take(25)
        .ToList();
}

public sealed class SyntheticRunResult
{
    public int BotCount { get; set; }
    public int CreatedPosts { get; set; }
    public int CreatedReplies { get; set; }
    public string Prefix { get; set; } = string.Empty;
    public string EmailDomain { get; set; } = string.Empty;
}

public sealed class SyntheticStatusRequest
{
    public string? Prefix { get; set; }
    public string? EmailDomain { get; set; }
}

public sealed class SyntheticStatusResult
{
    public int BotCount { get; set; }
    public int PostsCount { get; set; }
    public int RepliesCount { get; set; }
    public string Prefix { get; set; } = string.Empty;
    public string EmailDomain { get; set; } = string.Empty;
}