using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.DTOs;
using Wiseravenshare.Server.Entities.Access;
using Wiseravenshare.Server.Infrastructure.Data;
using Wiseravenshare.Server.Services;
using Wiseravenshare.Server.Shared;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Produces("application/json")]
public sealed class FeatureReleaseController : ControllerBase
{
    // ── Pricing tier feature catalog ──────────────────────────────────────────
    private static readonly FeatureTierCatalogEntry[] TierCatalog =
    [
        // key, displayName, description, requiredTier, category
        new("guided-studio-flow",  "Guided Studio Flow",   "Podcast workflow navigator: Plan → Script → Record → Ship.",        "podcast-pro",   "Podcast Studio"),
        new("podcast-pro-bundle",  "Podcast Pro Bundle",   "Full access to all podcast studio capabilities.",                   "podcast-pro",   "Podcast Studio"),
        new("podcast-analytics",   "Podcast Analytics",    "Audience insights and trending content signals for podcasters.",    "growth-suite",  "Podcast Studio"),
        new("team-workflows",      "Team Workflows",        "Multi-role approval chains, review lanes, and editor handoffs.",    "studio-plus",   "Podcast Studio"),
        new("script-pipeline",     "Script Pipeline",       "Structured 4-segment script pipeline for show production.",        "copy-standard", "Copywriting"),
        new("ai-copywriting",      "AI Copywriting",        "AI-assisted script and copy generation from the assistant.",       "copy-pro",      "Copywriting"),
        new("media-library",       "Media Library",         "Full media upload, organisation, and library management.",         "creator-pro",   "Core Platform"),
        new("growth-analytics",    "Growth Analytics",      "Platform-wide audience and trend analytics dashboard.",            "growth-suite",  "Core Platform"),
        new("revenue-console",     "Revenue Console",       "Revenue tracking, evidence tooling, and agent reporting.",         "creator-pro",   "Core Platform"),
        new("podcast-admin-gateway", "Podcast Admin Gateway", "Admin-only: Release, gate, and manage podcast features for the platform.", "admin", "Admin"),
    ];

    // ── Tier ordering (lower index = lower tier) ──────────────────────────────
    private static readonly string[] TierOrder =
    [
        "free", "creator-pro", "copy-standard", "copy-pro", "growth-suite", "studio-plus", "podcast-pro", "admin"
    ];

    // ── Pricing display catalog ───────────────────────────────────────────────
    private static readonly PricingPlanDisplay[] PricingPlans =
    [
        new("free",          "Free",                 "Basic social platform",                      0,     0,   "Core Platform"),
        new("creator-pro",   "Creator Pro",          "Enhanced profiles, media, scheduling",       1900,  19000,  "Core Platform"),
        new("growth-suite",  "Growth Suite",         "Analytics, audience insights, trending",     4900,  49000,  "Core Platform"),
        new("studio-plus",   "Studio Plus",          "Team workflows, collaboration, roles",       9900,  99000,  "Core Platform"),
        new("podcast-pro",   "Podcast Pro Bundle",   "Full podcast studio (Growth + Studio Plus)", 14900, 149000, "Core Platform"),
        new("copy-standard", "Copy Standard",        "Script templates and pipeline segments",     900,   9000,   "Copywriting"),
        new("copy-pro",      "Copy Pro",             "AI-assisted script and copy generation",     2900,  29000,  "Copywriting"),
    ];

    private readonly IFeatureCompartmentService _featureCompartmentService;
    private readonly ISubscriptionService _subscriptionService;
    private readonly IConfiguration _configuration;
    private readonly AppDbContext _db;

    public FeatureReleaseController(
        IFeatureCompartmentService featureCompartmentService,
        ISubscriptionService subscriptionService,
        IConfiguration configuration,
        AppDbContext db)
    {
        _featureCompartmentService = featureCompartmentService;
        _subscriptionService = subscriptionService;
        _configuration = configuration;
        _db = db;
    }

    // ── Admin: GET /api/admin/feature-release/catalog ────────────────────────
    [Authorize]
    [HttpGet("api/admin/feature-release/catalog")]
    public async Task<IActionResult> GetCatalog(CancellationToken cancellationToken)
    {
        if (!IsAdminRequest()) return Forbid();

        var compartments = await _featureCompartmentService.GetInventoryAsync(cancellationToken);
        var lockMap = compartments.ToDictionary(c => c.Key, c => c.IsLocked, StringComparer.OrdinalIgnoreCase);
        var userOverrides = await _db.FeatureFlags
            .AsNoTracking()
            .Where(flag => flag.Scope == FeatureScope.User)
            .ToListAsync(cancellationToken);

        var userIdsFromOverrides = userOverrides
            .Select(overrideFlag => TryParseUserId(overrideFlag.ScopeValue, out var parsedUserId) ? parsedUserId : Guid.Empty)
            .Where(parsedUserId => parsedUserId != Guid.Empty)
            .Distinct()
            .ToList();

        var userEmailMap = await _db.Users
            .AsNoTracking()
            .Where(user => userIdsFromOverrides.Contains(user.Id))
            .ToDictionaryAsync(user => user.Id, user => user.Email, cancellationToken);

        var features = TierCatalog.Select(entry => new
        {
            key          = entry.Key,
            name         = entry.Name,
            description  = entry.Description,
            requiredTier = entry.RequiredTier,
            category     = entry.Category,
            isLocked     = lockMap.TryGetValue(entry.Key, out var locked) && locked,
            status       = lockMap.TryGetValue(entry.Key, out var l2) && l2 ? "gated" : "released",
            userGrantCount = userOverrides.Count(flag =>
                string.Equals(flag.FeatureKey, entry.Key, StringComparison.OrdinalIgnoreCase)
                && flag.State == FeatureState.Enabled),
            userBlockCount = userOverrides.Count(flag =>
                string.Equals(flag.FeatureKey, entry.Key, StringComparison.OrdinalIgnoreCase)
                && flag.State == FeatureState.Disabled),
            userOverrides = userOverrides
                .Where(flag => string.Equals(flag.FeatureKey, entry.Key, StringComparison.OrdinalIgnoreCase))
                .OrderByDescending(flag => flag.UpdatedAt)
                .Select(flag =>
                {
                    var hasUser = TryParseUserId(flag.ScopeValue, out var parsedUserId);
                    var email = hasUser && userEmailMap.TryGetValue(parsedUserId, out var value) ? value : string.Empty;
                    return new
                    {
                        userId = hasUser ? parsedUserId.ToString("N") : (flag.ScopeValue ?? string.Empty),
                        userEmail = email,
                        state = flag.State.ToString().ToLowerInvariant(),
                        reason = flag.Notes,
                        updatedAt = flag.UpdatedAt
                    };
                })
                .Take(25)
                .ToList()
        }).ToList();

        return Ok(new
        {
            features,
            pricingPlans   = PricingPlans,
            tierOrder      = TierOrder,
            totalFeatures  = features.Count,
            gatedCount     = features.Count(f => f.status == "gated"),
            releasedCount  = features.Count(f => f.status == "released")
        });
    }

    // ── Admin: GET /api/admin/feature-release/{key}/user-overrides ───────────
    [Authorize]
    [HttpGet("api/admin/feature-release/{key}/user-overrides")]
    public async Task<IActionResult> GetUserOverrides(string key, CancellationToken cancellationToken)
    {
        if (!IsAdminRequest()) return Forbid();

        var overrides = await _db.FeatureFlags
            .AsNoTracking()
            .Where(flag => flag.Scope == FeatureScope.User && flag.FeatureKey == key)
            .OrderByDescending(flag => flag.UpdatedAt)
            .ToListAsync(cancellationToken);

        var userIds = overrides
            .Select(overrideFlag => TryParseUserId(overrideFlag.ScopeValue, out var parsedUserId) ? parsedUserId : Guid.Empty)
            .Where(parsedUserId => parsedUserId != Guid.Empty)
            .Distinct()
            .ToList();

        var userEmailMap = await _db.Users
            .AsNoTracking()
            .Where(user => userIds.Contains(user.Id))
            .ToDictionaryAsync(user => user.Id, user => user.Email, cancellationToken);

        return Ok(new
        {
            key,
            overrides = overrides.Select(flag =>
            {
                var hasUser = TryParseUserId(flag.ScopeValue, out var parsedUserId);
                var email = hasUser && userEmailMap.TryGetValue(parsedUserId, out var value) ? value : string.Empty;
                return new
                {
                    userId = hasUser ? parsedUserId.ToString("N") : (flag.ScopeValue ?? string.Empty),
                    userEmail = email,
                    state = flag.State.ToString().ToLowerInvariant(),
                    reason = flag.Notes,
                    updatedAt = flag.UpdatedAt
                };
            }).ToList()
        });
    }

    // ── Admin: PUT /api/admin/feature-release/{key}/release ──────────────────
    [Authorize]
    [HttpPut("api/admin/feature-release/{key}/release")]
    public async Task<IActionResult> ReleaseFeature(
        string key,
        [FromBody] FeatureReleaseRequest? request,
        CancellationToken cancellationToken)
    {
        if (!IsAdminRequest()) return Forbid();

        var email = AdminEmail();
        var reason = string.IsNullOrWhiteSpace(request?.Reason)
            ? $"Released by admin {email}"
            : request.Reason.Trim();

        var result = await _featureCompartmentService.SetLockAsync(key, false, reason, email, cancellationToken);
        return Ok(new
        {
            message   = $"Feature '{key}' released. All eligible users may now access it.",
            key,
            isLocked  = result.IsLocked,
            status    = "released"
        });
    }

    // ── Admin: PUT /api/admin/feature-release/{key}/gate ─────────────────────
    [Authorize]
    [HttpPut("api/admin/feature-release/{key}/gate")]
    public async Task<IActionResult> GateFeature(
        string key,
        [FromBody] FeatureReleaseRequest? request,
        CancellationToken cancellationToken)
    {
        if (!IsAdminRequest()) return Forbid();

        var email = AdminEmail();
        var tier  = TierCatalog.FirstOrDefault(e => string.Equals(e.Key, key, StringComparison.OrdinalIgnoreCase))?.RequiredTier ?? "unknown";
        var reason = string.IsNullOrWhiteSpace(request?.Reason)
            ? $"Gated behind '{tier}' tier by admin {email}"
            : request.Reason.Trim();

        var result = await _featureCompartmentService.SetLockAsync(key, true, reason, email, cancellationToken);
        return Ok(new
        {
            message  = $"Feature '{key}' gated. Requires '{tier}' plan.",
            key,
            isLocked = result.IsLocked,
            status   = "gated",
            tier
        });
    }

    // ── Admin: PUT /api/admin/feature-release/{key}/users/{userId}/grant ────
    [Authorize]
    [HttpPut("api/admin/feature-release/{key}/users/{userId}/grant")]
    public async Task<IActionResult> GrantFeatureToUser(
        string key,
        string userId,
        [FromBody] FeatureUserOverrideRequest? request,
        CancellationToken cancellationToken)
    {
        if (!IsAdminRequest()) return Forbid();

        var parsedUserId = await ResolveUserIdAsync(userId, cancellationToken);
        if (parsedUserId is null)
        {
            return NotFound(new { message = "Target user was not found." });
        }

        var email = AdminEmail();
        var reason = string.IsNullOrWhiteSpace(request?.Reason)
            ? $"Feature '{key}' granted to user by admin {email}"
            : request!.Reason!.Trim();

        var flag = await UpsertUserFeatureOverrideAsync(key, parsedUserId.Value, FeatureState.Enabled, reason, cancellationToken);
        return Ok(new
        {
            key,
            userId = parsedUserId.Value.ToString("N"),
            state = flag.State.ToString().ToLowerInvariant(),
            reason = flag.Notes,
            updatedAt = flag.UpdatedAt,
            message = $"Feature '{key}' granted to user '{parsedUserId.Value:N}'."
        });
    }

    // ── Admin: PUT /api/admin/feature-release/{key}/users/{userId}/block ────
    [Authorize]
    [HttpPut("api/admin/feature-release/{key}/users/{userId}/block")]
    public async Task<IActionResult> BlockFeatureForUser(
        string key,
        string userId,
        [FromBody] FeatureUserOverrideRequest? request,
        CancellationToken cancellationToken)
    {
        if (!IsAdminRequest()) return Forbid();

        var parsedUserId = await ResolveUserIdAsync(userId, cancellationToken);
        if (parsedUserId is null)
        {
            return NotFound(new { message = "Target user was not found." });
        }

        var email = AdminEmail();
        var reason = string.IsNullOrWhiteSpace(request?.Reason)
            ? $"Feature '{key}' blocked for user by admin {email}"
            : request!.Reason!.Trim();

        var flag = await UpsertUserFeatureOverrideAsync(key, parsedUserId.Value, FeatureState.Disabled, reason, cancellationToken);
        return Ok(new
        {
            key,
            userId = parsedUserId.Value.ToString("N"),
            state = flag.State.ToString().ToLowerInvariant(),
            reason = flag.Notes,
            updatedAt = flag.UpdatedAt,
            message = $"Feature '{key}' blocked for user '{parsedUserId.Value:N}'."
        });
    }

    // ── Admin: DELETE /api/admin/feature-release/{key}/users/{userId}/override ─
    [Authorize]
    [HttpDelete("api/admin/feature-release/{key}/users/{userId}/override")]
    public async Task<IActionResult> ClearUserFeatureOverride(
        string key,
        string userId,
        CancellationToken cancellationToken)
    {
        if (!IsAdminRequest()) return Forbid();

        var parsedUserId = await ResolveUserIdAsync(userId, cancellationToken);
        if (parsedUserId is null)
        {
            return NotFound(new { message = "Target user was not found." });
        }

        var normalizedUserId = parsedUserId.Value.ToString("N");
        var legacyUserId = parsedUserId.Value.ToString();

        var overrides = await _db.FeatureFlags
            .Where(flag => flag.Scope == FeatureScope.User
                && flag.FeatureKey == key
                && (flag.ScopeValue == normalizedUserId || flag.ScopeValue == legacyUserId))
            .ToListAsync(cancellationToken);

        if (overrides.Count == 0)
        {
            return NotFound(new { message = "No user override exists for this feature and user." });
        }

        _db.FeatureFlags.RemoveRange(overrides);
        await _db.SaveChangesAsync(cancellationToken);

        return Ok(new
        {
            key,
            userId = normalizedUserId,
            message = "User-specific feature override cleared. Default release and tier rules now apply."
        });
    }

    // ── Admin: POST /api/admin/feature-release/release-all ───────────────────
    [Authorize]
    [HttpPost("api/admin/feature-release/release-all")]
    public async Task<IActionResult> ReleaseAll(
        [FromBody] FeatureReleaseRequest? request,
        CancellationToken cancellationToken)
    {
        if (!IsAdminRequest()) return Forbid();

        var email  = AdminEmail();
        var reason = string.IsNullOrWhiteSpace(request?.Reason) ? $"Bulk release by admin {email}" : request.Reason.Trim();

        var released = new List<string>();
        foreach (var entry in TierCatalog)
        {
            await _featureCompartmentService.SetLockAsync(entry.Key, false, reason, email, cancellationToken);
            released.Add(entry.Key);
        }

        return Ok(new { message = $"Released {released.Count} features.", released, count = released.Count });
    }

    // ── Admin: POST /api/admin/feature-release/gate-all ──────────────────────
    [Authorize]
    [HttpPost("api/admin/feature-release/gate-all")]
    public async Task<IActionResult> GateAll(
        [FromBody] FeatureReleaseRequest? request,
        CancellationToken cancellationToken)
    {
        if (!IsAdminRequest()) return Forbid();

        var email  = AdminEmail();
        var reason = string.IsNullOrWhiteSpace(request?.Reason) ? $"Bulk gate by admin {email}" : request.Reason.Trim();

        var gated = new List<string>();
        foreach (var entry in TierCatalog)
        {
            var tier = entry.RequiredTier;
            var r    = string.IsNullOrWhiteSpace(reason) ? $"Gated behind '{tier}' tier" : reason;
            await _featureCompartmentService.SetLockAsync(entry.Key, true, r, email, cancellationToken);
            gated.Add(entry.Key);
        }

        return Ok(new { message = $"Gated {gated.Count} features.", gated, count = gated.Count });
    }

    // ── Admin: PUT /api/admin/feature-release/podcast-gateway/enable-all ──────
    /// <summary>
    /// Admins use this to release ALL podcast control room features at once (bundles).
    /// This is the primary admin flow for enabling podcasting capability across the platform.
    /// </summary>
    [Authorize]
    [HttpPut("api/admin/feature-release/podcast-gateway/enable-all")]
    public async Task<IActionResult> EnablePodcastGateway(
        [FromBody] FeatureReleaseRequest? request,
        CancellationToken cancellationToken)
    {
        if (!IsAdminRequest()) return Forbid();

        var email = AdminEmail();
        var reason = string.IsNullOrWhiteSpace(request?.Reason) 
            ? $"Podcast control room enabled by admin {email}" 
            : request.Reason.Trim();

        var podcastFeatures = TierCatalog
            .Where(e => string.Equals(e.Category, "Podcast Studio", StringComparison.OrdinalIgnoreCase))
            .ToList();

        var released = new List<string>();
        foreach (var entry in podcastFeatures)
        {
            await _featureCompartmentService.SetLockAsync(entry.Key, false, reason, email, cancellationToken);
            released.Add(entry.Key);
        }

        return Ok(new
        {
            message = $"Podcast control room enabled. Released {released.Count} features for all eligible users.",
            released,
            count = released.Count,
            adminEmail = email
        });
    }

    // ── Admin: PUT /api/admin/feature-release/podcast-gateway/disable-all ─────
    /// <summary>
    /// Admins use this to gate ALL podcast control room features at once (for maintenance/rollback).
    /// </summary>
    [Authorize]
    [HttpPut("api/admin/feature-release/podcast-gateway/disable-all")]
    public async Task<IActionResult> DisablePodcastGateway(
        [FromBody] FeatureReleaseRequest? request,
        CancellationToken cancellationToken)
    {
        if (!IsAdminRequest()) return Forbid();

        var email = AdminEmail();
        var reason = string.IsNullOrWhiteSpace(request?.Reason)
            ? $"Podcast control room disabled by admin {email}"
            : request.Reason.Trim();

        var podcastFeatures = TierCatalog
            .Where(e => string.Equals(e.Category, "Podcast Studio", StringComparison.OrdinalIgnoreCase))
            .ToList();

        var gated = new List<string>();
        foreach (var entry in podcastFeatures)
        {
            await _featureCompartmentService.SetLockAsync(entry.Key, true, reason, email, cancellationToken);
            gated.Add(entry.Key);
        }

        return Ok(new
        {
            message = $"Podcast control room disabled. Gated {gated.Count} features behind 'podcast-pro' tier.",
            gated,
            count = gated.Count,
            adminEmail = email,
            reason = reason
        });
    }

    // ── Any user: GET /api/features/my-access ────────────────────────────────
    [Authorize]
    [HttpGet("api/features/my-access")]
    public async Task<IActionResult> GetMyAccess(CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();

        // Admin gets all features
        var adminEmail = User.FindFirstValue(ClaimTypes.Email) ?? User.FindFirstValue("email") ?? string.Empty;
        var isAdmin    = AuthAccessPolicy.IsConfiguredAdminEmail(_configuration, adminEmail);
        if (!isAdmin)
        {
            var accessScope    = User.FindFirstValue("access_scope") ?? string.Empty;
            var adminPassClaim = User.FindFirstValue("admin_pass") ?? string.Empty;
            isAdmin = string.Equals(accessScope, "admin", StringComparison.OrdinalIgnoreCase)
                   || string.Equals(adminPassClaim, "all-access", StringComparison.OrdinalIgnoreCase);
        }

        // Load Stripe subscription
        SubscriptionStatusDto? sub = null;
        try { sub = await _subscriptionService.GetSubscriptionStatusAsync(userId); }
        catch { /* treat as no subscription */ }

        var userTier = isAdmin ? "admin" : ResolveTierFromPriceId(sub?.PriceId, sub?.HasActiveSubscription ?? false);

        // Load all compartment locks
        var compartments = await _featureCompartmentService.GetInventoryAsync(cancellationToken);
        var lockMap      = compartments.ToDictionary(c => c.Key, c => c.IsLocked, StringComparer.OrdinalIgnoreCase);
        var userOverrideMap = await LoadUserOverrideMapAsync(userId, cancellationToken);

        var accessible = TierCatalog.Select(entry =>
        {
            var isLocked       = lockMap.TryGetValue(entry.Key, out var l) && l;
            var tierIndex      = Array.IndexOf(TierOrder, entry.RequiredTier);
            var userTierIndex  = Array.IndexOf(TierOrder, userTier);
            var hasTierAccess  = userTierIndex >= tierIndex;
            userOverrideMap.TryGetValue(entry.Key, out var userOverrideState);

            var canAccess = userOverrideState switch
            {
                FeatureState.Disabled => false,
                FeatureState.Enabled => true,
                _ => !isLocked && hasTierAccess
            };

            var reason = !canAccess
                ? (userOverrideState == FeatureState.Disabled
                    ? "Feature is blocked for this user by admin override."
                    : (isLocked ? "Feature is temporarily locked by admin." : $"Requires '{entry.RequiredTier}' plan."))
                : (string?)null;

            var accessSource = userOverrideState switch
            {
                FeatureState.Disabled => "user-override-block",
                FeatureState.Enabled => "user-override-grant",
                _ => "tier-and-release-policy"
            };

            return new
            {
                key          = entry.Key,
                name         = entry.Name,
                canAccess,
                isLocked,
                hasTierAccess,
                requiredTier = entry.RequiredTier,
                userTier,
                reason,
                accessSource
            };
        }).ToList();

        return Ok(new
        {
            userTier,
            isAdmin,
            hasActiveSubscription = sub?.HasActiveSubscription ?? isAdmin,
            features = accessible
        });
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    private bool IsAdminRequest()
    {
        var email = AdminEmail();
        return AuthAccessPolicy.IsConfiguredAdminEmail(_configuration, email);
    }

    private string AdminEmail()
        => User.FindFirstValue(ClaimTypes.Email) ?? User.FindFirstValue("email") ?? string.Empty;

    private static string ResolveTierFromPriceId(string? priceId, bool hasActiveSub)
    {
        if (!hasActiveSub || string.IsNullOrWhiteSpace(priceId))
            return "free";

        var p = priceId.Trim().ToLowerInvariant();

        if (p == "admin-pass" || p == "admin_all_access") return "admin";
        if (p.Contains("podcast_pro") || p.Contains("podcast-pro")) return "podcast-pro";
        if (p.Contains("studio_plus") || p.Contains("studio-plus")) return "studio-plus";
        if (p.Contains("growth_suite") || p.Contains("growth-suite")) return "growth-suite";
        if (p.Contains("copy_pro") || p.Contains("copy-pro")) return "copy-pro";
        if (p.Contains("copy_standard") || p.Contains("copy-standard")) return "copy-standard";
        if (p.Contains("creator_pro") || p.Contains("creator-pro")) return "creator-pro";

        return hasActiveSub ? "creator-pro" : "free";
    }

    private async Task<Dictionary<string, FeatureState>> LoadUserOverrideMapAsync(Guid userId, CancellationToken cancellationToken)
    {
        var userIdCompact = userId.ToString("N");
        var userIdDefault = userId.ToString();

        var overrides = await _db.FeatureFlags
            .AsNoTracking()
            .Where(flag => flag.Scope == FeatureScope.User && (flag.ScopeValue == userIdCompact || flag.ScopeValue == userIdDefault))
            .ToListAsync(cancellationToken);

        return overrides
            .GroupBy(flag => flag.FeatureKey, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(
                group => group.Key,
                group => group.OrderByDescending(flag => flag.UpdatedAt).First().State,
                StringComparer.OrdinalIgnoreCase);
    }

    private static bool TryParseUserId(string? value, out Guid userId)
    {
        if (!string.IsNullOrWhiteSpace(value) && Guid.TryParse(value.Trim(), out userId))
        {
            return true;
        }

        userId = Guid.Empty;
        return false;
    }

    private async Task<Guid?> ResolveUserIdAsync(string inputUserId, CancellationToken cancellationToken)
    {
        if (TryParseUserId(inputUserId, out var parsedUserId))
        {
            var exists = await _db.Users.AnyAsync(user => user.Id == parsedUserId, cancellationToken);
            return exists ? parsedUserId : null;
        }

        var byEmail = await _db.Users
            .AsNoTracking()
            .SingleOrDefaultAsync(user => user.Email == inputUserId, cancellationToken);
        return byEmail?.Id;
    }

    private async Task<FeatureFlag> UpsertUserFeatureOverrideAsync(
        string key,
        Guid userId,
        FeatureState state,
        string reason,
        CancellationToken cancellationToken)
    {
        var scopeValue = userId.ToString("N");

        var existing = await _db.FeatureFlags
            .SingleOrDefaultAsync(flag =>
                flag.FeatureKey == key
                && flag.Scope == FeatureScope.User
                && flag.ScopeValue == scopeValue,
                cancellationToken);

        if (existing is null)
        {
            existing = new FeatureFlag
            {
                FeatureKey = key,
                Scope = FeatureScope.User,
                ScopeValue = scopeValue,
                State = state,
                Notes = reason,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            _db.FeatureFlags.Add(existing);
        }
        else
        {
            existing.State = state;
            existing.Notes = reason;
            existing.UpdatedAt = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync(cancellationToken);
        return existing;
    }
}

// ── DTOs ──────────────────────────────────────────────────────────────────────
public sealed record FeatureTierCatalogEntry(
    string Key,
    string Name,
    string Description,
    string RequiredTier,
    string Category);

public sealed record PricingPlanDisplay(
    string Id,
    string Name,
    string Tagline,
    int MonthlyPriceCents,
    int AnnualPriceCents,
    string Category);

public sealed class FeatureReleaseRequest
{
    public string? Reason { get; set; }
}

public sealed class FeatureUserOverrideRequest
{
    public string? Reason { get; set; }
}
