using System.Security.Claims;
using Microsoft.Extensions.Configuration;

namespace Wiseravenshare.Server.Services;

public static class AuthAccessPolicy
{
    private static readonly HashSet<string> CreatorBypassRoles = new(StringComparer.OrdinalIgnoreCase)
    {
        "owner",
        "producer",
        "host",
        "editor",
        "script-lead",
        "creator",
        "radio-station-creator",
        "radiostation-creator",
        "karaoke-creator"
    };

    public static bool IsAdminLoginAllowed(string? email, IEnumerable<string>? configuredEmails)
    {
        if (string.IsNullOrWhiteSpace(email))
        {
            return false;
        }

        var normalizedEmail = email.Trim();
        var configured = (configuredEmails ?? Enumerable.Empty<string>())
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Select(value => value.Trim())
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        return configured.Count > 0 && configured.Contains(normalizedEmail);
    }

    public static IReadOnlyCollection<string> GetConfiguredAdminEmails(IEnumerable<string>? configuredAdminEmails, IEnumerable<string>? configuredAuthUsers)
    {
        var values = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var value in configuredAdminEmails ?? Enumerable.Empty<string>())
        {
            if (!string.IsNullOrWhiteSpace(value))
            {
                values.Add(value.Trim());
            }
        }

        foreach (var value in configuredAuthUsers ?? Enumerable.Empty<string>())
        {
            if (!string.IsNullOrWhiteSpace(value))
            {
                values.Add(value.Trim());
            }
        }

        return values;
    }

    public static IReadOnlyCollection<string> ResolveConfiguredAdminEmails(IConfiguration configuration)
    {
        if (configuration is null)
        {
            return Array.Empty<string>();
        }

        var adminSection = configuration.GetSection("Admin:Emails");
        var adminArray = adminSection.Get<string[]>() ?? [];
        var adminScalarValues = (adminSection.Value ?? string.Empty)
            .Split(new[] { ',', ';', '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        return GetConfiguredAdminEmails(adminArray.Concat(adminScalarValues), Array.Empty<string>());
    }

    public static bool IsConfiguredAdminEmail(IConfiguration configuration, string? email)
    {
        return IsAdminLoginAllowed(email, ResolveConfiguredAdminEmails(configuration));
    }

    /// <summary>
    /// Configuration key controlling whether paid features are temporarily free.
    /// </summary>
    public const string PaywallBypassConfigKey = "Features:Paywalls:Bypass";

    /// <summary>
    /// True when paywalls are suspended site-wide.
    ///
    /// While the site is running free, gated endpoints allow every authenticated
    /// user through as if they held an active subscription. This is a deliberate
    /// switch, not a removal: the 402 branches remain in place and become
    /// reachable again the moment this returns false. Set
    /// <c>Features:Paywalls:Bypass=false</c> to restore paid gating exactly as it
    /// was — no code change required.
    ///
    /// Intended to be driven by configuration only, so the decision of what to
    /// charge and for what stays reversible while pricing is settled.
    /// </summary>
    public static bool ArePaywallsBypassed(IConfiguration? configuration)
    {
        if (configuration is null)
        {
            return false;
        }

        var configured = configuration[PaywallBypassConfigKey];
        if (string.IsNullOrWhiteSpace(configured))
        {
            // Default is bypassed: the site runs free until pricing is set.
            // Flip the key to "false" to switch paid gating back on.
            return true;
        }

        return !string.Equals(configured.Trim(), "false", StringComparison.OrdinalIgnoreCase);
    }

    public static bool IsAllAccessAdmin(ClaimsPrincipal? user)
    {
        if (user is null)
        {
            return false;
        }

        var accessScope = user.FindFirstValue("access_scope") ?? string.Empty;
        if (string.Equals(accessScope, "admin", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        var adminPassClaim = user.FindFirstValue("admin_pass") ?? string.Empty;
        if (string.Equals(adminPassClaim, "all-access", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        var role = user.FindFirstValue(ClaimTypes.Role) ?? user.FindFirstValue("role") ?? string.Empty;
        return string.Equals(role, "admin", StringComparison.OrdinalIgnoreCase);
    }

    public static bool HasCreatorPaywallBypassRole(ClaimsPrincipal? user)
    {
        if (user is null)
        {
            return false;
        }

        var claims = user.Claims
            .Where(claim =>
                string.Equals(claim.Type, ClaimTypes.Role, StringComparison.OrdinalIgnoreCase)
                || string.Equals(claim.Type, "teamRole", StringComparison.OrdinalIgnoreCase)
                || string.Equals(claim.Type, "team_role", StringComparison.OrdinalIgnoreCase))
            .Select(claim => claim.Value)
            .Where(value => !string.IsNullOrWhiteSpace(value));

        foreach (var claimValue in claims)
        {
            if (CreatorBypassRoles.Contains(claimValue.Trim()))
            {
                return true;
            }
        }

        return false;
    }

    public static bool HasPaywallBypassAccess(ClaimsPrincipal? user, IConfiguration? configuration)
    {
        return ArePaywallsBypassed(configuration)
            || IsAllAccessAdmin(user)
            || HasCreatorPaywallBypassRole(user);
    }
}
