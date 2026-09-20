using Microsoft.Extensions.Configuration;

namespace Wiseravenshare.Server.Services;

public static class AuthAccessPolicy
{
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

        var configuredAuthUsers = configuration.GetSection("Authentication:Users").GetChildren()
            .Select(section => section["Email"] ?? section.Value)
            .Where(value => !string.IsNullOrWhiteSpace(value));

        return GetConfiguredAdminEmails(adminArray.Concat(adminScalarValues), configuredAuthUsers);
    }

    public static bool IsConfiguredAdminEmail(IConfiguration configuration, string? email)
    {
        return IsAdminLoginAllowed(email, ResolveConfiguredAdminEmails(configuration));
    }
}
