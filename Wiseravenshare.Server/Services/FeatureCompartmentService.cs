using System.Data;
using System.Security.Claims;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Wiseravenshare.Server.Infrastructure.Data;

namespace Wiseravenshare.Server.Services;

public interface IFeatureCompartmentService
{
    Task<IReadOnlyList<FeatureCompartmentStatusDto>> GetInventoryAsync(CancellationToken cancellationToken = default);
    Task<FeatureCompartmentStatusDto?> GetStatusAsync(string compartmentKey, CancellationToken cancellationToken = default);
    Task<FeatureCompartmentStatusDto> SetLockAsync(string compartmentKey, bool locked, string? reason, string? lockedByEmail, CancellationToken cancellationToken = default);
    Task<FeatureCompartmentStatusDto> SetAvailabilityAsync(string compartmentKey, string availabilityMode, string? reason, string? updatedByEmail, CancellationToken cancellationToken = default);
    Task<bool> IsLockedAsync(string compartmentKey, CancellationToken cancellationToken = default);
}

public sealed record FeatureCompartmentEndpointDto(
    string Method,
    string Route,
    string Controller,
    string Action);

public sealed record FeatureCompartmentStatusDto(
    string Key,
    string Name,
    string Description,
    string AvailabilityMode,
    bool IsLocked,
    DateTime? LockedAtUtc,
    string? LockedByEmail,
    string? Reason,
    int EndpointCount,
    IReadOnlyList<FeatureCompartmentEndpointDto> Endpoints);

public sealed class FeatureCompartmentLockRequest
{
    public bool Locked { get; set; }
    public string? Reason { get; set; }
}

public sealed class FeatureCompartmentAvailabilityRequest
{
    public string? Mode { get; set; }
    public string? Reason { get; set; }
}

public sealed class FeatureCompartmentAttribute : Attribute
{
    public FeatureCompartmentAttribute(string key)
    {
        Key = key;
    }

    public string Key { get; }
}

public sealed class FeatureCompartmentLockFilter : IAsyncActionFilter
{
    private readonly IFeatureCompartmentService _featureCompartmentService;

    public FeatureCompartmentLockFilter(IFeatureCompartmentService featureCompartmentService)
    {
        _featureCompartmentService = featureCompartmentService;
    }

    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var featureAttributes = context.ActionDescriptor.EndpointMetadata
            .OfType<FeatureCompartmentAttribute>()
            .ToArray();

        if (featureAttributes.Length == 0)
        {
            await next();
            return;
        }

        foreach (var attribute in featureAttributes)
        {
            if (await _featureCompartmentService.IsLockedAsync(attribute.Key, context.HttpContext.RequestAborted))
            {
                context.Result = new ObjectResult(new
                {
                    message = $"Feature compartment '{attribute.Key}' is temporarily locked."
                })
                {
                    StatusCode = StatusCodes.Status423Locked
                };
                return;
            }
        }

        await next();
    }
}

public sealed class FeatureCompartmentService : IFeatureCompartmentService
{
    private const string TableName = "app_data.feature_compartment_locks";
    private const string AvailabilityFull = "full";
    private const string AvailabilityPartial = "partial";
    private const string AvailabilityOff = "off";
    private readonly AppDbContext _db;
    private readonly ISiteCrawlerService _siteCrawlerService;

    private static readonly FeatureCompartmentDefinition[] Definitions =
    [
        new("site-crawler", "Site Crawler", "Route and API inventory for the platform crawler.", ["/api/sitecrawler"]),
        new("content-crawler", "Content Crawler", "Trending content ingestion and ranking.", ["/api/contentcrawler"]),
        new("synthetic-engagement", "Synthetic Engagement", "Synthetic bootstrap and activity generation.", ["/api/admin/synthetic-engagement"]),
        new("growth-admin", "Growth Admin", "Moderation, accounting, and policy controls.", ["/api/growth/moderation", "/api/growth/policy", "/api/growth/admin"]),
        new("growth-revenue", "Revenue Console", "Revenue agent, evidence, and summary tooling.", ["/api/growth/revenue"]),
        new("evolution", "Evolution Catalog", "Module and system evolution catalog.", ["/api/evolution", "/evolution"]),
        new("truth-engine", "Truth Engine", "Truth and verification workflow surfaces.", ["/api/truth", "/api/truthengine"]),
        new("communications", "Communications", "Communique, notifications, and related messaging features.", ["/api/communication", "/api/communique"]),
        new("media-library", "Media Library", "Library and media management surfaces.", ["/api/medialibrary", "/api/mylibrary", "/api/ravensight/media", "/api/video", "/api/audio"]),
        new("fm-tuner", "FM Tuner", "FM radio and track player surfaces.", ["/api/fmtuner", "/api/fm"]),
        new("guided-studio-flow", "Guided Studio Flow", "Podcast Studio guided workflow: Plan, Script, Team, Record, Review, Ship.", ["/api/podcast/studio", "/api/podcaststudio"]),
        new("podcast-analytics", "Podcast Analytics", "Growth analytics and audience insights for podcast content.", ["/api/podcast/analytics", "/api/growth/podcast"]),
        new("team-workflows", "Team Workflows", "Multi-role review, approval, and publishing lanes.", ["/api/team/workflows", "/api/studio/team"]),
        new("script-pipeline", "Script Pipeline", "Structured script pipeline segments for show production.", ["/api/podcast/script"]),
        new("ai-copywriting", "AI Copywriting", "AI-assisted script and copy generation.", ["/api/aiassistant/copy", "/api/copy"]),
        new("podcast-pro-bundle", "Podcast Pro Bundle", "Full access to all podcast studio capabilities.", ["/api/podcast"])
    ];

    public FeatureCompartmentService(AppDbContext db, ISiteCrawlerService siteCrawlerService)
    {
        _db = db;
        _siteCrawlerService = siteCrawlerService;
    }

    public async Task<IReadOnlyList<FeatureCompartmentStatusDto>> GetInventoryAsync(CancellationToken cancellationToken = default)
    {
        await EnsureTableAsync(cancellationToken);

        var endpoints = await _siteCrawlerService.GetApiEndpointsAsync(cancellationToken);
        var locks = await LoadLocksAsync(cancellationToken);

        return Definitions
            .Select(definition => BuildStatus(definition, endpoints, locks))
            .OrderByDescending(item => item.IsLocked)
            .ThenBy(item => item.Key, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public async Task<FeatureCompartmentStatusDto?> GetStatusAsync(string compartmentKey, CancellationToken cancellationToken = default)
    {
        var normalizedKey = NormalizeKey(compartmentKey);
        if (string.IsNullOrWhiteSpace(normalizedKey))
        {
            return null;
        }

        await EnsureTableAsync(cancellationToken);

        var definition = ResolveDefinition(normalizedKey);
        if (definition is null)
        {
            definition = new FeatureCompartmentDefinition(normalizedKey, ToDisplayName(normalizedKey), "Custom compartment lock.", Array.Empty<string>());
        }

        var endpoints = await _siteCrawlerService.GetApiEndpointsAsync(cancellationToken);
        var locks = await LoadLocksAsync(cancellationToken);
        return BuildStatus(definition, endpoints, locks);
    }

    public async Task<FeatureCompartmentStatusDto> SetLockAsync(string compartmentKey, bool locked, string? reason, string? lockedByEmail, CancellationToken cancellationToken = default)
    {
        var normalizedKey = NormalizeKey(compartmentKey);
        if (string.IsNullOrWhiteSpace(normalizedKey))
        {
            throw new ArgumentException("compartmentKey is required.", nameof(compartmentKey));
        }

        await EnsureTableAsync(cancellationToken);

        var sql = $@"
INSERT INTO {TableName} (compartment_key, is_locked, availability_mode, locked_at_utc, locked_by_email, reason, updated_at_utc)
VALUES (@compartment_key, @is_locked, @availability_mode, @locked_at_utc, @locked_by_email, @reason, NOW())
ON CONFLICT (compartment_key)
DO UPDATE SET
    is_locked = EXCLUDED.is_locked,
    availability_mode = EXCLUDED.availability_mode,
    locked_at_utc = EXCLUDED.locked_at_utc,
    locked_by_email = EXCLUDED.locked_by_email,
    reason = EXCLUDED.reason,
    updated_at_utc = NOW();";

        var normalizedReason = string.IsNullOrWhiteSpace(reason) ? null : reason.Trim();

        await using var connection = await OpenConnectionAsync(cancellationToken);
        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("compartment_key", normalizedKey);
        command.Parameters.AddWithValue("is_locked", locked);
        command.Parameters.AddWithValue("availability_mode", locked ? AvailabilityOff : AvailabilityFull);
        command.Parameters.AddWithValue("locked_at_utc", locked ? DateTime.UtcNow : (object)DBNull.Value);
        command.Parameters.AddWithValue("locked_by_email", (object?)NormalizeOptional(lockedByEmail) ?? DBNull.Value);
        command.Parameters.AddWithValue("reason", (object?)normalizedReason ?? DBNull.Value);
        await command.ExecuteNonQueryAsync(cancellationToken);

        var status = await GetStatusAsync(normalizedKey, cancellationToken);
        return status ?? throw new InvalidOperationException($"Feature compartment '{normalizedKey}' could not be resolved.");
    }

    public async Task<bool> IsLockedAsync(string compartmentKey, CancellationToken cancellationToken = default)
    {
        var status = await GetStatusAsync(compartmentKey, cancellationToken);
        return (status?.IsLocked ?? false) || string.Equals(status?.AvailabilityMode, AvailabilityOff, StringComparison.OrdinalIgnoreCase);
    }

    public async Task<FeatureCompartmentStatusDto> SetAvailabilityAsync(string compartmentKey, string availabilityMode, string? reason, string? updatedByEmail, CancellationToken cancellationToken = default)
    {
        var normalizedKey = NormalizeKey(compartmentKey);
        if (string.IsNullOrWhiteSpace(normalizedKey))
        {
            throw new ArgumentException("compartmentKey is required.", nameof(compartmentKey));
        }

        var normalizedMode = NormalizeAvailabilityMode(availabilityMode);
        await EnsureTableAsync(cancellationToken);

        var normalizedReason = string.IsNullOrWhiteSpace(reason) ? null : reason.Trim();
        var isLocked = string.Equals(normalizedMode, AvailabilityOff, StringComparison.OrdinalIgnoreCase);

        var sql = $@"
INSERT INTO {TableName} (compartment_key, is_locked, availability_mode, locked_at_utc, locked_by_email, reason, updated_at_utc)
VALUES (@compartment_key, @is_locked, @availability_mode, @locked_at_utc, @locked_by_email, @reason, NOW())
ON CONFLICT (compartment_key)
DO UPDATE SET
    is_locked = EXCLUDED.is_locked,
    availability_mode = EXCLUDED.availability_mode,
    locked_at_utc = EXCLUDED.locked_at_utc,
    locked_by_email = EXCLUDED.locked_by_email,
    reason = EXCLUDED.reason,
    updated_at_utc = NOW();";

        await using var connection = await OpenConnectionAsync(cancellationToken);
        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("compartment_key", normalizedKey);
        command.Parameters.AddWithValue("is_locked", isLocked);
        command.Parameters.AddWithValue("availability_mode", normalizedMode);
        command.Parameters.AddWithValue("locked_at_utc", isLocked ? DateTime.UtcNow : (object)DBNull.Value);
        command.Parameters.AddWithValue("locked_by_email", (object?)NormalizeOptional(updatedByEmail) ?? DBNull.Value);
        command.Parameters.AddWithValue("reason", (object?)normalizedReason ?? DBNull.Value);
        await command.ExecuteNonQueryAsync(cancellationToken);

        var status = await GetStatusAsync(normalizedKey, cancellationToken);
        return status ?? throw new InvalidOperationException($"Feature compartment '{normalizedKey}' could not be resolved.");
    }

    private static FeatureCompartmentStatusDto BuildStatus(
        FeatureCompartmentDefinition definition,
        IReadOnlyList<SiteCrawlerApiEndpointDto> endpoints,
        IReadOnlyDictionary<string, FeatureCompartmentLockRecord> locks)
    {
        var matchingEndpoints = endpoints
            .Where(endpoint => definition.Matches(endpoint.Route))
            .Select(endpoint => new FeatureCompartmentEndpointDto(endpoint.Method, endpoint.Route, endpoint.Controller, endpoint.Action))
            .OrderBy(endpoint => endpoint.Route, StringComparer.OrdinalIgnoreCase)
            .ThenBy(endpoint => endpoint.Method, StringComparer.OrdinalIgnoreCase)
            .ToList();

        locks.TryGetValue(definition.Key, out var lockRecord);
        var availabilityMode = NormalizeAvailabilityMode(lockRecord?.AvailabilityMode, lockRecord?.IsLocked ?? false);

        return new FeatureCompartmentStatusDto(
            definition.Key,
            definition.Name,
            definition.Description,
            availabilityMode,
            lockRecord?.IsLocked ?? false,
            lockRecord?.LockedAtUtc,
            lockRecord?.LockedByEmail,
            lockRecord?.Reason,
            matchingEndpoints.Count,
            matchingEndpoints);
    }

    private static FeatureCompartmentDefinition? ResolveDefinition(string compartmentKey)
    {
        return Definitions.FirstOrDefault(definition => string.Equals(definition.Key, compartmentKey, StringComparison.OrdinalIgnoreCase));
    }

    private static string NormalizeKey(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? string.Empty : value.Trim().ToLowerInvariant();
    }

    private static string? NormalizeOptional(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    private static string ToDisplayName(string value)
    {
        var parts = value.Split(new[] { '-', '_', '/' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        return parts.Length == 0
            ? value
            : string.Join(' ', parts.Select(part => char.ToUpperInvariant(part[0]) + part[1..]));
    }

    private async Task<IReadOnlyDictionary<string, FeatureCompartmentLockRecord>> LoadLocksAsync(CancellationToken cancellationToken)
    {
        var result = new Dictionary<string, FeatureCompartmentLockRecord>(StringComparer.OrdinalIgnoreCase);
        const string sql = $@"
SELECT compartment_key, is_locked, availability_mode, locked_at_utc, locked_by_email, reason
FROM {TableName};";

        await using var connection = await OpenConnectionAsync(cancellationToken);
        await using var command = new NpgsqlCommand(sql, connection);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);

        while (await reader.ReadAsync(cancellationToken))
        {
            var key = reader.GetString(0);
            result[key] = new FeatureCompartmentLockRecord(
                key,
                reader.GetBoolean(1),
                reader.IsDBNull(2) ? null : reader.GetString(2),
                reader.IsDBNull(3) ? null : reader.GetDateTime(3),
                reader.IsDBNull(4) ? null : reader.GetString(4),
                reader.IsDBNull(5) ? null : reader.GetString(5));
        }

        return result;
    }

    private async Task EnsureTableAsync(CancellationToken cancellationToken)
    {
        var sql = $@"
CREATE SCHEMA IF NOT EXISTS app_data;

CREATE TABLE IF NOT EXISTS {TableName} (
    compartment_key TEXT PRIMARY KEY,
    is_locked BOOLEAN NOT NULL DEFAULT FALSE,
    availability_mode TEXT NOT NULL DEFAULT 'full',
    locked_at_utc TIMESTAMPTZ NULL,
    locked_by_email TEXT NULL,
    reason TEXT NULL,
    updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE {TableName}
    ADD COLUMN IF NOT EXISTS locked_at_utc TIMESTAMPTZ NULL;

ALTER TABLE {TableName}
    ADD COLUMN IF NOT EXISTS availability_mode TEXT NOT NULL DEFAULT 'full';

ALTER TABLE {TableName}
    ADD COLUMN IF NOT EXISTS locked_by_email TEXT NULL;

ALTER TABLE {TableName}
    ADD COLUMN IF NOT EXISTS reason TEXT NULL;

ALTER TABLE {TableName}
    ADD COLUMN IF NOT EXISTS updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW();";

        await using var connection = await OpenConnectionAsync(cancellationToken);
        await using var command = new NpgsqlCommand(sql, connection);
        await command.ExecuteNonQueryAsync(cancellationToken);

        var normalizeSql = $@"
UPDATE {TableName}
SET availability_mode = CASE
    WHEN availability_mode IS NULL OR availability_mode = '' THEN CASE WHEN is_locked THEN 'off' ELSE 'full' END
    WHEN LOWER(availability_mode) NOT IN ('full', 'partial', 'off') THEN CASE WHEN is_locked THEN 'off' ELSE 'full' END
    ELSE LOWER(availability_mode)
END
WHERE availability_mode IS NULL
   OR availability_mode = ''
   OR LOWER(availability_mode) NOT IN ('full', 'partial', 'off');";
        await using var normalizeCommand = new NpgsqlCommand(normalizeSql, connection);
        await normalizeCommand.ExecuteNonQueryAsync(cancellationToken);
    }

    private static string NormalizeAvailabilityMode(string? mode, bool isLockedFallback = false)
    {
        var normalized = string.IsNullOrWhiteSpace(mode) ? string.Empty : mode.Trim().ToLowerInvariant();
        return normalized switch
        {
            AvailabilityFull => AvailabilityFull,
            AvailabilityPartial => AvailabilityPartial,
            AvailabilityOff => AvailabilityOff,
            _ => isLockedFallback ? AvailabilityOff : AvailabilityFull
        };
    }

    private async Task<NpgsqlConnection> OpenConnectionAsync(CancellationToken cancellationToken)
    {
        var connectionString = _db.Database.GetDbConnection().ConnectionString;
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw new InvalidOperationException("A database connection string is required for feature compartment locks.");
        }

        var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync(cancellationToken);
        return connection;
    }

    private sealed record FeatureCompartmentDefinition(
        string Key,
        string Name,
        string Description,
        IReadOnlyList<string> RoutePrefixes)
    {
        public bool Matches(string route)
        {
            return RoutePrefixes.Any(prefix => route.StartsWith(prefix, StringComparison.OrdinalIgnoreCase));
        }
    }

    private sealed record FeatureCompartmentLockRecord(
        string Key,
        bool IsLocked,
        string? AvailabilityMode,
        DateTime? LockedAtUtc,
        string? LockedByEmail,
        string? Reason);
}