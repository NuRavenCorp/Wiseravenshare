using System.Reflection;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Routing;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Wiseravenshare.Server.Infrastructure.Data;

namespace Wiseravenshare.Server.Services;

public interface ISiteCrawlerService
{
    Task<IReadOnlyList<SiteCrawlerNodeDto>> GetNodesAsync(string? countryCode = null, CancellationToken ct = default);
    Task<IReadOnlyList<SiteCrawlerEdgeDto>> GetEdgesAsync(string? countryCode = null, CancellationToken ct = default);
    Task<SiteCrawlerOverviewDto> GetOverviewAsync(string? countryCode = null, CancellationToken ct = default);
    Task<IReadOnlyList<SiteCrawlerApiEndpointDto>> GetApiEndpointsAsync(CancellationToken ct = default);
    Task<SiteCrawlerValidationReportDto> GetValidationReportAsync(string? countryCode = null, CancellationToken ct = default);
    Task<SiteCrawlerSummaryDto> GetSummaryAsync(string? countryCode = null, string? userCategory = null, CancellationToken ct = default);
}

public sealed class SiteCrawlerService : ISiteCrawlerService
{
    private readonly AppDbContext _db;

    public SiteCrawlerService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<IReadOnlyList<SiteCrawlerNodeDto>> GetNodesAsync(string? countryCode = null, CancellationToken ct = default)
    {
        await EnsureCrawlerCatalogTableAsync(ct);

        var rows = await LoadCrawlerRowsAsync(countryCode, ct);
        return rows
            .Select(MapRowToNode)
            .Where(node => !string.IsNullOrWhiteSpace(node.PageId))
            .GroupBy(node => node.PageId, StringComparer.OrdinalIgnoreCase)
            .Select(group => group.OrderByDescending(item => item.UpdatedAtUtc).First())
            .OrderBy(node => node.PageId, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public async Task<IReadOnlyList<SiteCrawlerEdgeDto>> GetEdgesAsync(string? countryCode = null, CancellationToken ct = default)
    {
        var nodes = await GetNodesAsync(countryCode, ct);
        var nodeByPageId = nodes.ToDictionary(item => item.PageId, item => item, StringComparer.OrdinalIgnoreCase);
        var edges = new List<SiteCrawlerEdgeDto>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var node in nodes)
        {
            foreach (var related in node.RelatedPageIds)
            {
                if (string.IsNullOrWhiteSpace(related) || !nodeByPageId.ContainsKey(related))
                {
                    continue;
                }

                var key = $"{node.PageId}->{related}";
                if (!seen.Add(key))
                {
                    continue;
                }

                var target = nodeByPageId[related];
                var sharedTags = node.Tags.Intersect(target.Tags, StringComparer.OrdinalIgnoreCase).Count();
                var sameCategoryBonus = string.Equals(node.Category, target.Category, StringComparison.OrdinalIgnoreCase) ? 1 : 0;

                edges.Add(new SiteCrawlerEdgeDto
                {
                    SourcePageId = node.PageId,
                    TargetPageId = related,
                    Relationship = "related",
                    Weight = Math.Max(1, 1 + sharedTags + sameCategoryBonus)
                });
            }
        }

        return edges
            .OrderByDescending(edge => edge.Weight)
            .ThenBy(edge => edge.SourcePageId, StringComparer.OrdinalIgnoreCase)
            .ThenBy(edge => edge.TargetPageId, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public async Task<SiteCrawlerOverviewDto> GetOverviewAsync(string? countryCode = null, CancellationToken ct = default)
    {
        var nodes = await GetNodesAsync(countryCode, ct);
        var edges = await GetEdgesAsync(countryCode, ct);
        var apis = await GetApiEndpointsAsync(ct);

        var categoryCounts = nodes
            .GroupBy(node => node.Category, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.Count(), StringComparer.OrdinalIgnoreCase);

        var topConnected = edges
            .GroupBy(edge => edge.SourcePageId, StringComparer.OrdinalIgnoreCase)
            .Select(group => new SiteCrawlerConnectionStatDto
            {
                PageId = group.Key,
                OutgoingConnections = group.Count(),
                TotalWeight = group.Sum(item => item.Weight)
            })
            .OrderByDescending(item => item.OutgoingConnections)
            .ThenByDescending(item => item.TotalWeight)
            .Take(10)
            .ToList();

        var orphanPages = nodes
            .Where(node => node.RelatedPageIds.Count == 0)
            .Select(node => node.PageId)
            .OrderBy(item => item, StringComparer.OrdinalIgnoreCase)
            .ToList();

        return new SiteCrawlerOverviewDto
        {
            TotalPages = nodes.Count,
            TotalConnections = edges.Count,
            TotalApis = apis.Count,
            Categories = categoryCounts,
            TopConnectedPages = topConnected,
            OrphanPages = orphanPages,
            GeneratedAtUtc = DateTime.UtcNow
        };
    }

    public Task<IReadOnlyList<SiteCrawlerApiEndpointDto>> GetApiEndpointsAsync(CancellationToken ct = default)
    {
        var endpoints = new List<SiteCrawlerApiEndpointDto>();
        var assembly = typeof(Program).Assembly;
        var controllerTypes = assembly
            .GetTypes()
            .Where(type => typeof(ControllerBase).IsAssignableFrom(type) && !type.IsAbstract);

        foreach (var controllerType in controllerTypes)
        {
            var controllerRoute = controllerType.GetCustomAttribute<RouteAttribute>()?.Template ?? string.Empty;
            var methods = controllerType.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly);

            foreach (var method in methods)
            {
                var httpMethodAttributes = method
                    .GetCustomAttributes()
                    .Where(attribute => attribute is HttpMethodAttribute)
                    .Cast<HttpMethodAttribute>()
                    .ToList();

                if (httpMethodAttributes.Count == 0)
                {
                    continue;
                }

                foreach (var attribute in httpMethodAttributes)
                {
                    var httpMethods = attribute.HttpMethods?.Any() == true
                        ? attribute.HttpMethods
                        : new[] { "GET" };

                    foreach (var httpMethod in httpMethods)
                    {
                        endpoints.Add(new SiteCrawlerApiEndpointDto
                        {
                            Method = httpMethod.ToUpperInvariant(),
                            Route = CombineRoute(controllerRoute, attribute.Template),
                            Controller = controllerType.Name,
                            Action = method.Name
                        });
                    }
                }
            }
        }

        return Task.FromResult<IReadOnlyList<SiteCrawlerApiEndpointDto>>(endpoints
            .GroupBy(item => $"{item.Method}:{item.Route}", StringComparer.OrdinalIgnoreCase)
            .Select(group => group.First())
            .OrderBy(item => item.Route, StringComparer.OrdinalIgnoreCase)
            .ThenBy(item => item.Method, StringComparer.OrdinalIgnoreCase)
            .ToList());
    }

    public async Task<SiteCrawlerValidationReportDto> GetValidationReportAsync(string? countryCode = null, CancellationToken ct = default)
    {
        await EnsureCrawlerCatalogTableAsync(ct);

        var rows = await LoadCrawlerRowsAsync(countryCode, ct);
        var parsedNodes = rows
            .Select(MapRowToNode)
            .Where(node => !string.IsNullOrWhiteSpace(node.PageId))
            .ToList();

        var issues = new List<SiteCrawlerValidationIssueDto>();
        var duplicatePageIds = parsedNodes
            .GroupBy(node => node.PageId, StringComparer.OrdinalIgnoreCase)
            .Where(group => group.Count() > 1);

        foreach (var duplicate in duplicatePageIds)
        {
            issues.Add(new SiteCrawlerValidationIssueDto
            {
                Severity = "warning",
                Type = "duplicate-page-id",
                PageId = duplicate.Key,
                Message = $"Page '{duplicate.Key}' has {duplicate.Count()} catalog entries."
            });
        }

        var latestNodes = parsedNodes
            .GroupBy(node => node.PageId, StringComparer.OrdinalIgnoreCase)
            .Select(group => group.OrderByDescending(item => item.UpdatedAtUtc).First())
            .ToList();

        var nodeIds = latestNodes
            .Select(node => node.PageId)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        foreach (var node in latestNodes)
        {
            if (node.RelatedPageIds.Any(related => string.Equals(related, node.PageId, StringComparison.OrdinalIgnoreCase)))
            {
                issues.Add(new SiteCrawlerValidationIssueDto
                {
                    Severity = "warning",
                    Type = "self-reference",
                    PageId = node.PageId,
                    Message = $"Page '{node.PageId}' includes itself in related pages."
                });
            }

            foreach (var related in node.RelatedPageIds)
            {
                if (!nodeIds.Contains(related))
                {
                    issues.Add(new SiteCrawlerValidationIssueDto
                    {
                        Severity = "error",
                        Type = "dangling-related-reference",
                        PageId = node.PageId,
                        TargetPageId = related,
                        Message = $"Page '{node.PageId}' references missing related page '{related}'."
                    });
                }
            }
        }

        var orphanPages = latestNodes
            .Where(node => node.RelatedPageIds.Count == 0)
            .Select(node => node.PageId)
            .OrderBy(page => page, StringComparer.OrdinalIgnoreCase)
            .ToList();

        foreach (var orphan in orphanPages)
        {
            issues.Add(new SiteCrawlerValidationIssueDto
            {
                Severity = "info",
                Type = "orphan-page",
                PageId = orphan,
                Message = $"Page '{orphan}' has no related page links."
            });
        }

        var score = 100;
        score -= issues.Count(issue => string.Equals(issue.Severity, "error", StringComparison.OrdinalIgnoreCase)) * 10;
        score -= issues.Count(issue => string.Equals(issue.Severity, "warning", StringComparison.OrdinalIgnoreCase)) * 4;
        score -= issues.Count(issue => string.Equals(issue.Severity, "info", StringComparison.OrdinalIgnoreCase)) * 1;
        score = Math.Clamp(score, 0, 100);

        return new SiteCrawlerValidationReportDto
        {
            Score = score,
            IsHealthy = !issues.Any(issue => string.Equals(issue.Severity, "error", StringComparison.OrdinalIgnoreCase)),
            TotalNodes = latestNodes.Count,
            TotalIssues = issues.Count,
            Issues = issues
                .OrderByDescending(issue => SeverityRank(issue.Severity))
                .ThenBy(issue => issue.Type, StringComparer.OrdinalIgnoreCase)
                .ThenBy(issue => issue.PageId, StringComparer.OrdinalIgnoreCase)
                .ToList(),
            GeneratedAtUtc = DateTime.UtcNow
        };
    }

    public async Task<SiteCrawlerSummaryDto> GetSummaryAsync(string? countryCode = null, string? userCategory = null, CancellationToken ct = default)
    {
        var nodes = await GetNodesAsync(countryCode, ct);
        var edges = await GetEdgesAsync(countryCode, ct);

        // Group pages by category
        var categoryCounts = nodes
            .GroupBy(node => node.Category, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.Count(), StringComparer.OrdinalIgnoreCase);

        // Get top connected pages (trending features)
        var topConnected = edges
            .GroupBy(edge => edge.TargetPageId, StringComparer.OrdinalIgnoreCase)
            .Select(group => new SiteCrawlerPageSummaryDto
            {
                PageId = group.Key,
                Label = nodes.FirstOrDefault(n => n.PageId == group.Key)?.Label ?? group.Key,
                Category = nodes.FirstOrDefault(n => n.PageId == group.Key)?.Category ?? "general",
                Tags = nodes.FirstOrDefault(n => n.PageId == group.Key)?.Tags ?? new List<string>(),
                IncomingConnections = group.Count(),
                Score = group.Sum(e => e.Weight)
            })
            .OrderByDescending(item => item.Score)
            .ThenByDescending(item => item.IncomingConnections)
            .Take(12)
            .ToList();

        // If user category specified, get related pages in that category
        var relatedInCategory = new List<SiteCrawlerPageSummaryDto>();
        if (!string.IsNullOrWhiteSpace(userCategory))
        {
            relatedInCategory = nodes
                .Where(node => string.Equals(node.Category, userCategory, StringComparison.OrdinalIgnoreCase))
                .Select(node => new SiteCrawlerPageSummaryDto
                {
                    PageId = node.PageId,
                    Label = node.Label,
                    Category = node.Category,
                    Tags = node.Tags,
                    IncomingConnections = edges.Count(e => e.TargetPageId == node.PageId),
                    Score = edges
                        .Where(e => e.TargetPageId == node.PageId)
                        .Sum(e => e.Weight)
                })
                .OrderByDescending(item => item.Score)
                .Take(6)
                .ToList();
        }

        return new SiteCrawlerSummaryDto
        {
            TotalPages = nodes.Count,
            TotalConnections = edges.Count,
            Categories = categoryCounts,
            TopConnectedPages = topConnected,
            RelatedInCategory = relatedInCategory,
            CountryCode = countryCode ?? "GLOBAL",
            GeneratedAtUtc = DateTime.UtcNow
        };
    }

    private async Task<List<SiteCrawlerRow>> LoadCrawlerRowsAsync(string? countryCode, CancellationToken ct)
    {
        var normalizedCountry = string.IsNullOrWhiteSpace(countryCode) ? null : countryCode.Trim().ToUpperInvariant();

        const string sql = @"
SELECT content_id, content_type, content, content_json::text, tags::text, country_code, updated_at, crawler_schema_version, content_hash
FROM app_data.site_crawler_catalog
WHERE (@country_code IS NULL OR country_code = @country_code)
ORDER BY updated_at DESC;";

        var rows = new List<SiteCrawlerRow>();
        await using var connection = await OpenNewConnectionAsync(ct);
        await using var command = new NpgsqlCommand(sql, connection);
        command.Parameters.AddWithValue("country_code", (object?)normalizedCountry ?? DBNull.Value);

        await using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            rows.Add(new SiteCrawlerRow
            {
                ContentId = reader.GetGuid(0),
                ContentType = reader.IsDBNull(1) ? string.Empty : reader.GetString(1),
                Content = reader.IsDBNull(2) ? string.Empty : reader.GetString(2),
                ContentJson = reader.IsDBNull(3) ? null : reader.GetString(3),
                TagsJson = reader.IsDBNull(4) ? "[]" : reader.GetString(4),
                CountryCode = reader.IsDBNull(5) ? "GLOBAL" : reader.GetString(5),
                UpdatedAtUtc = reader.IsDBNull(6) ? DateTime.UtcNow : reader.GetDateTime(6).ToUniversalTime(),
                SchemaVersion = reader.IsDBNull(7) ? 1 : reader.GetInt32(7),
                ContentHash = reader.IsDBNull(8) ? string.Empty : reader.GetString(8)
            });
        }

        return rows;
    }

    private static SiteCrawlerNodeDto MapRowToNode(SiteCrawlerRow row)
    {
        var parsedContent = ParseContent(row.ContentJson, row.Content);
        var pageId = ReadSegment(parsedContent, "page");
        var label = ReadSegment(parsedContent, "label");
        var category = ReadSegment(parsedContent, "category");
        var related = ReadSegment(parsedContent, "related")
            .Split('|', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        return new SiteCrawlerNodeDto
        {
            ContentId = row.ContentId,
            ContentType = row.ContentType,
            PageId = pageId,
            Label = string.IsNullOrWhiteSpace(label) ? pageId : label,
            Category = string.IsNullOrWhiteSpace(category) ? "general" : category,
            RelatedPageIds = related,
            Tags = ParseTags(row.TagsJson),
            CountryCode = string.IsNullOrWhiteSpace(row.CountryCode) ? "GLOBAL" : row.CountryCode,
            UpdatedAtUtc = row.UpdatedAtUtc
        };
    }

    private static Dictionary<string, string> ParseContent(string? contentJson, string content)
    {
        if (!string.IsNullOrWhiteSpace(contentJson))
        {
            try
            {
                var map = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(contentJson);
                if (map is { Count: > 0 })
                {
                    var normalized = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                    foreach (var (key, value) in map)
                    {
                        if (string.IsNullOrWhiteSpace(key))
                        {
                            continue;
                        }

                        normalized[key] = value.ValueKind switch
                        {
                            JsonValueKind.String => value.GetString() ?? string.Empty,
                            JsonValueKind.Array => string.Join('|', value.EnumerateArray().Select(item => item.ToString()).Where(item => !string.IsNullOrWhiteSpace(item))),
                            _ => value.ToString()
                        };
                    }

                    if (normalized.Count > 0)
                    {
                        return normalized;
                    }
                }
            }
            catch
            {
                // Fall back to legacy content parsing.
            }
        }

        var legacyMap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var parts = (content ?? string.Empty)
            .Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        foreach (var part in parts)
        {
            var separator = part.IndexOf(':');
            if (separator <= 0)
            {
                continue;
            }

            var key = part[..separator].Trim();
            var value = part[(separator + 1)..].Trim();
            if (!string.IsNullOrWhiteSpace(key))
            {
                legacyMap[key] = value;
            }
        }

        return legacyMap;
    }

    private static string ReadSegment(IReadOnlyDictionary<string, string> contentMap, string key)
    {
        return contentMap.TryGetValue(key, out var value) ? value : string.Empty;
    }

    private static List<string> ParseTags(string tagsJson)
    {
        try
        {
            var parsed = JsonSerializer.Deserialize<List<string>>(tagsJson);
            return (parsed ?? new List<string>())
                .Where(value => !string.IsNullOrWhiteSpace(value))
                .Select(value => value.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
        }
        catch
        {
            return new List<string>();
        }
    }

    private static string CombineRoute(string controllerRoute, string? actionRoute)
    {
        var baseRoute = (controllerRoute ?? string.Empty).Trim('/');
        var action = (actionRoute ?? string.Empty).Trim('/');

        if (string.IsNullOrWhiteSpace(baseRoute))
        {
            return string.IsNullOrWhiteSpace(action) ? "/" : $"/{action}";
        }

        if (string.IsNullOrWhiteSpace(action))
        {
            return $"/{baseRoute}";
        }

        return $"/{baseRoute}/{action}";
    }

    private async Task EnsureCrawlerCatalogTableAsync(CancellationToken ct)
    {
        const string sql = @"
CREATE SCHEMA IF NOT EXISTS app_data;

CREATE TABLE IF NOT EXISTS app_data.site_crawler_catalog (
    content_id UUID PRIMARY KEY,
    content_type TEXT NOT NULL,
    content TEXT NOT NULL,
    content_json JSONB,
    content_hash TEXT,
    crawler_schema_version INTEGER NOT NULL DEFAULT 1,
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    country_code TEXT NOT NULL DEFAULT 'GLOBAL',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_site_crawler_catalog_country_updated
    ON app_data.site_crawler_catalog (country_code, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_site_crawler_catalog_tags_gin
    ON app_data.site_crawler_catalog USING GIN (tags);

CREATE INDEX IF NOT EXISTS idx_site_crawler_catalog_content_hash
    ON app_data.site_crawler_catalog (content_hash);";

        const string migrationSql = @"
ALTER TABLE app_data.site_crawler_catalog
    ADD COLUMN IF NOT EXISTS content_json JSONB;

ALTER TABLE app_data.site_crawler_catalog
    ADD COLUMN IF NOT EXISTS content_hash TEXT;

ALTER TABLE app_data.site_crawler_catalog
    ADD COLUMN IF NOT EXISTS crawler_schema_version INTEGER NOT NULL DEFAULT 1;";

        await using var connection = await OpenNewConnectionAsync(ct);
        await using var command = new NpgsqlCommand(sql, connection);
        await command.ExecuteNonQueryAsync(ct);
        await using var migrationCommand = new NpgsqlCommand(migrationSql, connection);
        await migrationCommand.ExecuteNonQueryAsync(ct);
    }

    private async Task<NpgsqlConnection> OpenNewConnectionAsync(CancellationToken ct)
    {
        var connectionString = _db.Database.GetConnectionString();
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw new InvalidOperationException("Database connection string is unavailable for crawler service.");
        }

        var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync(ct);
        return connection;
    }

    private sealed class SiteCrawlerRow
    {
        public Guid ContentId { get; set; }
        public string ContentType { get; set; } = string.Empty;
        public string Content { get; set; } = string.Empty;
        public string? ContentJson { get; set; }
        public string TagsJson { get; set; } = "[]";
        public string CountryCode { get; set; } = "GLOBAL";
        public DateTime UpdatedAtUtc { get; set; }
        public int SchemaVersion { get; set; } = 1;
        public string ContentHash { get; set; } = string.Empty;
    }

    private static int SeverityRank(string severity)
    {
        return string.Equals(severity, "error", StringComparison.OrdinalIgnoreCase)
            ? 3
            : string.Equals(severity, "warning", StringComparison.OrdinalIgnoreCase)
                ? 2
                : 1;
    }
}

public sealed class SiteCrawlerNodeDto
{
    public Guid ContentId { get; set; }
    public string ContentType { get; set; } = string.Empty;
    public string PageId { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public string Category { get; set; } = "general";
    public List<string> RelatedPageIds { get; set; } = new();
    public List<string> Tags { get; set; } = new();
    public string CountryCode { get; set; } = "GLOBAL";
    public DateTime UpdatedAtUtc { get; set; }
}

public sealed class SiteCrawlerEdgeDto
{
    public string SourcePageId { get; set; } = string.Empty;
    public string TargetPageId { get; set; } = string.Empty;
    public string Relationship { get; set; } = "related";
    public int Weight { get; set; } = 1;
}

public sealed class SiteCrawlerApiEndpointDto
{
    public string Method { get; set; } = "GET";
    public string Route { get; set; } = string.Empty;
    public string Controller { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
}

public sealed class SiteCrawlerConnectionStatDto
{
    public string PageId { get; set; } = string.Empty;
    public int OutgoingConnections { get; set; }
    public int TotalWeight { get; set; }
}

public sealed class SiteCrawlerOverviewDto
{
    public int TotalPages { get; set; }
    public int TotalConnections { get; set; }
    public int TotalApis { get; set; }
    public Dictionary<string, int> Categories { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public List<SiteCrawlerConnectionStatDto> TopConnectedPages { get; set; } = new();
    public List<string> OrphanPages { get; set; } = new();
    public DateTime GeneratedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class SiteCrawlerValidationReportDto
{
    public int Score { get; set; }
    public bool IsHealthy { get; set; }
    public int TotalNodes { get; set; }
    public int TotalIssues { get; set; }
    public List<SiteCrawlerValidationIssueDto> Issues { get; set; } = new();
    public DateTime GeneratedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class SiteCrawlerValidationIssueDto
{
    public string Severity { get; set; } = "info";
    public string Type { get; set; } = string.Empty;
    public string PageId { get; set; } = string.Empty;
    public string TargetPageId { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
}

public sealed class SiteCrawlerPageSummaryDto
{
    public string PageId { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public string Category { get; set; } = "general";
    public List<string> Tags { get; set; } = new();
    public int IncomingConnections { get; set; }
    public int Score { get; set; }
}

public sealed class SiteCrawlerSummaryDto
{
    public int TotalPages { get; set; }
    public int TotalConnections { get; set; }
    public Dictionary<string, int> Categories { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public List<SiteCrawlerPageSummaryDto> TopConnectedPages { get; set; } = new();
    public List<SiteCrawlerPageSummaryDto> RelatedInCategory { get; set; } = new();
    public string CountryCode { get; set; } = "GLOBAL";
    public DateTime GeneratedAtUtc { get; set; } = DateTime.UtcNow;
}
