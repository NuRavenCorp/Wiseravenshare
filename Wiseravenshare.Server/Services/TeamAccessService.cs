using System.Security.Cryptography;
using System.Text.Json;

namespace Wiseravenshare.Server.Services;

public sealed class TeamAccessService
{
    private readonly IWebHostEnvironment _environment;
    private readonly ILogger<TeamAccessService> _logger;
    private readonly object _lock = new();
    private TeamAccessState _state = new();
    private bool _loaded;
    private string? _stateFilePath;

    public TeamAccessService(IWebHostEnvironment environment, ILogger<TeamAccessService> logger)
    {
        _environment = environment;
        _logger = logger;
    }

    public TeamInviteIssueResult IssueInvite(string actorEmail, string inviteeEmail, string displayName, string role, TimeSpan ttl, bool prearranged)
    {
        EnsureLoaded();

        var normalizedActorEmail = NormalizeEmail(actorEmail);
        var normalizedInviteeEmail = NormalizeEmail(inviteeEmail);
        var safeName = string.IsNullOrWhiteSpace(displayName) ? normalizedInviteeEmail.Split('@')[0] : displayName.Trim();
        var safeRole = string.IsNullOrWhiteSpace(role) ? "member" : role.Trim();
        var boundedTtl = ttl < TimeSpan.FromMinutes(30) ? TimeSpan.FromMinutes(30) : ttl > TimeSpan.FromDays(14) ? TimeSpan.FromDays(14) : ttl;

        var issuedToken = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        var tokenHash = ComputeHash(issuedToken);
        var now = DateTime.UtcNow;

        lock (_lock)
        {
            var existingPending = _state.Invites.FirstOrDefault(invite =>
                invite.InviteeEmail.Equals(normalizedInviteeEmail, StringComparison.OrdinalIgnoreCase)
                && invite.ConsumedAtUtc is null
                && invite.RevokedAtUtc is null
                && invite.ExpiresAtUtc > now);

            if (existingPending is not null)
            {
                existingPending.RevokedAtUtc = now;
                existingPending.RevokedReason = "Superseded by a new invite token.";
            }

            var invite = new TeamInviteRecord
            {
                InviteId = Guid.NewGuid().ToString("N"),
                InviteeEmail = normalizedInviteeEmail,
                DisplayName = safeName,
                TeamRole = safeRole,
                CreatedByEmail = normalizedActorEmail,
                CreatedAtUtc = now,
                ExpiresAtUtc = now.Add(boundedTtl),
                TokenHash = tokenHash,
                Prearranged = prearranged
            };

            _state.Invites.Add(invite);
            PersistUnsafe();

            return new TeamInviteIssueResult
            {
                InviteId = invite.InviteId,
                InviteToken = issuedToken,
                InviteeEmail = invite.InviteeEmail,
                DisplayName = invite.DisplayName,
                TeamRole = invite.TeamRole,
                ExpiresAtUtc = invite.ExpiresAtUtc,
                Prearranged = invite.Prearranged
            };
        }
    }

    public TeamAccessConsumeResult? TryConsumeInvite(string inviteToken, string inviteeEmail)
    {
        EnsureLoaded();

        var now = DateTime.UtcNow;
        var normalizedInviteeEmail = NormalizeEmail(inviteeEmail);
        var tokenHash = ComputeHash(inviteToken);

        lock (_lock)
        {
            var invite = _state.Invites.FirstOrDefault(candidate =>
                candidate.TokenHash.Equals(tokenHash, StringComparison.Ordinal)
                && candidate.InviteeEmail.Equals(normalizedInviteeEmail, StringComparison.OrdinalIgnoreCase));

            if (invite is null || invite.RevokedAtUtc is not null || invite.ConsumedAtUtc is not null || invite.ExpiresAtUtc <= now)
            {
                return null;
            }

            invite.ConsumedAtUtc = now;

            var existingMember = _state.Members.FirstOrDefault(member =>
                member.Email.Equals(normalizedInviteeEmail, StringComparison.OrdinalIgnoreCase));

            if (existingMember is null)
            {
                existingMember = new TeamMemberRecord
                {
                    Email = normalizedInviteeEmail,
                    DisplayName = invite.DisplayName,
                    TeamRole = invite.TeamRole,
                    GrantedByEmail = invite.CreatedByEmail,
                    GrantedAtUtc = now,
                    LastInviteId = invite.InviteId,
                    IsActive = true
                };
                _state.Members.Add(existingMember);
            }
            else
            {
                existingMember.DisplayName = string.IsNullOrWhiteSpace(existingMember.DisplayName)
                    ? invite.DisplayName
                    : existingMember.DisplayName;
                existingMember.TeamRole = invite.TeamRole;
                existingMember.GrantedByEmail = invite.CreatedByEmail;
                existingMember.GrantedAtUtc = now;
                existingMember.LastInviteId = invite.InviteId;
                existingMember.IsActive = true;
            }

            PersistUnsafe();

            return new TeamAccessConsumeResult
            {
                Email = existingMember.Email,
                DisplayName = existingMember.DisplayName,
                TeamRole = existingMember.TeamRole,
                GrantedAtUtc = existingMember.GrantedAtUtc,
                Prearranged = invite.Prearranged
            };
        }
    }

    public bool IsTeamMemberAllowed(string? email)
    {
        EnsureLoaded();

        var normalizedEmail = NormalizeEmail(email);
        if (string.IsNullOrWhiteSpace(normalizedEmail))
        {
            return false;
        }

        var now = DateTime.UtcNow;

        lock (_lock)
        {
            var member = _state.Members.FirstOrDefault(candidate =>
                candidate.Email.Equals(normalizedEmail, StringComparison.OrdinalIgnoreCase));

            if (member is null || !member.IsActive)
            {
                return false;
            }

            if (member.ExpiresAtUtc is not null && member.ExpiresAtUtc <= now)
            {
                return false;
            }

            return true;
        }
    }

    public TeamAccessSnapshot GetSnapshot()
    {
        EnsureLoaded();

        var now = DateTime.UtcNow;

        lock (_lock)
        {
            var members = _state.Members
                .OrderBy(member => member.Email, StringComparer.OrdinalIgnoreCase)
                .ToList();

            var pendingInvites = _state.Invites
                .Where(invite => invite.ConsumedAtUtc is null && invite.RevokedAtUtc is null && invite.ExpiresAtUtc > now)
                .OrderByDescending(invite => invite.CreatedAtUtc)
                .ToList();

            return new TeamAccessSnapshot
            {
                Members = members,
                PendingInvites = pendingInvites
            };
        }
    }

    public TeamInviteRecord? RevokePendingInvite(string inviteId, string actorEmail, string reason)
    {
        EnsureLoaded();

        var normalizedInviteId = (inviteId ?? string.Empty).Trim();
        var normalizedActorEmail = NormalizeEmail(actorEmail);
        var safeReason = string.IsNullOrWhiteSpace(reason) ? "Revoked by admin." : reason.Trim();
        var now = DateTime.UtcNow;

        lock (_lock)
        {
            var invite = _state.Invites.FirstOrDefault(candidate =>
                candidate.InviteId.Equals(normalizedInviteId, StringComparison.OrdinalIgnoreCase));

            if (invite is null || invite.ConsumedAtUtc is not null || invite.RevokedAtUtc is not null || invite.ExpiresAtUtc <= now)
            {
                return null;
            }

            invite.RevokedAtUtc = now;
            invite.RevokedByEmail = normalizedActorEmail;
            invite.RevokedReason = safeReason;

            PersistUnsafe();
            return invite;
        }
    }

    public TeamMemberRecord? SetMemberActiveStatus(string email, bool isActive, string actorEmail, string reason)
    {
        EnsureLoaded();

        var normalizedEmail = NormalizeEmail(email);
        var normalizedActorEmail = NormalizeEmail(actorEmail);
        var safeReason = (reason ?? string.Empty).Trim();
        var now = DateTime.UtcNow;

        if (string.IsNullOrWhiteSpace(normalizedEmail))
        {
            return null;
        }

        lock (_lock)
        {
            var member = _state.Members.FirstOrDefault(candidate =>
                candidate.Email.Equals(normalizedEmail, StringComparison.OrdinalIgnoreCase));

            if (member is null)
            {
                return null;
            }

            member.IsActive = isActive;
            if (isActive)
            {
                member.ReactivatedAtUtc = now;
                member.ReactivatedByEmail = normalizedActorEmail;
                member.SuspendedAtUtc = null;
                member.SuspendedByEmail = string.Empty;
                member.SuspensionReason = string.Empty;
            }
            else
            {
                member.SuspendedAtUtc = now;
                member.SuspendedByEmail = normalizedActorEmail;
                member.SuspensionReason = safeReason;
                member.ReactivatedAtUtc = null;
                member.ReactivatedByEmail = string.Empty;
            }

            PersistUnsafe();
            return member;
        }
    }

    private void EnsureLoaded()
    {
        if (_loaded)
        {
            return;
        }

        lock (_lock)
        {
            if (_loaded)
            {
                return;
            }

            _stateFilePath = ResolveStateFilePath();
            if (File.Exists(_stateFilePath))
            {
                try
                {
                    var json = File.ReadAllText(_stateFilePath);
                    var loaded = JsonSerializer.Deserialize<TeamAccessState>(json);
                    _state = loaded ?? new TeamAccessState();
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Unable to load persisted team access state. A clean state will be used.");
                    _state = new TeamAccessState();
                }
            }

            _loaded = true;
        }
    }

    private void PersistUnsafe()
    {
        if (string.IsNullOrWhiteSpace(_stateFilePath))
        {
            _stateFilePath = ResolveStateFilePath();
        }

        var directory = Path.GetDirectoryName(_stateFilePath);
        if (!string.IsNullOrWhiteSpace(directory))
        {
            Directory.CreateDirectory(directory);
        }

        var payload = JsonSerializer.Serialize(_state, new JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText(_stateFilePath!, payload);
    }

    private string ResolveStateFilePath()
    {
        var appDataPath = Path.Combine(_environment.ContentRootPath, "App_Data");
        return Path.Combine(appDataPath, "team-access-state.json");
    }

    private static string NormalizeEmail(string? email)
    {
        return (email ?? string.Empty).Trim().ToLowerInvariant();
    }

    private static string ComputeHash(string rawValue)
    {
        if (string.IsNullOrWhiteSpace(rawValue))
        {
            return string.Empty;
        }

        var bytes = System.Text.Encoding.UTF8.GetBytes(rawValue.Trim());
        var hash = SHA256.HashData(bytes);
        return Convert.ToHexString(hash);
    }
}

public sealed class TeamAccessState
{
    public List<TeamInviteRecord> Invites { get; set; } = new();
    public List<TeamMemberRecord> Members { get; set; } = new();
}

public sealed class TeamInviteRecord
{
    public string InviteId { get; set; } = Guid.NewGuid().ToString("N");
    public string InviteeEmail { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string TeamRole { get; set; } = "member";
    public string CreatedByEmail { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime ExpiresAtUtc { get; set; } = DateTime.UtcNow.AddDays(3);
    public string TokenHash { get; set; } = string.Empty;
    public bool Prearranged { get; set; }
    public DateTime? ConsumedAtUtc { get; set; }
    public DateTime? RevokedAtUtc { get; set; }
    public string RevokedByEmail { get; set; } = string.Empty;
    public string RevokedReason { get; set; } = string.Empty;
}

public sealed class TeamMemberRecord
{
    public string Email { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string TeamRole { get; set; } = "member";
    public string GrantedByEmail { get; set; } = string.Empty;
    public DateTime GrantedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? ExpiresAtUtc { get; set; }
    public bool IsActive { get; set; } = true;
    public string LastInviteId { get; set; } = string.Empty;
    public DateTime? SuspendedAtUtc { get; set; }
    public string SuspendedByEmail { get; set; } = string.Empty;
    public string SuspensionReason { get; set; } = string.Empty;
    public DateTime? ReactivatedAtUtc { get; set; }
    public string ReactivatedByEmail { get; set; } = string.Empty;
}

public sealed class TeamInviteIssueResult
{
    public string InviteId { get; set; } = string.Empty;
    public string InviteToken { get; set; } = string.Empty;
    public string InviteeEmail { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string TeamRole { get; set; } = "member";
    public DateTime ExpiresAtUtc { get; set; }
    public bool Prearranged { get; set; }
}

public sealed class TeamAccessConsumeResult
{
    public string Email { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string TeamRole { get; set; } = "member";
    public DateTime GrantedAtUtc { get; set; }
    public bool Prearranged { get; set; }
}

public sealed class TeamAccessSnapshot
{
    public IReadOnlyCollection<TeamMemberRecord> Members { get; set; } = Array.Empty<TeamMemberRecord>();
    public IReadOnlyCollection<TeamInviteRecord> PendingInvites { get; set; } = Array.Empty<TeamInviteRecord>();
}
