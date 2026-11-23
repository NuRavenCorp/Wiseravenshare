using System.Security.Claims;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Infrastructure.Data;

namespace Wiseravenshare.Server.Services;

public sealed class AccessGateState
{
    /// <summary>
    /// Master gate switch. Defaults to TRUE ("giving users all access, until an administrator closes the gates").
    /// </summary>
    public bool MasterGateOpen { get; set; } = true;

    /// <summary>
    /// Timestamp when the master gate was last toggled.
    /// </summary>
    public DateTime LastChangedUtc { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Administrator email or system identifier who last modified the master gate.
    /// </summary>
    public string ChangedBy { get; set; } = "system_default";

    /// <summary>
    /// Descriptive status note.
    /// </summary>
    public string Reason { get; set; } = "Default open access granted to all users until an administrator closes the gates.";

    /// <summary>
    /// Set of user IDs whose payments have been received, granting them permanent access to all gates.
    /// </summary>
    public HashSet<string> PaidUserIds { get; set; } = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>
    /// Set of user emails whose payments have been received, granting them permanent access to all gates.
    /// </summary>
    public HashSet<string> PaidEmails { get; set; } = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>
    /// Log of payment grants recorded for paying users.
    /// </summary>
    public List<AccessGatePaymentGrant> PaymentGrants { get; set; } = new();

    /// <summary>
    /// Audit log of gate state changes and grant operations.
    /// </summary>
    public List<AccessGateAuditEvent> AuditLog { get; set; } = new();
}

public sealed class AccessGatePaymentGrant
{
    public string GrantId { get; set; } = Guid.NewGuid().ToString("N");
    public string UserId { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string PlanKey { get; set; } = "all_gates_unlocked";
    public DateTime PaymentReceivedAtUtc { get; set; } = DateTime.UtcNow;
    public string Source { get; set; } = "stripe_payment";
    public string Notes { get; set; } = string.Empty;
}

public sealed class AccessGateAuditEvent
{
    public DateTime TimestampUtc { get; set; } = DateTime.UtcNow;
    public string Action { get; set; } = string.Empty;
    public string Actor { get; set; } = string.Empty;
    public string Details { get; set; } = string.Empty;
}

public sealed class AccessGateStatusDto
{
    public bool MasterGateOpen { get; set; }
    public bool UserHasAccess { get; set; }
    public bool IsPayingUser { get; set; }
    public bool IsAdmin { get; set; }
    public int DiscountPercent { get; set; } = 70;
    public int TotalPaidUsers { get; set; }
    public DateTime LastChangedUtc { get; set; }
    public string ChangedBy { get; set; } = string.Empty;
    public string Reason { get; set; } = string.Empty;
}

public sealed class AccessGateService
{
    private static AccessGateService? _current;
    public static AccessGateService? Current => _current;

    private readonly IWebHostEnvironment _environment;
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<AccessGateService> _logger;
    private readonly object _lock = new();
    private AccessGateState _state = new();
    private bool _loaded;
    private string? _stateFilePath;

    public AccessGateService(
        IWebHostEnvironment environment,
        IServiceProvider serviceProvider,
        ILogger<AccessGateService> logger)
    {
        _environment = environment;
        _serviceProvider = serviceProvider;
        _logger = logger;
        _current = this;
    }

    // Constructor for testing or lightweight initialization
    public AccessGateService(string stateFilePath, ILogger<AccessGateService> logger)
    {
        _environment = null!;
        _serviceProvider = null!;
        _logger = logger;
        _stateFilePath = stateFilePath;
        _current = this;
    }

    public bool IsMasterGateOpen()
    {
        EnsureLoaded();
        lock (_lock)
        {
            return _state.MasterGateOpen;
        }
    }

    public void SetMasterGate(bool open, string adminEmail, string? reason = null)
    {
        EnsureLoaded();
        var normalizedAdmin = string.IsNullOrWhiteSpace(adminEmail) ? "admin" : adminEmail.Trim();
        var defaultReason = open
            ? "Master gates OPEN: All users granted full access to all pricing features."
            : "Master gates CLOSED: Default locked. Access restricted to paying users and administrators.";
        var finalReason = string.IsNullOrWhiteSpace(reason) ? defaultReason : reason.Trim();

        lock (_lock)
        {
            _state.MasterGateOpen = open;
            _state.LastChangedUtc = DateTime.UtcNow;
            _state.ChangedBy = normalizedAdmin;
            _state.Reason = finalReason;

            _state.AuditLog.Add(new AccessGateAuditEvent
            {
                TimestampUtc = DateTime.UtcNow,
                Action = open ? "gates_opened" : "gates_closed",
                Actor = normalizedAdmin,
                Details = finalReason
            });

            PersistUnsafe();
        }

        _logger.LogInformation("Master feature gates set to {Status} by {Admin}. Reason: {Reason}",
            open ? "OPEN (All Access)" : "CLOSED (Default Locked)", normalizedAdmin, finalReason);
    }

    public void RecordPaymentReceived(string userId, string? email, string? planKey = null, string? source = null, string? notes = null)
    {
        EnsureLoaded();
        var safeUserId = (userId ?? string.Empty).Trim();
        var safeEmail = (email ?? string.Empty).Trim().ToLowerInvariant();
        var safePlan = string.IsNullOrWhiteSpace(planKey) ? "all_gates_unlocked" : planKey.Trim();
        var safeSource = string.IsNullOrWhiteSpace(source) ? "stripe_payment" : source.Trim();

        if (string.IsNullOrWhiteSpace(safeUserId) && string.IsNullOrWhiteSpace(safeEmail))
        {
            _logger.LogWarning("RecordPaymentReceived called without valid userId or email.");
            return;
        }

        lock (_lock)
        {
            if (!string.IsNullOrWhiteSpace(safeUserId))
            {
                _state.PaidUserIds.Add(safeUserId);
            }
            if (!string.IsNullOrWhiteSpace(safeEmail))
            {
                _state.PaidEmails.Add(safeEmail);
            }

            var grant = new AccessGatePaymentGrant
            {
                UserId = safeUserId,
                Email = safeEmail,
                PlanKey = safePlan,
                PaymentReceivedAtUtc = DateTime.UtcNow,
                Source = safeSource,
                Notes = notes ?? $"Payment received via {safeSource} for plan {safePlan}."
            };
            _state.PaymentGrants.Add(grant);

            _state.AuditLog.Add(new AccessGateAuditEvent
            {
                TimestampUtc = DateTime.UtcNow,
                Action = "payment_granted",
                Actor = "payment_system",
                Details = $"User {safeUserId} ({safeEmail}) granted all gate access via payment received for {safePlan}."
            });

            PersistUnsafe();
        }

        _logger.LogInformation("Payment received confirmed. Granted all-gate access for User={UserId}, Email={Email}, Plan={Plan}",
            safeUserId, safeEmail, safePlan);
    }

    public void GrantUserAccess(string userIdOrEmail, string adminEmail, string? reason = null)
    {
        EnsureLoaded();
        var identifier = (userIdOrEmail ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(identifier)) return;

        var isEmail = identifier.Contains('@');
        var safeEmail = isEmail ? identifier.ToLowerInvariant() : string.Empty;
        var safeUserId = isEmail ? string.Empty : identifier;

        lock (_lock)
        {
            if (!string.IsNullOrWhiteSpace(safeUserId)) _state.PaidUserIds.Add(safeUserId);
            if (!string.IsNullOrWhiteSpace(safeEmail)) _state.PaidEmails.Add(safeEmail);

            _state.PaymentGrants.Add(new AccessGatePaymentGrant
            {
                UserId = safeUserId,
                Email = safeEmail,
                PlanKey = "admin_granted_key",
                PaymentReceivedAtUtc = DateTime.UtcNow,
                Source = "admin_grant",
                Notes = reason ?? $"Access key granted by {adminEmail}"
            });

            _state.AuditLog.Add(new AccessGateAuditEvent
            {
                TimestampUtc = DateTime.UtcNow,
                Action = "user_granted",
                Actor = adminEmail,
                Details = $"Manual all-access key granted to {identifier}. Reason: {reason}"
            });

            PersistUnsafe();
        }
    }

    public void RevokeUserAccess(string userIdOrEmail, string adminEmail, string? reason = null)
    {
        EnsureLoaded();
        var identifier = (userIdOrEmail ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(identifier)) return;

        lock (_lock)
        {
            _state.PaidUserIds.Remove(identifier);
            _state.PaidEmails.Remove(identifier.ToLowerInvariant());

            _state.AuditLog.Add(new AccessGateAuditEvent
            {
                TimestampUtc = DateTime.UtcNow,
                Action = "user_revoked",
                Actor = adminEmail,
                Details = $"Access key revoked for {identifier}. Reason: {reason}"
            });

            PersistUnsafe();
        }
    }

    public bool HasAccess(ClaimsPrincipal? user, string? featureKey = null)
    {
        EnsureLoaded();

        // 1. Administrators always have full access
        if (AuthAccessPolicy.IsAllAccessAdmin(user))
        {
            return true;
        }

        // 2. If the Master Gate is open, ALL users have access to all gates
        if (IsMasterGateOpen())
        {
            return true;
        }

        // 3. If the Master Gate is closed, access is locked by default unless payment has been received
        if (user == null)
        {
            return false;
        }

        var userId = user.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? user.FindFirstValue("sub")
            ?? string.Empty;

        var email = user.FindFirstValue(ClaimTypes.Email)
            ?? user.FindFirstValue("email")
            ?? string.Empty;

        // Check paid status in memory state
        lock (_lock)
        {
            if (!string.IsNullOrWhiteSpace(userId) && _state.PaidUserIds.Contains(userId))
            {
                return true;
            }

            if (!string.IsNullOrWhiteSpace(email) && _state.PaidEmails.Contains(email.ToLowerInvariant()))
            {
                return true;
            }
        }

        // Check if user has an active subscription in the database
        if (!string.IsNullOrWhiteSpace(userId) && Guid.TryParse(userId, out var userGuid) && _serviceProvider != null)
        {
            try
            {
                using var scope = _serviceProvider.CreateScope();
                var db = scope.ServiceProvider.GetService<AppDbContext>();
                if (db != null)
                {
                    var hasSub = db.Set<UserSubscription>()
                        .AsNoTracking()
                        .Any(s => s.UserId == userGuid && !s.IsDeleted && (s.Status == "active" || s.Status == "trialing"));

                    if (hasSub)
                    {
                        // Cache in memory for quick subsequent lookups
                        lock (_lock)
                        {
                            _state.PaidUserIds.Add(userId);
                            if (!string.IsNullOrWhiteSpace(email)) _state.PaidEmails.Add(email.ToLowerInvariant());
                        }
                        return true;
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to check database subscription for user {UserId}", userId);
            }
        }

        return false;
    }

    public bool IsPayingUser(ClaimsPrincipal? user)
    {
        if (user == null) return false;
        EnsureLoaded();

        var userId = user.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? user.FindFirstValue("sub")
            ?? string.Empty;

        var email = user.FindFirstValue(ClaimTypes.Email)
            ?? user.FindFirstValue("email")
            ?? string.Empty;

        lock (_lock)
        {
            if (!string.IsNullOrWhiteSpace(userId) && _state.PaidUserIds.Contains(userId)) return true;
            if (!string.IsNullOrWhiteSpace(email) && _state.PaidEmails.Contains(email.ToLowerInvariant())) return true;
        }

        return false;
    }

    public AccessGateStatusDto GetStatus(ClaimsPrincipal? user)
    {
        EnsureLoaded();
        var isAdmin = AuthAccessPolicy.IsAllAccessAdmin(user);
        var isPaying = IsPayingUser(user);
        var open = IsMasterGateOpen();
        var hasAccess = isAdmin || open || isPaying;

        lock (_lock)
        {
            return new AccessGateStatusDto
            {
                MasterGateOpen = _state.MasterGateOpen,
                UserHasAccess = hasAccess,
                IsPayingUser = isPaying,
                IsAdmin = isAdmin,
                DiscountPercent = 70,
                TotalPaidUsers = _state.PaidUserIds.Count + _state.PaidEmails.Count,
                LastChangedUtc = _state.LastChangedUtc,
                ChangedBy = _state.ChangedBy,
                Reason = _state.Reason
            };
        }
    }

    public AccessGateState GetFullState()
    {
        EnsureLoaded();
        lock (_lock)
        {
            return new AccessGateState
            {
                MasterGateOpen = _state.MasterGateOpen,
                LastChangedUtc = _state.LastChangedUtc,
                ChangedBy = _state.ChangedBy,
                Reason = _state.Reason,
                PaidUserIds = new HashSet<string>(_state.PaidUserIds, StringComparer.OrdinalIgnoreCase),
                PaidEmails = new HashSet<string>(_state.PaidEmails, StringComparer.OrdinalIgnoreCase),
                PaymentGrants = new List<AccessGatePaymentGrant>(_state.PaymentGrants),
                AuditLog = new List<AccessGateAuditEvent>(_state.AuditLog)
            };
        }
    }

    private void EnsureLoaded()
    {
        if (_loaded) return;

        lock (_lock)
        {
            if (_loaded) return;

            _stateFilePath ??= ResolveStateFilePath();
            if (File.Exists(_stateFilePath))
            {
                try
                {
                    var json = File.ReadAllText(_stateFilePath);
                    var loaded = JsonSerializer.Deserialize<AccessGateState>(json);
                    _state = loaded ?? new AccessGateState();
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to load access gate state from {Path}. Starting with default OPEN gates.", _stateFilePath);
                    _state = new AccessGateState();
                }
            }
            else
            {
                _state = new AccessGateState(); // MasterGateOpen defaults to true
                try
                {
                    PersistUnsafe();
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Could not write initial access gate state file.");
                }
            }

            _loaded = true;
        }
    }

    private void PersistUnsafe()
    {
        try
        {
            _stateFilePath ??= ResolveStateFilePath();
            var dir = Path.GetDirectoryName(_stateFilePath);
            if (!string.IsNullOrWhiteSpace(dir) && !Directory.Exists(dir))
            {
                Directory.CreateDirectory(dir);
            }

            var json = JsonSerializer.Serialize(_state, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(_stateFilePath, json);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to persist access gate state to {Path}", _stateFilePath);
        }
    }

    private string ResolveStateFilePath()
    {
        if (_environment != null && !string.IsNullOrWhiteSpace(_environment.ContentRootPath))
        {
            return Path.Combine(_environment.ContentRootPath, "App_Data", "access_gates_state.json");
        }

        var baseDir = AppContext.BaseDirectory;
        return Path.Combine(baseDir, "App_Data", "access_gates_state.json");
    }
}
