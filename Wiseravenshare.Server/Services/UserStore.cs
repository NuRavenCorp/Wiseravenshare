using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text.Json;
using Wiseravenshare.Server.Models;

namespace Wiseravenshare.Server.Services;

public sealed class UserStore
{
    private readonly ConcurrentDictionary<string, UserRecord> _usersByEmail = new(StringComparer.OrdinalIgnoreCase);
    private readonly object _seedLock = new();
    private readonly object _persistenceLock = new();
    private readonly IWebHostEnvironment _environment;
    private bool _seeded;

    public UserStore(IWebHostEnvironment environment)
    {
        _environment = environment;
    }

    public void EnsureSeeded(IEnumerable<(string Name, string Email, string Password)> configuredUsers)
    {
        if (_seeded)
        {
            return;
        }

        lock (_seedLock)
        {
            if (_seeded)
            {
                return;
            }

            LoadPersistedUsersUnsafe();

            foreach (var configuredUser in configuredUsers)
            {
                if (string.IsNullOrWhiteSpace(configuredUser.Email) || string.IsNullOrWhiteSpace(configuredUser.Password))
                {
                    continue;
                }

                var email = configuredUser.Email.Trim();
                if (_usersByEmail.ContainsKey(email))
                {
                    continue;
                }

                var safeName = string.IsNullOrWhiteSpace(configuredUser.Name)
                    ? email.Split('@')[0]
                    : configuredUser.Name.Trim();

                var user = new UserRecord
                {
                    Id = Guid.NewGuid().ToString("N"),
                    Email = email,
                    Name = safeName,
                    Handle = BuildHandle(safeName, email),
                    PasswordHash = HashPassword(configuredUser.Password),
                    CreatedAtUtc = DateTime.UtcNow,
                    UpdatedAtUtc = DateTime.UtcNow
                };

                _usersByEmail.TryAdd(user.Email, user);
            }

            _seeded = true;
        }
    }

    public bool EmailExists(string email)
    {
        return _usersByEmail.ContainsKey(email.Trim());
    }

    public bool TryGetByEmail(string email, out UserRecord? user)
    {
        return _usersByEmail.TryGetValue(email.Trim(), out user);
    }

    public UserRecord? FindByLoginIdentifier(string identifier)
    {
        var loginIdentifier = identifier.Trim();
        if (loginIdentifier.Contains('@'))
        {
            _usersByEmail.TryGetValue(loginIdentifier, out var userByEmail);
            return userByEmail;
        }

        return _usersByEmail.Values.FirstOrDefault(u =>
            string.Equals(u.Handle, loginIdentifier, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(u.Name, loginIdentifier, StringComparison.OrdinalIgnoreCase));
    }

    public UserRecord CreateUser(
        string name,
        string email,
        string password,
        string bio,
        string location,
        string website,
        string avatar)
    {
        var normalizedEmail = email.Trim();
        var safeName = string.IsNullOrWhiteSpace(name) ? normalizedEmail.Split('@')[0] : name.Trim();

        var user = new UserRecord
        {
            Id = Guid.NewGuid().ToString("N"),
            Email = normalizedEmail,
            Name = safeName,
            Handle = BuildHandle(safeName, normalizedEmail),
            PasswordHash = HashPassword(password),
            Bio = bio.Trim(),
            Location = location.Trim(),
            Website = website.Trim(),
            Avatar = avatar.Trim(),
            CreatedAtUtc = DateTime.UtcNow,
            UpdatedAtUtc = DateTime.UtcNow
        };

        if (!_usersByEmail.TryAdd(user.Email, user))
        {
            throw new InvalidOperationException("An account with that email already exists.");
        }

        PersistUsers();
        return user;
    }

    public UserRecord UpsertFromToken(string id, string email, string name)
    {
        if (_usersByEmail.TryGetValue(email, out var existing))
        {
            return existing;
        }

        var user = new UserRecord
        {
            Id = string.IsNullOrWhiteSpace(id) ? Guid.NewGuid().ToString("N") : id,
            Email = email,
            Name = string.IsNullOrWhiteSpace(name) ? email.Split('@')[0] : name,
            Handle = BuildHandle(name, email),
            PasswordHash = string.Empty,
            CreatedAtUtc = DateTime.UtcNow,
            UpdatedAtUtc = DateTime.UtcNow
        };

        _usersByEmail.TryAdd(user.Email, user);
        PersistUsers();
        return user;
    }

    public bool TryGetById(string id, out UserRecord? user)
    {
        user = _usersByEmail.Values.FirstOrDefault(u => string.Equals(u.Id, id, StringComparison.Ordinal));
        return user is not null;
    }

    public UserRecord UpdateProfile(string id, UpdateUserProfileRequest request)
    {
        if (!TryGetById(id, out var user) || user is null)
        {
            throw new KeyNotFoundException("User not found.");
        }

        if (request.Name is not null)
        {
            user.Name = request.Name.Trim();
            user.Handle = BuildHandle(user.Name, user.Email);
        }

        if (request.Bio is not null)
        {
            user.Bio = request.Bio.Trim();
        }

        if (request.Location is not null)
        {
            user.Location = request.Location.Trim();
        }

        if (request.Website is not null)
        {
            user.Website = request.Website.Trim();
        }

        if (request.Avatar is not null)
        {
            user.Avatar = request.Avatar.Trim();
        }

        if (request.SocialFeeds is not null)
        {
            user.SocialFeeds = NormalizeSocialFeeds(request.SocialFeeds);
        }

        user.UpdatedAtUtc = DateTime.UtcNow;
        PersistUsers();
        return user;
    }

    public UserRecord UpdateSocialFeeds(string id, UpdateSocialFeedsRequest request)
    {
        if (!TryGetById(id, out var user) || user is null)
        {
            throw new KeyNotFoundException("User not found.");
        }

        var current = user.SocialFeeds ?? new SocialFeedSettings();

        if (request.TikTok is not null)
        {
            current.TikTok = NormalizeConnection(request.TikTok);
        }

        if (request.Facebook is not null)
        {
            current.Facebook = NormalizeConnection(request.Facebook);
        }

        user.SocialFeeds = current;
        user.UpdatedAtUtc = DateTime.UtcNow;
        PersistUsers();
        return user;
    }

    public void UpdatePassword(string email, string newPassword)
    {
        if (!_usersByEmail.TryGetValue(email.Trim(), out var user))
        {
            throw new KeyNotFoundException("User not found.");
        }

        user.PasswordHash = HashPassword(newPassword);
        user.UpdatedAtUtc = DateTime.UtcNow;
        PersistUsers();
    }

    public static UserResponse ToResponse(UserRecord user)
    {
        return new UserResponse
        {
            Id = user.Id,
            Name = user.Name,
            Email = user.Email,
            Handle = user.Handle,
            Bio = user.Bio,
            Location = user.Location,
            Website = user.Website,
            Avatar = user.Avatar,
            CreatedAt = user.CreatedAtUtc,
            UpdatedAt = user.UpdatedAtUtc,
            SocialFeeds = user.SocialFeeds ?? new SocialFeedSettings()
        };
    }

    public static string HashPassword(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(16);
        var hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, 100_000, HashAlgorithmName.SHA256, 32);
        return $"{Convert.ToBase64String(salt)}.{Convert.ToBase64String(hash)}";
    }

    public static bool VerifyPassword(string password, string stored)
    {
        var parts = stored.Split('.', 2);
        if (parts.Length != 2)
        {
            return false;
        }

        var salt = Convert.FromBase64String(parts[0]);
        var expectedHash = Convert.FromBase64String(parts[1]);
        var actualHash = Rfc2898DeriveBytes.Pbkdf2(password, salt, 100_000, HashAlgorithmName.SHA256, 32);
        return CryptographicOperations.FixedTimeEquals(expectedHash, actualHash);
    }

    private static string BuildHandle(string name, string email)
    {
        var source = string.IsNullOrWhiteSpace(name) ? email.Split('@')[0] : name;
        var alphanumeric = new string(source.Where(c => char.IsLetterOrDigit(c) || c == '_').ToArray());
        if (string.IsNullOrWhiteSpace(alphanumeric))
        {
            alphanumeric = email.Split('@')[0];
        }

        return alphanumeric.ToLowerInvariant();
    }

    private SocialFeedSettings NormalizeSocialFeeds(SocialFeedSettings feeds)
    {
        return new SocialFeedSettings
        {
            TikTok = NormalizeConnection(feeds.TikTok),
            Facebook = NormalizeConnection(feeds.Facebook)
        };
    }

    private static SocialFeedConnection NormalizeConnection(SocialFeedConnection? connection)
    {
        if (connection is null)
        {
            return new SocialFeedConnection();
        }

        return new SocialFeedConnection
        {
            Enabled = connection.Enabled,
            Username = (connection.Username ?? string.Empty).Trim(),
            ProfileUrl = (connection.ProfileUrl ?? string.Empty).Trim(),
            FeedUrl = (connection.FeedUrl ?? string.Empty).Trim()
        };
    }

    private string GetUsersFilePath()
    {
        var appDataDir = Path.Combine(_environment.ContentRootPath, "App_Data");
        Directory.CreateDirectory(appDataDir);
        return Path.Combine(appDataDir, "users.json");
    }

    private void LoadPersistedUsersUnsafe()
    {
        var path = GetUsersFilePath();
        if (!System.IO.File.Exists(path))
        {
            return;
        }

        try
        {
            var json = System.IO.File.ReadAllText(path);
            var persistedUsers = JsonSerializer.Deserialize<List<UserRecord>>(json) ?? [];
            foreach (var persistedUser in persistedUsers)
            {
                if (string.IsNullOrWhiteSpace(persistedUser.Email) || string.IsNullOrWhiteSpace(persistedUser.PasswordHash))
                {
                    continue;
                }

                persistedUser.SocialFeeds ??= new SocialFeedSettings();
                persistedUser.CreatedAtUtc = persistedUser.CreatedAtUtc == default ? DateTime.UtcNow : persistedUser.CreatedAtUtc;
                persistedUser.UpdatedAtUtc = persistedUser.UpdatedAtUtc == default ? DateTime.UtcNow : persistedUser.UpdatedAtUtc;

                _usersByEmail.TryAdd(persistedUser.Email, persistedUser);
            }
        }
        catch
        {
            // Keep auth available even if persistence file is malformed.
        }
    }

    private void PersistUsers()
    {
        lock (_persistenceLock)
        {
            var users = _usersByEmail.Values
                .OrderBy(u => u.Email, StringComparer.OrdinalIgnoreCase)
                .ToList();
            var json = JsonSerializer.Serialize(users, new JsonSerializerOptions { WriteIndented = true });
            System.IO.File.WriteAllText(GetUsersFilePath(), json);
        }
    }
}
