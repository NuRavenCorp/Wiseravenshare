using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using System.Text.Json;
using Wiseravenshare.Server.Services;
using Wiseravenshare.Server.Entities.Personalization;
using Wiseravenshare.Server.Infrastructure.Data;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/news")]
public sealed class NewsController : ControllerBase
{
    private readonly INewsAggregationService _newsAggregationService;
    private readonly AppDbContext _dbContext;

    public NewsController(INewsAggregationService newsAggregationService, AppDbContext dbContext)
    {
        _newsAggregationService = newsAggregationService;
        _dbContext = dbContext;
    }

    [HttpGet("search")]
    public async Task<IActionResult> Search(
        [FromQuery(Name = "q")] string? query,
        [FromQuery] string? language = "en",
        [FromQuery] int limit = 15,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(query))
        {
            return BadRequest(new { message = "Query parameter q is required." });
        }

        var response = await _newsAggregationService.SearchNewsAsync(query, language, limit, cancellationToken);
        return Ok(response);
    }

    [HttpGet("trending")]
    public async Task<IActionResult> Trending(
        [FromQuery] string? language = "en",
        [FromQuery] int limit = 15,
        CancellationToken cancellationToken = default)
    {
        var response = await _newsAggregationService.SearchNewsAsync("breaking news", language, limit, cancellationToken);
        return Ok(response);
    }

    [HttpGet("bulletin")]
    public async Task<IActionResult> Bulletin(
        [FromQuery] string? region = null,
        [FromQuery] string? topic = null,
        [FromQuery] string? language = "en",
        [FromQuery] int limit = 8,
        CancellationToken cancellationToken = default)
    {
        var normalizedRegion = region?.Trim() ?? string.Empty;
        var normalizedTopic = topic?.Trim() ?? string.Empty;
        var query = BuildBulletinQuery(normalizedRegion, normalizedTopic);
        var response = await _newsAggregationService.SearchNewsAsync(query, language, Math.Clamp(limit, 1, 12), cancellationToken);
        var articles = response.Articles
            .Take(Math.Clamp(limit, 1, 12))
            .Select(article => new NewsBulletinArticleDto
            {
                Title = article.Title,
                Summary = article.Description ?? string.Empty,
                Source = article.Source ?? article.Provider,
                Provider = article.Provider,
                SourceUrl = article.Url,
                ImageUrl = article.ImageUrl,
                PublishedAtUtc = article.PublishedAtUtc,
                Region = normalizedRegion
            })
            .ToList();

        return Ok(new NewsBulletinResponseDto
        {
            Region = normalizedRegion,
            Topic = normalizedTopic,
            Query = response.Query,
            GeneratedAtUtc = response.FetchedAtUtc,
            Headline = BuildHeadline(normalizedRegion, normalizedTopic, articles),
            Summary = BuildSummary(normalizedRegion, normalizedTopic, articles),
            Articles = articles,
            ProviderStatuses = response.ProviderStatuses
        });
    }

    [HttpGet("languages")]
    public async Task<IActionResult> Languages(CancellationToken cancellationToken = default)
    {
        var response = await _newsAggregationService.GetBbcSupportedLanguagesAsync(cancellationToken);
        return Ok(new { provider = "bbcapi", languages = response });
    }

    [Authorize]
    [HttpGet("markers")]
    public async Task<IActionResult> GetMarkers([FromQuery] string? type = null, CancellationToken cancellationToken = default)
    {
        var userId = ResolveUserId();
        if (!userId.HasValue)
        {
            return Unauthorized(new { message = "Sign in required." });
        }

        var normalizedType = NormalizeMarkerType(type);
        var query = _dbContext.UserInteractions
            .AsNoTracking()
            .Where(entry => entry.UserId == userId.Value && entry.TargetType == NewsMarkerTargetType);

        if (normalizedType.HasValue)
        {
            query = query.Where(entry => entry.Type == normalizedType.Value);
        }

        var items = await query
            .OrderByDescending(entry => entry.UpdatedAt)
            .Take(500)
            .ToListAsync(cancellationToken);

        var markers = items
            .Select(ToMarkerDto)
            .Where(marker => !string.IsNullOrWhiteSpace(marker.MarkerKey))
            .ToList();

        return Ok(new { markers });
    }

    [Authorize]
    [HttpPost("markers")]
    public async Task<IActionResult> SetMarker([FromBody] NewsMarkerMutationRequest request, CancellationToken cancellationToken = default)
    {
        var userId = ResolveUserId();
        if (!userId.HasValue)
        {
            return Unauthorized(new { message = "Sign in required." });
        }

        var markerType = NormalizeMarkerType(request.MarkerType);
        if (!markerType.HasValue)
        {
            return BadRequest(new { message = "markerType must be 'liked' or 'bookmarked'." });
        }

        var markerKey = NormalizeMarkerKey(request.MarkerKey);
        if (string.IsNullOrWhiteSpace(markerKey))
        {
            return BadRequest(new { message = "markerKey is required." });
        }

        var existing = await _dbContext.UserInteractions
            .Where(entry =>
                entry.UserId == userId.Value &&
                entry.TargetType == NewsMarkerTargetType &&
                entry.Type == markerType.Value)
            .ToListAsync(cancellationToken);

        var match = existing.FirstOrDefault(entry =>
            string.Equals(ExtractMarkerKey(entry.ContextData), markerKey, StringComparison.OrdinalIgnoreCase));

        if (request.Marked)
        {
            if (match is null)
            {
                _dbContext.UserInteractions.Add(new UserInteraction
                {
                    UserId = userId.Value,
                    Type = markerType.Value,
                    TargetType = NewsMarkerTargetType,
                    TargetTitle = string.IsNullOrWhiteSpace(request.Title) ? "News Article" : request.Title.Trim(),
                    TargetCategory = request.Source?.Trim(),
                    ContextData = BuildMarkerContextDocument(markerKey, request),
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                });
            }
            else
            {
                match.TargetTitle = string.IsNullOrWhiteSpace(request.Title) ? match.TargetTitle : request.Title.Trim();
                match.TargetCategory = string.IsNullOrWhiteSpace(request.Source) ? match.TargetCategory : request.Source.Trim();
                match.ContextData = BuildMarkerContextDocument(markerKey, request);
                match.UpdatedAt = DateTime.UtcNow;
            }
        }
        else if (match is not null)
        {
            _dbContext.UserInteractions.Remove(match);
        }

        await _dbContext.SaveChangesAsync(cancellationToken);

        return Ok(new
        {
            markerKey,
            markerType = ToMarkerTypeLabel(markerType.Value),
            marked = request.Marked
        });
    }

    private Guid? ResolveUserId()
    {
        var value = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        return Guid.TryParse(value, out var userId) ? userId : null;
    }

    private static JsonDocument BuildMarkerContextDocument(string markerKey, NewsMarkerMutationRequest request)
    {
        var payload = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["markerKey"] = markerKey,
            ["title"] = request.Title?.Trim() ?? string.Empty,
            ["url"] = request.Url?.Trim() ?? string.Empty,
            ["provider"] = request.Provider?.Trim() ?? string.Empty,
            ["source"] = request.Source?.Trim() ?? string.Empty,
            ["imageUrl"] = request.ImageUrl?.Trim() ?? string.Empty
        };

        return JsonDocument.Parse(JsonSerializer.Serialize(payload));
    }

    private static NewsMarkerDto ToMarkerDto(UserInteraction interaction)
    {
        return new NewsMarkerDto
        {
            MarkerKey = ExtractMarkerKey(interaction.ContextData),
            MarkerType = ToMarkerTypeLabel(interaction.Type),
            Title = interaction.TargetTitle ?? string.Empty,
            Source = interaction.TargetCategory ?? string.Empty,
            Url = ExtractContextValue(interaction.ContextData, "url"),
            Provider = ExtractContextValue(interaction.ContextData, "provider"),
            ImageUrl = ExtractContextValue(interaction.ContextData, "imageUrl"),
            UpdatedAtUtc = interaction.UpdatedAt
        };
    }

    private static string ExtractMarkerKey(JsonDocument? context)
    {
        return NormalizeMarkerKey(ExtractContextValue(context, "markerKey"));
    }

    private static string ExtractContextValue(JsonDocument? context, string key)
    {
        if (context is null)
        {
            return string.Empty;
        }

        if (context.RootElement.ValueKind != JsonValueKind.Object)
        {
            return string.Empty;
        }

        if (!context.RootElement.TryGetProperty(key, out var node))
        {
            return string.Empty;
        }

        return node.GetString()?.Trim() ?? string.Empty;
    }

    private static string BuildBulletinQuery(string region, string topic)
    {
        if (string.IsNullOrWhiteSpace(region) && string.IsNullOrWhiteSpace(topic))
        {
            return "breaking news";
        }

        if (string.IsNullOrWhiteSpace(region))
        {
            return topic;
        }

        if (string.IsNullOrWhiteSpace(topic))
        {
            return $"{region} breaking news";
        }

        return $"{topic} news {region}";
    }

    private static string BuildHeadline(string region, string topic, IReadOnlyList<NewsBulletinArticleDto> articles)
    {
        if (articles.Count > 0)
        {
            return articles[0].Title;
        }

        if (!string.IsNullOrWhiteSpace(topic) && !string.IsNullOrWhiteSpace(region))
        {
            return $"{topic} headlines for {region}";
        }

        if (!string.IsNullOrWhiteSpace(topic))
        {
            return $"{topic} headlines";
        }

        if (!string.IsNullOrWhiteSpace(region))
        {
            return $"Top headlines for {region}";
        }

        return "Top breaking news";
    }

    private static string BuildSummary(string region, string topic, IReadOnlyList<NewsBulletinArticleDto> articles)
    {
        if (articles.Count == 0)
        {
            return "No live articles matched the current filters. Try a broader topic or leave the filters blank for the latest headlines.";
        }

        var leadSources = articles
            .Select(article => article.Source)
            .Where(source => !string.IsNullOrWhiteSpace(source))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(3)
            .ToArray();

        var leadSummaries = articles
            .Select(article => string.IsNullOrWhiteSpace(article.Summary) ? article.Title : article.Summary)
            .Where(text => !string.IsNullOrWhiteSpace(text))
            .Take(2)
            .ToArray();

        var focus = !string.IsNullOrWhiteSpace(topic) && !string.IsNullOrWhiteSpace(region)
            ? $"{topic} coverage connected to {region}"
            : !string.IsNullOrWhiteSpace(topic)
                ? $"{topic} coverage"
                : !string.IsNullOrWhiteSpace(region)
                    ? $"coverage connected to {region}"
                    : "today's major stories";

        var sourceText = leadSources.Length > 0
            ? $"Sources include {string.Join(", ", leadSources)}."
            : string.Empty;

        var detailText = leadSummaries.Length > 0
            ? string.Join(" ", leadSummaries)
            : "Multiple providers are contributing to this bulletin.";

        return $"{focus} is led by {articles[0].Title}. {detailText} {sourceText}".Trim();
    }

    private static Wiseravenshare.Server.Entities.Personalization.InteractionType? NormalizeMarkerType(string? markerType)
    {
        var value = markerType?.Trim().ToLowerInvariant();
        return value switch
        {
            "liked" or "like" => Wiseravenshare.Server.Entities.Personalization.InteractionType.Like,
            "bookmarked" or "bookmark" => Wiseravenshare.Server.Entities.Personalization.InteractionType.Bookmark,
            null or "" => null,
            _ => null
        };
    }

    private static string ToMarkerTypeLabel(Wiseravenshare.Server.Entities.Personalization.InteractionType markerType)
    {
        return markerType == Wiseravenshare.Server.Entities.Personalization.InteractionType.Like ? "liked" : "bookmarked";
    }

    private static string NormalizeMarkerKey(string? markerKey)
    {
        return string.IsNullOrWhiteSpace(markerKey) ? string.Empty : markerKey.Trim().ToLowerInvariant();
    }

    private const string NewsMarkerTargetType = "news_article";
}

public sealed class NewsMarkerMutationRequest
{
    public string MarkerType { get; set; } = string.Empty;
    public string MarkerKey { get; set; } = string.Empty;
    public bool Marked { get; set; }
    public string? Title { get; set; }
    public string? Source { get; set; }
    public string? Provider { get; set; }
    public string? Url { get; set; }
    public string? ImageUrl { get; set; }
}

public sealed class NewsMarkerDto
{
    public string MarkerKey { get; set; } = string.Empty;
    public string MarkerType { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Source { get; set; } = string.Empty;
    public string Provider { get; set; } = string.Empty;
    public string Url { get; set; } = string.Empty;
    public string ImageUrl { get; set; } = string.Empty;
    public DateTime UpdatedAtUtc { get; set; }
}

public sealed class NewsBulletinResponseDto
{
    public string Region { get; set; } = string.Empty;
    public string Topic { get; set; } = string.Empty;
    public string Query { get; set; } = string.Empty;
    public string Headline { get; set; } = string.Empty;
    public string Summary { get; set; } = string.Empty;
    public DateTimeOffset GeneratedAtUtc { get; set; }
    public List<NewsBulletinArticleDto> Articles { get; set; } = [];
    public List<NewsProviderStatus> ProviderStatuses { get; set; } = [];
}

public sealed class NewsBulletinArticleDto
{
    public string Title { get; set; } = string.Empty;
    public string Summary { get; set; } = string.Empty;
    public string Source { get; set; } = string.Empty;
    public string Provider { get; set; } = string.Empty;
    public string? SourceUrl { get; set; }
    public string? ImageUrl { get; set; }
    public DateTimeOffset? PublishedAtUtc { get; set; }
    public string Region { get; set; } = string.Empty;
}
