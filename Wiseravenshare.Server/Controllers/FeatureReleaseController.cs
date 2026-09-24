using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.DTOs;
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

    public FeatureReleaseController(
        IFeatureCompartmentService featureCompartmentService,
        ISubscriptionService subscriptionService,
        IConfiguration configuration)
    {
        _featureCompartmentService = featureCompartmentService;
        _subscriptionService = subscriptionService;
        _configuration = configuration;
    }

    // ── Admin: GET /api/admin/feature-release/catalog ────────────────────────
    [Authorize]
    [HttpGet("api/admin/feature-release/catalog")]
    public async Task<IActionResult> GetCatalog(CancellationToken cancellationToken)
    {
        if (!IsAdminRequest()) return Forbid();

        var compartments = await _featureCompartmentService.GetInventoryAsync(cancellationToken);
        var lockMap = compartments.ToDictionary(c => c.Key, c => c.IsLocked, StringComparer.OrdinalIgnoreCase);

        var features = TierCatalog.Select(entry => new
        {
            key          = entry.Key,
            name         = entry.Name,
            description  = entry.Description,
            requiredTier = entry.RequiredTier,
            category     = entry.Category,
            isLocked     = lockMap.TryGetValue(entry.Key, out var locked) && locked,
            status       = lockMap.TryGetValue(entry.Key, out var l2) && l2 ? "gated" : "released"
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

        var accessible = TierCatalog.Select(entry =>
        {
            var isLocked       = lockMap.TryGetValue(entry.Key, out var l) && l;
            var tierIndex      = Array.IndexOf(TierOrder, entry.RequiredTier);
            var userTierIndex  = Array.IndexOf(TierOrder, userTier);
            var hasTierAccess  = userTierIndex >= tierIndex;
            var canAccess      = !isLocked && hasTierAccess;

            return new
            {
                key          = entry.Key,
                name         = entry.Name,
                canAccess,
                isLocked,
                hasTierAccess,
                requiredTier = entry.RequiredTier,
                userTier,
                reason       = !canAccess
                    ? (isLocked ? "Feature is temporarily locked by admin." : $"Requires '{entry.RequiredTier}' plan.")
                    : (string?)null
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
