using System.Collections.Concurrent;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text.Json;
using Npgsql;
using Wiseravenshare.Server.Models;

namespace Wiseravenshare.Server.Services;

public sealed class UserPersistenceStatus
{
    public bool DatabaseConfigured { get; set; }
    public bool DatabaseAvailable { get; set; }
    public bool RequiresDatabase { get; set; }
    public string ActiveTable { get; set; } = string.Empty;
    public string LastError { get; set; } = string.Empty;
}

public sealed class UserStore
{
    private readonly ConcurrentDictionary<string, UserRecord> _usersByEmail = new(StringComparer.OrdinalIgnoreCase);
    private readonly object _seedLock = new();
    private readonly object _persistenceLock = new();
    private readonly IWebHostEnvironment _environment;
    private readonly string _connectionString;
    private readonly bool _requireDatabasePersistence;
    private string _usersTable = "app_data.app_users";
    private bool _dbSchemaEnsured;
    private bool _seeded;
    private static readonly JsonSerializerOptions JsonCaseInsensitive = new()
    {
        PropertyNameCaseInsensitive = true
    };

    public UserStore(IWebHostEnvironment environment, IConfiguration configuration)
    {
        _environment = environment;
        _connectionString = ResolveConnectionString(configuration);
        var configuredRequirement = configuration["Persistence:RequireDatabase"];
        var parsedRequirement = false;
        var hasConfiguredRequirement = bool.TryParse(configuredRequirement, out parsedRequirement);
        _requireDatabasePersistence = hasConfiguredRequirement ? parsedRequirement : _environment.IsProduction();
    }

    private static string ResolveConnectionString(IConfiguration configuration)
    {
        var databaseUrl = configuration["DATABASE_URL"];
        if (!string.IsNullOrWhiteSpace(databaseUrl))
        {
            return NormalizeConnectionString(databaseUrl);
        }

        return NormalizeConnectionString(configuration.GetConnectionString("DefaultConnection") ?? string.Empty);
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
            var shouldPersist = false;

            foreach (var configuredUser in configuredUsers)
            {
                if (string.IsNullOrWhiteSpace(configuredUser.Email) || string.IsNullOrWhiteSpace(configuredUser.Password))
                {
                    continue;
                }

                var email = configuredUser.Email.Trim();
                if (_usersByEmail.TryGetValue(email, out var existingUser))
                {
                    var safeConfiguredName = string.IsNullOrWhiteSpace(configuredUser.Name)
                        ? email.Split('@')[0]
                        : configuredUser.Name.Trim();

                    var shouldUpdateName = !string.Equals(existingUser.Name, safeConfiguredName, StringComparison.Ordinal);
                    var shouldUpdatePassword = !VerifyPassword(configuredUser.Password, existingUser.PasswordHash);

                    if (shouldUpdateName)
                    {
                        existingUser.Name = safeConfiguredName;
                        existingUser.Handle = BuildHandle(safeConfiguredName, email);
                    }

                    if (shouldUpdatePassword)
                    {
                        existingUser.PasswordHash = HashPassword(configuredUser.Password);
                    }

                    if (shouldUpdateName || shouldUpdatePassword)
                    {
                        existingUser.UpdatedAtUtc = DateTime.UtcNow;
                        shouldPersist = true;
                    }

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
                shouldPersist = true;
            }

            if (shouldPersist)
            {
                try
                {
                    PersistUsers();
                }
                catch (InvalidOperationException)
                {
                    // Keep authentication available even when durable persistence is temporarily unavailable.
                    // Profile/feed updates still enforce persistence requirements in their own workflows.
                }
            }

            _seeded = true;
        }
    }

    public bool IsDatabasePersistenceAvailable()
    {
        if (string.IsNullOrWhiteSpace(_connectionString))
        {
            return false;
        }

        try
        {
            EnsureDbSchema();
            return true;
        }
        catch
        {
            return false;
        }
    }

    public UserPersistenceStatus GetPersistenceStatus()
    {
        var status = new UserPersistenceStatus
        {
            DatabaseConfigured = !string.IsNullOrWhiteSpace(_connectionString),
            RequiresDatabase = _requireDatabasePersistence,
            ActiveTable = _usersTable
        };

        if (!status.DatabaseConfigured)
        {
            status.LastError = "Connection string is not configured.";
            return status;
        }

        try
        {
            EnsureDbSchema();
            status.DatabaseAvailable = true;
            status.ActiveTable = _usersTable;
            status.LastError = string.Empty;
        }
        catch (Exception ex)
        {
            status.DatabaseAvailable = false;
            status.LastError = ex.Message;
        }

        return status;
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

        PersistUsers(user);
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
        PersistUsers(user);
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
        PersistUsers(user);
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

        if (request.Instagram is not null)
        {
            current.Instagram = NormalizeConnection(request.Instagram);
        }

        user.SocialFeeds = current;
        user.UpdatedAtUtc = DateTime.UtcNow;
        PersistUsers(user);
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
        PersistUsers(user);
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

        try
        {
            var salt = Convert.FromBase64String(parts[0]);
            var expectedHash = Convert.FromBase64String(parts[1]);
            var actualHash = Rfc2898DeriveBytes.Pbkdf2(password, salt, 100_000, HashAlgorithmName.SHA256, 32);
            return CryptographicOperations.FixedTimeEquals(expectedHash, actualHash);
        }
        catch
        {
            return false;
        }
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
            Facebook = NormalizeConnection(feeds.Facebook),
            Instagram = NormalizeConnection(feeds.Instagram)
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
        if (TryLoadUsersFromDatabase())
        {
            return;
        }

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

    private void PersistUsers(UserRecord? changedUser = null)
    {
        if (TryPersistUsersToDatabase(changedUser))
        {
            return;
        }

        if (_requireDatabasePersistence)
        {
            throw new InvalidOperationException("Database persistence is unavailable. Profile and social feed changes were not saved.");
        }

        lock (_persistenceLock)
        {
            var users = _usersByEmail.Values
                .OrderBy(u => u.Email, StringComparer.OrdinalIgnoreCase)
                .ToList();
            var json = JsonSerializer.Serialize(users, new JsonSerializerOptions { WriteIndented = true });
            System.IO.File.WriteAllText(GetUsersFilePath(), json);
        }
    }

    private bool TryLoadUsersFromDatabase()
    {
        if (string.IsNullOrWhiteSpace(_connectionString))
        {
            return false;
        }

        try
        {
            EnsureDbSchema();

            using var connection = new NpgsqlConnection(_connectionString);
            connection.Open();

            var sql = $@"
SELECT id, email, name, handle, password_hash, bio, location, website, avatar, social_feeds, created_at_utc, updated_at_utc
FROM {_usersTable}
ORDER BY email;";

            using var command = new NpgsqlCommand(sql, connection);
            using var reader = command.ExecuteReader();

            while (reader.Read())
            {
                var socialFeedsJson = reader.IsDBNull(9) ? "{}" : reader.GetString(9);
                var socialFeeds = ParseSocialFeeds(socialFeedsJson);

                var user = new UserRecord
                {
                    Id = reader.GetString(0),
                    Email = reader.GetString(1),
                    Name = reader.GetString(2),
                    Handle = reader.GetString(3),
                    PasswordHash = reader.GetString(4),
                    Bio = reader.IsDBNull(5) ? string.Empty : reader.GetString(5),
                    Location = reader.IsDBNull(6) ? string.Empty : reader.GetString(6),
                    Website = reader.IsDBNull(7) ? string.Empty : reader.GetString(7),
                    Avatar = reader.IsDBNull(8) ? string.Empty : reader.GetString(8),
                    SocialFeeds = NormalizeSocialFeeds(socialFeeds),
                    CreatedAtUtc = reader.GetDateTime(10),
                    UpdatedAtUtc = reader.GetDateTime(11)
                };

                _usersByEmail[user.Email] = user;
            }

            return true;
        }
        catch
        {
            return false;
        }
    }

    private static SocialFeedSettings ParseSocialFeeds(string socialFeedsJson)
    {
        if (string.IsNullOrWhiteSpace(socialFeedsJson))
        {
            return new SocialFeedSettings();
        }

        try
        {
            // Expected shape: { tikTok/facebook/instagram... }
            var direct = JsonSerializer.Deserialize<SocialFeedSettings>(socialFeedsJson, JsonCaseInsensitive);
            if (direct is not null)
            {
                return direct;
            }
        }
        catch
        {
            // Fall through to compatibility parser.
        }

        try
        {
            // Compatibility path for legacy wrapper payloads: { socialFeeds: { ... } }
            using var doc = JsonDocument.Parse(socialFeedsJson);
            if (doc.RootElement.ValueKind == JsonValueKind.Object
                && doc.RootElement.TryGetProperty("socialFeeds", out var wrapped))
            {
                var wrappedJson = wrapped.GetRawText();
                var wrappedFeeds = JsonSerializer.Deserialize<SocialFeedSettings>(wrappedJson, JsonCaseInsensitive);
                if (wrappedFeeds is not null)
                {
                    return wrappedFeeds;
                }
            }
        }
        catch
        {
            // Ignore and return defaults.
        }

        return new SocialFeedSettings();
    }

    private bool TryPersistUsersToDatabase(UserRecord? changedUser = null)
    {
        if (string.IsNullOrWhiteSpace(_connectionString))
        {
            return false;
        }

        for (var attempt = 1; attempt <= 3; attempt++)
        {
            try
            {
                EnsureDbSchema();

                lock (_persistenceLock)
                {
                    var users = changedUser is null
                        ? _usersByEmail.Values.OrderBy(u => u.Email, StringComparer.OrdinalIgnoreCase).ToList()
                        : [changedUser];

                    using var connection = new NpgsqlConnection(_connectionString);
                    connection.Open();
                    using var tx = connection.BeginTransaction();

                    var insertSql = $@"
INSERT INTO {_usersTable} (
    id, email, name, handle, password_hash, bio, location, website, avatar, social_feeds, created_at_utc, updated_at_utc
) VALUES (
    @id, @email, @name, @handle, @password_hash, @bio, @location, @website, @avatar, CAST(@social_feeds AS jsonb), @created_at_utc, @updated_at_utc
) ON CONFLICT (email) DO NOTHING;";

                    var updateSql = $@"
UPDATE {_usersTable}
SET name = @name,
    handle = @handle,
    password_hash = @password_hash,
    bio = @bio,
    location = @location,
    website = @website,
    avatar = @avatar,
    social_feeds = CAST(@social_feeds AS jsonb),
    updated_at_utc = @updated_at_utc
WHERE email = @email;";

                    foreach (var user in users)
                    {
                        using var insert = new NpgsqlCommand(insertSql, connection, tx);
                        insert.Parameters.AddWithValue("id", user.Id);
                        insert.Parameters.AddWithValue("email", user.Email);
                        insert.Parameters.AddWithValue("name", user.Name);
                        insert.Parameters.AddWithValue("handle", user.Handle);
                        insert.Parameters.AddWithValue("password_hash", user.PasswordHash);
                        insert.Parameters.AddWithValue("bio", user.Bio ?? string.Empty);
                        insert.Parameters.AddWithValue("location", user.Location ?? string.Empty);
                        insert.Parameters.AddWithValue("website", user.Website ?? string.Empty);
                        insert.Parameters.AddWithValue("avatar", user.Avatar ?? string.Empty);
                        insert.Parameters.AddWithValue("social_feeds", JsonSerializer.Serialize(user.SocialFeeds ?? new SocialFeedSettings()));
                        insert.Parameters.AddWithValue("created_at_utc", user.CreatedAtUtc);
                        insert.Parameters.AddWithValue("updated_at_utc", user.UpdatedAtUtc);
                        var inserted = insert.ExecuteNonQuery();

                        if (inserted == 0)
                        {
                            using var update = new NpgsqlCommand(updateSql, connection, tx);
                            update.Parameters.AddWithValue("email", user.Email);
                            update.Parameters.AddWithValue("name", user.Name);
                            update.Parameters.AddWithValue("handle", user.Handle);
                            update.Parameters.AddWithValue("password_hash", user.PasswordHash);
                            update.Parameters.AddWithValue("bio", user.Bio ?? string.Empty);
                            update.Parameters.AddWithValue("location", user.Location ?? string.Empty);
                            update.Parameters.AddWithValue("website", user.Website ?? string.Empty);
                            update.Parameters.AddWithValue("avatar", user.Avatar ?? string.Empty);
                            update.Parameters.AddWithValue("social_feeds", JsonSerializer.Serialize(user.SocialFeeds ?? new SocialFeedSettings()));
                            update.Parameters.AddWithValue("updated_at_utc", user.UpdatedAtUtc);
                            update.ExecuteNonQuery();
                        }
                    }

                    tx.Commit();
                }

                return true;
            }
            catch (Exception ex)
            {
                var shouldRetry = attempt < 3 && IsTransientDatabaseException(ex);
                if (!shouldRetry)
                {
                    return false;
                }

                Thread.Sleep(TimeSpan.FromMilliseconds(200 * attempt));
            }
        }

        return false;
    }

    private static bool IsTransientDatabaseException(Exception exception)
    {
        var current = exception;
        while (current is not null)
        {
            if (current is TimeoutException || current is IOException || current is SocketException)
            {
                return true;
            }

            if (current is NpgsqlException npgsqlException)
            {
                if (npgsqlException.IsTransient)
                {
                    return true;
                }

                if (!string.IsNullOrWhiteSpace(npgsqlException.SqlState))
                {
                    var sqlState = npgsqlException.SqlState;
                    if (sqlState.StartsWith("08", StringComparison.Ordinal)
                        || sqlState == "40001"
                        || sqlState == "40P01"
                        || sqlState == "57P01")
                    {
                        return true;
                    }
                }
            }

            current = current.InnerException;
        }

        return false;
    }

    private void EnsureDbSchema()
    {
        if (_dbSchemaEnsured || string.IsNullOrWhiteSpace(_connectionString))
        {
            return;
        }

        using var connection = new NpgsqlConnection(_connectionString);
        connection.Open();

        // Prefer binding to existing tables first to support least-privilege DB users
        // that can read/write data but cannot run CREATE statements.
        if (TryBindExistingUsersTable(connection, "app_data"))
        {
            _usersTable = "app_data.app_users";
            _dbSchemaEnsured = true;
            return;
        }

        if (TryBindExistingUsersTable(connection, "public"))
        {
            _usersTable = "public.app_users";
            _dbSchemaEnsured = true;
            return;
        }

        if (TryEnsureUsersTable(connection, "app_data", ensureSchema: true))
        {
            _usersTable = "app_data.app_users";
            _dbSchemaEnsured = true;
            return;
        }

        if (TryEnsureUsersTable(connection, "public", ensureSchema: false))
        {
            _usersTable = "public.app_users";
            _dbSchemaEnsured = true;
            return;
        }

        throw new InvalidOperationException("Unable to create or access user persistence table in app_data or public schema.");
    }

    private static bool TryBindExistingUsersTable(NpgsqlConnection connection, string schemaName)
    {
        try
        {
            var tableName = $"{schemaName}.app_users";
            const string sql = @"SELECT
    to_regclass(@table_name) IS NOT NULL
    AND has_table_privilege(@table_name, 'INSERT');";
            using var command = new NpgsqlCommand(sql, connection);
            command.Parameters.AddWithValue("table_name", tableName);
            var exists = command.ExecuteScalar();
            return exists is bool b && b;
        }
        catch
        {
            return false;
        }
    }

    private static bool TryEnsureUsersTable(NpgsqlConnection connection, string schemaName, bool ensureSchema)
    {
        try
        {
            var prefix = $"{schemaName}.app_users";
            var createSchemaSql = ensureSchema ? $"CREATE SCHEMA IF NOT EXISTS {schemaName};" : string.Empty;
            var sql = $@"
{createSchemaSql}

CREATE TABLE IF NOT EXISTS {prefix} (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    handle TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    bio TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    website TEXT NOT NULL DEFAULT '',
    avatar TEXT NOT NULL DEFAULT '',
    social_feeds JSONB NOT NULL DEFAULT '{{}}'::jsonb,
    created_at_utc TIMESTAMPTZ NOT NULL,
    updated_at_utc TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_app_users_handle ON {prefix}(handle);
";

            using var command = new NpgsqlCommand(sql, connection);
            command.ExecuteNonQuery();
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static string NormalizeConnectionString(string connectionString)
    {
        var value = connectionString?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        if (!value.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase)
            && !value.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase))
        {
            return value;
        }

        if (value.EndsWith("?sslmode", StringComparison.OrdinalIgnoreCase))
        {
            return value + "=require";
        }

        value = value.Replace("?sslmode&", "?sslmode=require&", StringComparison.OrdinalIgnoreCase);
        value = value.Replace("&sslmode&", "&sslmode=require&", StringComparison.OrdinalIgnoreCase);

        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri))
        {
            return value;
        }

        var userName = string.Empty;
        var password = string.Empty;
        if (!string.IsNullOrWhiteSpace(uri.UserInfo))
        {
            var parts = uri.UserInfo.Split(':', 2);
            userName = Uri.UnescapeDataString(parts[0]);
            if (parts.Length > 1)
            {
                password = Uri.UnescapeDataString(parts[1]);
            }
        }

        var builder = new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host,
            Port = uri.IsDefaultPort ? 5432 : uri.Port,
            Username = userName,
            Password = password,
            Database = uri.AbsolutePath.Trim('/'),
            SslMode = SslMode.Require,
            TrustServerCertificate = true,
            Pooling = true
        };

        var query = uri.Query?.TrimStart('?') ?? string.Empty;
        foreach (var segment in query.Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var kv = segment.Split('=', 2);
            var key = Uri.UnescapeDataString(kv[0]);
            var val = kv.Length > 1 ? Uri.UnescapeDataString(kv[1]) : string.Empty;

            if (key.Equals("sslmode", StringComparison.OrdinalIgnoreCase)
                && Enum.TryParse<SslMode>(val, true, out var mode))
            {
                builder.SslMode = mode;
            }
        }

        return builder.ConnectionString;
    }
}
