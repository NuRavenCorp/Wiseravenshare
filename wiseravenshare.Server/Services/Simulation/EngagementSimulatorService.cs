using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Infrastructure.Data;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Services.Simulation;

public sealed class EngagementPersonaState
{
    public string Key { get; set; } = string.Empty;
    public Guid UserId { get; set; }
    public string Username { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string Archetype { get; set; } = string.Empty;
    public string AvatarUrl { get; set; } = string.Empty;
    public string Bio { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public DateTime CycleStartedAtUtc { get; set; }
    public DateTime? LastPostAtUtc { get; set; }
    public DateTime? LastCommentAtUtc { get; set; }
    public DateTime? LastFollowAtUtc { get; set; }
    public bool IsResting { get; set; }
    public int PostsInCycle { get; set; }
    public int CommentsInCycle { get; set; }
    public int LifetimePosts { get; set; }
    public int LifetimeComments { get; set; }
    public int LifetimeFollows { get; set; }
    public int FollowersCount { get; set; }
    public int FollowingCount { get; set; }
}

public sealed class EngagementSimulatorStatus
{
    public bool IsActive { get; set; }
    public int TotalPersonas { get; set; }
    public int ActivePersonas { get; set; }
    public int RestingPersonas { get; set; }
    public int TotalLifetimePosts { get; set; }
    public int TotalLifetimeComments { get; set; }
    public int TotalFollowers { get; set; }
    public List<EngagementPersonaState> Personas { get; set; } = new();
}

public sealed class EngagementSimulatorService
{
    private static readonly TimeSpan ActiveDuration = TimeSpan.FromHours(28);
    private static readonly TimeSpan RestDuration = TimeSpan.FromHours(6);
    private static readonly TimeSpan TotalCycleDuration = ActiveDuration + RestDuration; // 34 hours
    private static readonly TimeSpan PostSpacing = TimeSpan.FromHours(3);
    private static readonly TimeSpan CommentSpacing = TimeSpan.FromHours(4.5); // ~6 comments per 28h active cycle (>= 4/day)

    private readonly IServiceProvider _serviceProvider;
    private readonly IWebHostEnvironment _env;
    private readonly UserStore _userStore;
    private readonly ILogger<EngagementSimulatorService> _logger;

    private readonly ConcurrentDictionary<string, EngagementPersonaState> _personaStates = new(StringComparer.OrdinalIgnoreCase);
    private readonly object _stateLock = new();
    private bool _initialized;

    public EngagementSimulatorService(
        IServiceProvider serviceProvider,
        IWebHostEnvironment env,
        UserStore userStore,
        ILogger<EngagementSimulatorService> logger)
    {
        _serviceProvider = serviceProvider;
        _env = env;
        _userStore = userStore;
        _logger = logger;
    }

    /// <summary>
    /// Loads persisted state or initializes persona accounts if first run.
    /// </summary>
    public async Task EnsureInitializedAsync(CancellationToken ct = default)
    {
        if (_initialized) return;

        lock (_stateLock)
        {
            if (_initialized) return;
            LoadPersistedState();
        }

        using var scope = _serviceProvider.CreateScope();
        AppDbContext? db = null;
        try
        {
            db = scope.ServiceProvider.GetService<AppDbContext>();
        }
        catch { }

        var postRepo = scope.ServiceProvider.GetService<Wiseravenshare.Server.Interfaces.Repositories.IPostRepository>();

        var now = DateTime.UtcNow;
        var index = 0;

        foreach (var persona in EngagementPersonaCatalog.Personas)
        {
            if (!_personaStates.TryGetValue(persona.Key, out var state) || state.UserId == Guid.Empty)
            {
                // Stagger initial cycle start across personas (0h, 2h, 4h... up to 26h offset)
                var staggerOffset = TimeSpan.FromHours((index * 2) % 26);
                var initialCycleStart = now.Subtract(staggerOffset);

                // Check UserStore first so we never depend on Postgres
                var email = $"{persona.EmailBase}@wiseravenshare.ai";
                var userRecord = _userStore.FindByLoginIdentifier(persona.HandleBase)
                    ?? _userStore.FindByLoginIdentifier(persona.DisplayName);

                if (userRecord == null && _userStore.TryGetByEmail(email, out var existingByEmail))
                {
                    userRecord = existingByEmail;
                }

                if (userRecord == null)
                {
                    var password = $"Raven!{persona.Key.Replace("_", "")}#2026";
                    userRecord = _userStore.CreateUser(
                        persona.DisplayName,
                        email,
                        password,
                        persona.Bio,
                        persona.Location,
                        "https://wiseravenshare.com",
                        persona.AvatarUrl,
                        persona.HandleBase);
                }

                var userId = Guid.TryParse(userRecord.Id, out var parsedGuid) ? parsedGuid : Guid.NewGuid();

                // Safely mirror to Postgres if database happens to be connected
                if (db != null)
                {
                    try
                    {
                        var existsInDb = await db.Users.AnyAsync(u => u.Id == userId || u.Username == persona.HandleBase, ct);
                        if (!existsInDb)
                        {
                            var dbUser = new User
                            {
                                Id = userId,
                                Email = email,
                                Username = userRecord.Handle ?? persona.HandleBase,
                                DisplayName = persona.DisplayName,
                                PasswordHash = userRecord.PasswordHash,
                                Bio = persona.Bio,
                                Location = persona.Location,
                                AvatarUrl = persona.AvatarUrl,
                                Role = UserRole.AIAgent,
                                IsActive = true,
                                TruthScore = 75.0m,
                                CreatedAt = now,
                                UpdatedAt = now
                            };
                            db.Users.Add(dbUser);
                            await db.SaveChangesAsync(ct);
                        }
                    }
                    catch { }
                }

                state = new EngagementPersonaState
                {
                    Key = persona.Key,
                    UserId = userId,
                    Username = userRecord.Handle ?? persona.HandleBase,
                    DisplayName = persona.DisplayName,
                    Archetype = persona.Archetype,
                    AvatarUrl = persona.AvatarUrl,
                    Bio = persona.Bio,
                    Email = email,
                    Password = "ExistingPassword#2026",
                    CycleStartedAtUtc = initialCycleStart,
                    IsResting = false,
                    PostsInCycle = 0,
                    CommentsInCycle = 0
                };

                _personaStates[persona.Key] = state;
            }

            // Ensure each persona has 2-3 authentic seed posts in PostRepository so bots are immediately visible across feeds
            if (postRepo != null)
            {
                try
                {
                    var existingPersonaPosts = await postRepo.GetUserPostsAsync(state.UserId, 1, 10);
                    var postCount = existingPersonaPosts?.Count() ?? 0;
                    if (postCount < 2)
                    {
                        var postsToSeed = Math.Min(3, persona.PostPool.Count);
                        for (int pIdx = 0; pIdx < postsToSeed; pIdx++)
                        {
                            var content = persona.PostPool[pIdx];
                            var postTime = now.AddHours(-1 * (index + pIdx * 4 + 1));
                            var seedPost = new Post
                            {
                                Id = Guid.NewGuid(),
                                UserId = state.UserId,
                                Content = content,
                                Type = PostType.Text,
                                IsSensitive = false,
                                TruthScore = 75.0m + (pIdx * 5),
                                TruthStatus = "Verified",
                                LikesCount = 5 + (index * 2) + pIdx,
                                RepostsCount = 1 + (index % 3),
                                CommentsCount = 1 + (index % 3),
                                ViewsCount = 45 + (index * 15),
                                CreatedAt = postTime,
                                UpdatedAt = postTime,
                                User = new User
                                {
                                    Id = state.UserId,
                                    Username = state.Username,
                                    DisplayName = persona.DisplayName,
                                    AvatarUrl = persona.AvatarUrl,
                                    Role = UserRole.AIAgent
                                }
                            };

                            await postRepo.AddAsync(seedPost);
                            state.LifetimePosts++;
                        }
                    }
                }
                catch (Exception seedEx)
                {
                    _logger.LogWarning(seedEx, "Failed seeding initial posts for persona @{Username}", state.Username);
                }
            }

            index++;
        }

        SavePersistedState();
        _initialized = true;
    }

    /// <summary>
    /// Executes a simulation cadence step: checks active vs rest states,
    /// publishes posts 3 hours apart during 28h active window,
    /// comments contextually on posts of users and other bots (>= 4 times/day),
    /// and triggers notifications.
    /// </summary>
    public async Task<int> RunCadenceTickAsync(CancellationToken ct = default)
    {
        await EnsureInitializedAsync(ct);

        using var scope = _serviceProvider.CreateScope();
        AppDbContext? db = null;
        try { db = scope.ServiceProvider.GetService<AppDbContext>(); } catch { }
        var postRepo = scope.ServiceProvider.GetService<Wiseravenshare.Server.Interfaces.Repositories.IPostRepository>();
        var notificationService = scope.ServiceProvider.GetService<INotificationService>();

        var now = DateTime.UtcNow;
        var actionsPerformed = 0;

        // Fetch recent candidate posts for comments and follows (from human users and other bots)
        List<Post> recentPosts = new();
        if (postRepo != null)
        {
            try
            {
                var candidateList = await postRepo.FindAsync(p => !p.IsDeleted && p.CreatedAt >= now.AddDays(-3));
                recentPosts = candidateList.OrderByDescending(p => p.CreatedAt).Take(100).ToList();
            }
            catch { }
        }

        if (recentPosts.Count == 0 && db != null)
        {
            try
            {
                recentPosts = await db.Posts
                    .AsNoTracking()
                    .Where(p => !p.IsDeleted && p.CreatedAt >= now.AddDays(-3))
                    .OrderByDescending(p => p.CreatedAt)
                    .Take(100)
                    .ToListAsync(ct);
            }
            catch { }
        }

        // ── Ensure bots follow all logged in and registered human users ──
        var followStore = scope.ServiceProvider.GetService<FollowStore>();
        if (followStore != null)
        {
            try
            {
                var allUsers = _userStore.GetAllUsersSnapshot();
                foreach (var u in allUsers)
                {
                    if (Guid.TryParse(u.Id, out var uGuid) && uGuid != Guid.Empty)
                    {
                        var isBot = EngagementPersonaCatalog.Personas.Any(p =>
                            string.Equals(p.HandleBase, u.Handle, StringComparison.OrdinalIgnoreCase) ||
                            string.Equals(p.DisplayName, u.Name, StringComparison.OrdinalIgnoreCase));

                        if (!isBot)
                        {
                            var followed = followStore.HaveBotsFollowUser(uGuid);
                            if (followed > 0) actionsPerformed += followed;
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Failed having bots follow registered users during cadence tick.");
            }
        }

        foreach (var persona in EngagementPersonaCatalog.Personas)
        {
            if (!_personaStates.TryGetValue(persona.Key, out var state)) continue;

            var elapsedInCycle = now - state.CycleStartedAtUtc;

            // Cycle Recycling check (after 28h active + 6h rest = 34h total)
            if (elapsedInCycle >= TotalCycleDuration)
            {
                _logger.LogInformation("Persona @{Username} completed full 34h cycle. Recycling to new active cycle.", state.Username);
                state.CycleStartedAtUtc = now;
                state.IsResting = false;
                state.PostsInCycle = 0;
                state.CommentsInCycle = 0;
                elapsedInCycle = TimeSpan.Zero;
            }
            // Rest check (after 28h active until 34h)
            else if (elapsedInCycle >= ActiveDuration)
            {
                state.IsResting = true;
            }
            else
            {
                state.IsResting = false;
            }

            // If currently resting, persona takes a break
            if (state.IsResting)
            {
                continue;
            }

            // ── ACTIVE WINDOW: Check if post is due (3 hours apart, 10 posts max per 28h cycle) ──
            var postDue = state.LastPostAtUtc == null || (now - state.LastPostAtUtc.Value) >= PostSpacing;
            if (postDue && state.PostsInCycle < 10)
            {
                try
                {
                    var postIndex = state.PostsInCycle % persona.PostPool.Count;
                    var content = persona.PostPool[postIndex];

                    var newPost = new Post
                    {
                        Id = Guid.NewGuid(),
                        UserId = state.UserId,
                        Content = content,
                        Type = PostType.Text,
                        IsSensitive = false,
                        TruthScore = 80m,
                        TruthStatus = "Verified",
                        LikesCount = 3 + (persona.Key.Length % 7),
                        ViewsCount = 25 + (persona.Key.Length * 3),
                        CreatedAt = now,
                        UpdatedAt = now,
                        User = new User
                        {
                            Id = state.UserId,
                            Username = state.Username,
                            DisplayName = persona.DisplayName,
                            AvatarUrl = persona.AvatarUrl,
                            Role = UserRole.AIAgent
                        }
                    };

                    if (postRepo != null)
                    {
                        await postRepo.AddAsync(newPost);
                    }
                    else if (db != null)
                    {
                        try
                        {
                            db.Posts.Add(newPost);
                            await db.SaveChangesAsync(ct);
                        }
                        catch { }
                    }

                    state.LastPostAtUtc = now;
                    state.PostsInCycle++;
                    state.LifetimePosts++;
                    actionsPerformed++;

                    _logger.LogInformation("Persona @{Username} published authentic post #{Count} in cycle: '{Snippet}'",
                        state.Username, state.PostsInCycle, content.Length > 50 ? content[..50] + "..." : content);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to publish post for persona @{Username}", state.Username);
                }
            }

            // ── ACTIVE WINDOW: Check if contextual comment is due (~4.5 hours apart, >= 4 per day) ──
            var commentDue = state.LastCommentAtUtc == null || (now - state.LastCommentAtUtc.Value) >= CommentSpacing;
            if (commentDue && recentPosts.Count > 0)
            {
                try
                {
                    // Select a post created by someone else (user or bot)
                    var eligiblePosts = recentPosts.Where(p => p.UserId != state.UserId).ToList();
                    if (eligiblePosts.Count > 0)
                    {
                        var targetPost = eligiblePosts[Random.Shared.Next(eligiblePosts.Count)];
                        var replyIndex = state.CommentsInCycle % persona.ReplyPool.Count;
                        var commentContent = persona.ReplyPool[replyIndex];

                        if (postRepo != null)
                        {
                            try
                            {
                                await postRepo.AddCommentAsync(targetPost.Id, state.UserId, commentContent);
                            }
                            catch { }
                        }
                        else if (db != null)
                        {
                            try
                            {
                                var comment = new Comment
                                {
                                    Id = Guid.NewGuid(),
                                    PostId = targetPost.Id,
                                    UserId = state.UserId,
                                    Content = commentContent,
                                    CreatedAt = now,
                                    UpdatedAt = now
                                };
                                db.Comments.Add(comment);
                                await db.SaveChangesAsync(ct);
                            }
                            catch { }
                        }

                        state.LastCommentAtUtc = now;
                        state.CommentsInCycle++;
                        state.LifetimeComments++;
                        actionsPerformed++;

                        // Notify the post owner if notification service is available
                        if (notificationService != null)
                        {
                            try
                            {
                                _ = notificationService.SendAsync(
                                    targetPost.UserId,
                                    NotificationType.Comment,
                                    actorId: state.UserId,
                                    postId: targetPost.Id,
                                    content: $"commented: \"{(commentContent.Length > 60 ? commentContent[..60] + "..." : commentContent)}\"",
                                    cancellationToken: ct);
                            }
                            catch { }
                        }

                        _logger.LogInformation("Persona @{Username} commented on post {PostId}: '{Snippet}'",
                            state.Username, targetPost.Id, commentContent.Length > 40 ? commentContent[..40] + "..." : commentContent);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to add comment for persona @{Username}", state.Username);
                }
            }

            // ── Occasional follow interaction (helps identify response ability and relationship scaling) ──
            var followDue = state.LastFollowAtUtc == null || (now - state.LastFollowAtUtc.Value) >= TimeSpan.FromHours(12);
            if (followDue && recentPosts.Count > 0 && db != null)
            {
                try
                {
                    var randomTargetUser = recentPosts.FirstOrDefault(p => p.UserId != state.UserId)?.UserId;
                    if (randomTargetUser.HasValue && randomTargetUser.Value != Guid.Empty)
                    {
                        var alreadyFollowing = await db.UserFollows.AnyAsync(
                            f => f.FollowerId == state.UserId && f.FollowingId == randomTargetUser.Value && !f.IsDeleted, ct);

                        if (!alreadyFollowing)
                        {
                            db.UserFollows.Add(new Follow
                            {
                                FollowerId = state.UserId,
                                FollowingId = randomTargetUser.Value,
                                CreatedAt = now,
                                UpdatedAt = now
                            });
                            await db.SaveChangesAsync(ct);

                            state.LastFollowAtUtc = now;
                            state.LifetimeFollows++;
                            actionsPerformed++;

                            if (notificationService != null)
                            {
                                _ = notificationService.SendAsync(
                                    randomTargetUser.Value,
                                    NotificationType.Follow,
                                    actorId: state.UserId,
                                    content: "started following you",
                                    cancellationToken: ct);
                            }

                            _logger.LogInformation("Persona @{Username} followed user {TargetUserId}", state.Username, randomTargetUser.Value);
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogDebug(ex, "Failed follow action for persona @{Username}", state.Username);
                }
            }
        }

        SavePersistedState();
        return actionsPerformed;
    }

    public EngagementSimulatorStatus GetStatus()
    {
        var followStore = _serviceProvider.GetService<FollowStore>();
        var personas = _personaStates.Values.OrderBy(p => p.Username).ToList();

        if (followStore != null)
        {
            foreach (var p in personas)
            {
                p.FollowersCount = followStore.GetFollowersCount(p.UserId, p.Key);
                p.FollowingCount = followStore.GetFollowingCount(p.UserId, p.Key);
            }
        }

        return new EngagementSimulatorStatus
        {
            IsActive = true,
            TotalPersonas = personas.Count,
            ActivePersonas = personas.Count(p => !p.IsResting),
            RestingPersonas = personas.Count(p => p.IsResting),
            TotalLifetimePosts = personas.Sum(p => p.LifetimePosts),
            TotalLifetimeComments = personas.Sum(p => p.LifetimeComments),
            TotalFollowers = personas.Sum(p => p.FollowersCount),
            Personas = personas
        };
    }

    private void LoadPersistedState()
    {
        try
        {
            var filePath = ResolveStateFilePath();
            if (File.Exists(filePath))
            {
                var json = File.ReadAllText(filePath);
                var items = JsonSerializer.Deserialize<List<EngagementPersonaState>>(json);
                if (items != null)
                {
                    foreach (var item in items)
                    {
                        _personaStates[item.Key] = item;
                    }
                    _logger.LogInformation("Loaded {Count} engagement persona states from {Path}", items.Count, filePath);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed loading engagement persona states; starting fresh.");
        }
    }

    private void SavePersistedState()
    {
        try
        {
            var items = _personaStates.Values.ToList();
            var json = JsonSerializer.Serialize(items, new JsonSerializerOptions { WriteIndented = true });

            var candidatePaths = GetCandidateStateFilePaths();
            foreach (var path in candidatePaths)
            {
                var dir = Path.GetDirectoryName(path);
                if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                {
                    Directory.CreateDirectory(dir);
                }
                File.WriteAllText(path, json);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed persisting engagement persona states.");
        }
    }

    private string ResolveStateFilePath()
    {
        var paths = GetCandidateStateFilePaths();
        foreach (var p in paths)
        {
            if (File.Exists(p)) return p;
        }
        return paths[0];
    }

    private string[] GetCandidateStateFilePaths()
    {
        const string filename = "engagement_personas_state.json";
        var contentRootAppData = Path.Combine(_env.ContentRootPath, "App_Data", filename);
        var baseDirAppData = Path.Combine(AppContext.BaseDirectory, "App_Data", filename);
        return new[] { contentRootAppData, baseDirAppData };
    }
}
