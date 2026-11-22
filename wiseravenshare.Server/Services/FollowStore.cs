using System.Collections.Concurrent;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Infrastructure.Data;

namespace Wiseravenshare.Server.Services;

public sealed class FollowRecord
{
    public Guid FollowerId { get; set; }
    public Guid FollowingId { get; set; }
    public string? PersonaKey { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class FollowTallyDto
{
    public int FollowingCount { get; set; }
    public int FollowersCount { get; set; }
    public List<Guid> FollowingIds { get; set; } = new();
    public Dictionary<string, PersonaFollowTallyDto> Personas { get; set; } = new();
    public int TotalFlockFollowers { get; set; }
}

public sealed class PersonaFollowTallyDto
{
    public string Key { get; set; } = string.Empty;
    public Guid UserId { get; set; }
    public string Username { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string Archetype { get; set; } = string.Empty;
    public string AvatarUrl { get; set; } = string.Empty;
    public int FollowersCount { get; set; }
    public int FollowingCount { get; set; }
    public bool IsFollowing { get; set; }
}

public sealed class FollowPersistedData
{
    public List<FollowRecord> Records { get; set; } = new();
    public Dictionary<string, int> PersonaBaseTallies { get; set; } = new();
    public Dictionary<string, int> PersonaBaseFollowing { get; set; } = new();
}

public class FollowStore
{
    private readonly IWebHostEnvironment _env;
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<FollowStore> _logger;

    private readonly ConcurrentDictionary<Guid, HashSet<Guid>> _userFollowing = new();
    private readonly ConcurrentDictionary<Guid, HashSet<Guid>> _userFollowers = new();
    private readonly ConcurrentDictionary<string, int> _personaBaseFollowers = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, int> _personaBaseFollowing = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, Guid> _personaKeyToUserId = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<Guid, string> _userIdToPersonaKey = new();
    private readonly object _fileLock = new();
    private string? _filePath;

    // Authentic initial baseline follower counts for all 14 personas
    private static readonly Dictionary<string, int> DefaultPersonaTallies = new(StringComparer.OrdinalIgnoreCase)
    {
        ["marcus_vance"] = 342,
        ["novapulse"] = 518,
        ["seraphinabloom"] = 284,
        ["cipher_chen"] = 419,
        ["elena_investigates"] = 672,
        ["tariq_quantum"] = 215,
        ["kitsune_draws"] = 789,
        ["devante_civic"] = 395,
        ["maya_astronomy"] = 482,
        ["zane_solarpunk"] = 314,
        ["aurelia_sound"] = 560,
        ["kai_zen"] = 290,
        ["sora_writer"] = 375,
        ["orion_deepsea"] = 240
    };

    // Authentic initial baseline following counts for all 14 personas
    private static readonly Dictionary<string, int> DefaultPersonaFollowing = new(StringComparer.OrdinalIgnoreCase)
    {
        ["marcus_vance"] = 42,
        ["novapulse"] = 68,
        ["seraphinabloom"] = 35,
        ["cipher_chen"] = 54,
        ["elena_investigates"] = 89,
        ["tariq_quantum"] = 28,
        ["kitsune_draws"] = 95,
        ["devante_civic"] = 47,
        ["maya_astronomy"] = 61,
        ["zane_solarpunk"] = 39,
        ["aurelia_sound"] = 73,
        ["kai_zen"] = 31,
        ["sora_writer"] = 52,
        ["orion_deepsea"] = 33
    };

    public FollowStore(
        IWebHostEnvironment env,
        IServiceProvider serviceProvider,
        ILogger<FollowStore> logger)
    {
        _env = env;
        _serviceProvider = serviceProvider;
        _logger = logger;

        Initialize();
    }

    private void Initialize()
    {
        try
        {
            var contentRoot = _env?.ContentRootPath ?? AppDomain.CurrentDomain.BaseDirectory;
            var appDataDir = Path.Combine(contentRoot, "App_Data");
            if (!Directory.Exists(appDataDir))
            {
                Directory.CreateDirectory(appDataDir);
            }
            _filePath = Path.Combine(appDataDir, "follows.json");

            // Seed default baselines
            foreach (var kvp in DefaultPersonaTallies)
            {
                _personaBaseFollowers[kvp.Key] = kvp.Value;
            }
            foreach (var kvp in DefaultPersonaFollowing)
            {
                _personaBaseFollowing[kvp.Key] = kvp.Value;
            }

            LoadPersistedData();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed initializing FollowStore from disk.");
        }
    }

    public void RegisterPersona(string key, Guid userId, string username)
    {
        if (string.IsNullOrWhiteSpace(key)) return;
        _personaKeyToUserId[key] = userId;
        _personaKeyToUserId[username] = userId;
        if (userId != Guid.Empty)
        {
            _userIdToPersonaKey[userId] = key;
        }
    }

    public bool IsFollowing(Guid followerId, Guid targetUserId, string? personaKeyOrUsername = null)
    {
        if (followerId == Guid.Empty) return false;

        var targetId = targetUserId;
        if (targetId == Guid.Empty && !string.IsNullOrWhiteSpace(personaKeyOrUsername))
        {
            if (_personaKeyToUserId.TryGetValue(personaKeyOrUsername, out var pid))
            {
                targetId = pid;
            }
        }

        if (targetId == Guid.Empty) return false;

        if (_userFollowing.TryGetValue(followerId, out var set))
        {
            lock (set)
            {
                return set.Contains(targetId);
            }
        }

        return false;
    }

    public int GetFollowersCount(Guid targetUserId, string? personaKeyOrUsername = null)
    {
        var targetId = targetUserId;
        string? personaKey = null;

        if (!string.IsNullOrWhiteSpace(personaKeyOrUsername))
        {
            personaKey = personaKeyOrUsername;
            if (targetId == Guid.Empty && _personaKeyToUserId.TryGetValue(personaKeyOrUsername, out var pid))
            {
                targetId = pid;
            }
        }
        else if (targetId != Guid.Empty && _userIdToPersonaKey.TryGetValue(targetId, out var pk))
        {
            personaKey = pk;
        }

        var baseTally = 0;
        if (!string.IsNullOrWhiteSpace(personaKey) && _personaBaseFollowers.TryGetValue(personaKey, out var b))
        {
            baseTally = b;
        }

        var realFollowers = 0;
        if (targetId != Guid.Empty && _userFollowers.TryGetValue(targetId, out var followersSet))
        {
            lock (followersSet)
            {
                realFollowers = followersSet.Count;
            }
        }

        return Math.Max(0, baseTally + realFollowers);
    }

    public int GetFollowingCount(Guid followerId, string? personaKeyOrUsername = null)
    {
        var targetId = followerId;
        string? personaKey = null;

        if (!string.IsNullOrWhiteSpace(personaKeyOrUsername))
        {
            personaKey = personaKeyOrUsername;
            if (targetId == Guid.Empty && _personaKeyToUserId.TryGetValue(personaKeyOrUsername, out var pid))
            {
                targetId = pid;
            }
        }
        else if (targetId != Guid.Empty && _userIdToPersonaKey.TryGetValue(targetId, out var pk))
        {
            personaKey = pk;
        }

        var baseTally = 0;
        if (!string.IsNullOrWhiteSpace(personaKey) && _personaBaseFollowing.TryGetValue(personaKey, out var b))
        {
            baseTally = b;
        }

        var realFollowing = 0;
        if (targetId != Guid.Empty && _userFollowing.TryGetValue(targetId, out var set))
        {
            lock (set)
            {
                realFollowing = set.Count;
            }
        }

        return Math.Max(0, baseTally + realFollowing);
    }

    public IReadOnlyList<Guid> GetFollowingIds(Guid followerId)
    {
        if (followerId == Guid.Empty) return Array.Empty<Guid>();

        if (_userFollowing.TryGetValue(followerId, out var set))
        {
            lock (set)
            {
                return set.ToList();
            }
        }

        return Array.Empty<Guid>();
    }

    public bool ToggleFollow(
        Guid followerId,
        Guid targetUserId,
        string? personaKeyOrUsername,
        out bool nowFollowing,
        out int followersCount,
        out int followingCount)
    {
        var targetId = targetUserId;
        string? personaKey = null;

        if (!string.IsNullOrWhiteSpace(personaKeyOrUsername))
        {
            personaKey = personaKeyOrUsername;
            if (targetId == Guid.Empty && _personaKeyToUserId.TryGetValue(personaKeyOrUsername, out var pid))
            {
                targetId = pid;
            }
        }
        else if (targetId != Guid.Empty && _userIdToPersonaKey.TryGetValue(targetId, out var pk))
        {
            personaKey = pk;
        }

        if (targetId == Guid.Empty)
        {
            // Create a deterministic persona Guid if target user ID wasn't provided yet
            if (!string.IsNullOrWhiteSpace(personaKey))
            {
                targetId = DeterministicGuid(personaKey);
                _personaKeyToUserId[personaKey] = targetId;
                _userIdToPersonaKey[targetId] = personaKey;
            }
            else
            {
                nowFollowing = false;
                followersCount = 0;
                followingCount = 0;
                return false;
            }
        }

        // 1. Update following list of follower
        var followingSet = _userFollowing.GetOrAdd(followerId, _ => new HashSet<Guid>());
        var followersSet = _userFollowers.GetOrAdd(targetId, _ => new HashSet<Guid>());

        lock (followingSet)
        {
            lock (followersSet)
            {
                if (followingSet.Contains(targetId))
                {
                    followingSet.Remove(targetId);
                    followersSet.Remove(followerId);
                    nowFollowing = false;
                }
                else
                {
                    followingSet.Add(targetId);
                    followersSet.Add(followerId);
                    nowFollowing = true;
                }

                followingCount = followingSet.Count;
            }
        }

        followersCount = GetFollowersCount(targetId, personaKey);
        var isNowFollowing = nowFollowing;

        // Async save to disk
        _ = Task.Run(SavePersistedData);

        // Safe background mirror to Postgres if DB is online
        _ = Task.Run(async () =>
        {
            try
            {
                using var scope = _serviceProvider.CreateScope();
                var db = scope.ServiceProvider.GetService<AppDbContext>();
                if (db != null)
                {
                    var existing = await db.UserFollows.FirstOrDefaultAsync(
                        f => f.FollowerId == followerId && f.FollowingId == targetId && !f.IsDeleted);

                    if (isNowFollowing && existing == null)
                    {
                        db.UserFollows.Add(new Follow
                        {
                            FollowerId = followerId,
                            FollowingId = targetId,
                            CreatedAt = DateTime.UtcNow,
                            UpdatedAt = DateTime.UtcNow
                        });
                        await db.SaveChangesAsync();
                    }
                    else if (!isNowFollowing && existing != null)
                    {
                        db.UserFollows.Remove(existing);
                        await db.SaveChangesAsync();
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Mirroring follow to AppDbContext bypassed (offline/disconnected).");
            }
        });

        return true;
    }

    /// <summary>
    /// Ensures all authentic Flock creator bot personas follow the target user.
    /// Returns the number of bot follow relations established.
    /// </summary>
    public int HaveBotsFollowUser(Guid targetUserId)
    {
        if (targetUserId == Guid.Empty) return 0;

        var botsFollowed = 0;
        var followersSet = _userFollowers.GetOrAdd(targetUserId, _ => new HashSet<Guid>());

        foreach (var personaKey in DefaultPersonaTallies.Keys)
        {
            var botGuid = _personaKeyToUserId.TryGetValue(personaKey, out var id) && id != Guid.Empty
                ? id
                : DeterministicGuid(personaKey);

            _personaKeyToUserId[personaKey] = botGuid;
            _userIdToPersonaKey[botGuid] = personaKey;

            if (botGuid == targetUserId) continue; // Don't self-follow

            var followingSet = _userFollowing.GetOrAdd(botGuid, _ => new HashSet<Guid>());

            lock (followingSet)
            {
                lock (followersSet)
                {
                    if (!followingSet.Contains(targetUserId))
                    {
                        followingSet.Add(targetUserId);
                        followersSet.Add(botGuid);
                        botsFollowed++;
                    }
                }
            }
        }

        if (botsFollowed > 0)
        {
            _ = Task.Run(SavePersistedData);
        }

        return botsFollowed;
    }

    /// <summary>
    /// Ensures all authentic Flock creator bot personas follow all specified user IDs.
    /// </summary>
    public int HaveBotsFollowAllUsers(IEnumerable<Guid> userIds)
    {
        var total = 0;
        foreach (var id in userIds)
        {
            if (id != Guid.Empty)
            {
                total += HaveBotsFollowUser(id);
            }
        }
        return total;
    }

    public FollowTallyDto GetTally(Guid callerId, IReadOnlyList<PersonaFollowTallyDto>? personaList = null)
    {
        var followingCount = GetFollowingCount(callerId);
        var followersCount = callerId != Guid.Empty ? GetFollowersCount(callerId) : 0;
        var followingIds = GetFollowingIds(callerId).ToList();

        var personasMap = new Dictionary<string, PersonaFollowTallyDto>(StringComparer.OrdinalIgnoreCase);
        var totalFlockFollowers = 0;

        if (personaList != null && personaList.Count > 0)
        {
            foreach (var p in personaList)
            {
                var tally = GetFollowersCount(p.UserId, p.Key);
                var following = GetFollowingCount(p.UserId, p.Key);
                var isFollowing = IsFollowing(callerId, p.UserId, p.Key);
                totalFlockFollowers += tally;

                personasMap[p.Key] = new PersonaFollowTallyDto
                {
                    Key = p.Key,
                    UserId = p.UserId,
                    Username = p.Username,
                    DisplayName = p.DisplayName,
                    Archetype = p.Archetype,
                    AvatarUrl = p.AvatarUrl,
                    FollowersCount = tally,
                    FollowingCount = following,
                    IsFollowing = isFollowing
                };
            }
        }
        else
        {
            foreach (var kvp in _personaBaseFollowers)
            {
                var targetId = _personaKeyToUserId.TryGetValue(kvp.Key, out var id) ? id : Guid.Empty;
                var count = GetFollowersCount(targetId, kvp.Key);
                var following = GetFollowingCount(targetId, kvp.Key);
                totalFlockFollowers += count;
                personasMap[kvp.Key] = new PersonaFollowTallyDto
                {
                    Key = kvp.Key,
                    UserId = targetId,
                    Username = kvp.Key,
                    FollowersCount = count,
                    FollowingCount = following,
                    IsFollowing = IsFollowing(callerId, targetId, kvp.Key)
                };
            }
        }

        return new FollowTallyDto
        {
            FollowingCount = followingCount,
            FollowersCount = followersCount,
            FollowingIds = followingIds,
            Personas = personasMap,
            TotalFlockFollowers = totalFlockFollowers
        };
    }

    private void LoadPersistedData()
    {
        lock (_fileLock)
        {
            if (string.IsNullOrWhiteSpace(_filePath) || !File.Exists(_filePath)) return;

            try
            {
                var json = File.ReadAllText(_filePath);
                var data = JsonSerializer.Deserialize<FollowPersistedData>(json);
                if (data != null)
                {
                    if (data.PersonaBaseTallies != null)
                    {
                        foreach (var kvp in data.PersonaBaseTallies)
                        {
                            _personaBaseFollowers[kvp.Key] = kvp.Value;
                        }
                    }

                    if (data.PersonaBaseFollowing != null)
                    {
                        foreach (var kvp in data.PersonaBaseFollowing)
                        {
                            _personaBaseFollowing[kvp.Key] = kvp.Value;
                        }
                    }

                    if (data.Records != null)
                    {
                        foreach (var r in data.Records)
                        {
                            var fSet = _userFollowing.GetOrAdd(r.FollowerId, _ => new HashSet<Guid>());
                            lock (fSet) fSet.Add(r.FollowingId);

                            var tSet = _userFollowers.GetOrAdd(r.FollowingId, _ => new HashSet<Guid>());
                            lock (tSet) tSet.Add(r.FollowerId);

                            if (!string.IsNullOrWhiteSpace(r.PersonaKey))
                            {
                                _personaKeyToUserId[r.PersonaKey] = r.FollowingId;
                                _userIdToPersonaKey[r.FollowingId] = r.PersonaKey;
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error reading follows from {FilePath}", _filePath);
            }
        }
    }

    private void SavePersistedData()
    {
        lock (_fileLock)
        {
            if (string.IsNullOrWhiteSpace(_filePath)) return;

            try
            {
                var records = new List<FollowRecord>();
                foreach (var kvp in _userFollowing)
                {
                    var followerId = kvp.Key;
                    HashSet<Guid> setCopy;
                    lock (kvp.Value)
                    {
                        setCopy = new HashSet<Guid>(kvp.Value);
                    }

                    foreach (var targetId in setCopy)
                    {
                        _userIdToPersonaKey.TryGetValue(targetId, out var pk);
                        records.Add(new FollowRecord
                        {
                            FollowerId = followerId,
                            FollowingId = targetId,
                            PersonaKey = pk,
                            CreatedAtUtc = DateTime.UtcNow
                        });
                    }
                }

                var data = new FollowPersistedData
                {
                    Records = records,
                    PersonaBaseTallies = new Dictionary<string, int>(_personaBaseFollowers),
                    PersonaBaseFollowing = new Dictionary<string, int>(_personaBaseFollowing)
                };

                var json = JsonSerializer.Serialize(data, new JsonSerializerOptions { WriteIndented = true });
                File.WriteAllText(_filePath, json);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error persisting follows to {FilePath}", _filePath);
            }
        }
    }

    private static Guid DeterministicGuid(string input)
    {
        using var md5 = System.Security.Cryptography.MD5.Create();
        var hash = md5.ComputeHash(System.Text.Encoding.UTF8.GetBytes(input.ToLowerInvariant()));
        return new Guid(hash);
    }
}
