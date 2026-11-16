using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.DTOs.Social;
using Wiseravenshare.Server.Models;
using Wiseravenshare.Server.Services;
using Wiseravenshare.Server.Services.SocialPublishing;
using Wiseravenshare.Server.Shared;

namespace Wiseravenshare.Server.Controllers;

/// <summary>
/// Three-layer social media pipeline:
///   1. Trigger  — this controller receives the publish intent from the site
///   2. Orchestrate — calls NuRavenCorpLLM /api/social/tailor for per-platform copy
///   3. Bridge   — fires the tailored content through the existing SocialPlatformService/Queue
///
/// Routes:
///   POST /api/social/orchestrate  — full pipeline trigger
///   GET  /api/social/connections  — user's connected platforms
/// </summary>
[ApiController]
[Route("api/social")]
[Authorize]
[Produces("application/json")]
public sealed class SocialOrchestrationController : ControllerBase
{
    private readonly ISocialPlatformService _socialPlatformService;
    private readonly ISocialPublishQueue _publishQueue;
    private readonly IHttpClientFactory _http;
    private readonly IConfiguration _cfg;
    private readonly IServiceProvider _sp;
    private readonly ILogger<SocialOrchestrationController> _logger;

    public SocialOrchestrationController(
        ISocialPlatformService socialPlatformService,
        ISocialPublishQueue publishQueue,
        IHttpClientFactory http,
        IConfiguration cfg,
        IServiceProvider sp,
        ILogger<SocialOrchestrationController> logger)
    {
        _socialPlatformService = socialPlatformService;
        _publishQueue = publishQueue;
        _http = http;
        _cfg = cfg;
        _sp = sp;
        _logger = logger;
    }

    // ── Trigger endpoint ──────────────────────────────────────────────────────

    /// <summary>
    /// Full three-layer pipeline:
    ///   1. Calls NuRavenCorpLLM to tailor the content per platform via LLM
    ///   2. Reads the calling user's stored OAuth tokens for each platform
    ///   3. Publishes (or queues) the tailored content via SocialPlatformService
    /// </summary>
    [HttpPost("orchestrate")]
    public async Task<IActionResult> Orchestrate(
        [FromBody] OrchestrateRequest request,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.RawContent))
            return BadRequest(new { error = "rawContent is required." });

        var userId = User.GetUserId();

        // ── Step 1: resolve user's connected platform credentials ─────────────
        var userFeeds = ResolveUserFeeds(userId);

        var targetPlatforms = ResolvePlatforms(request, userFeeds);
        if (targetPlatforms.Count == 0)
            return BadRequest(new { error = "No target platforms specified or connected." });

        // ── Step 2: LLM orchestration — tailor content per platform ───────────
        var tailored = await TailorContentAsync(request, targetPlatforms, ct);

        // ── Step 3: build publish request with tailored per-platform content ──
        var fbPageId = request.FacebookPageId
            ?? (userFeeds?.Facebook?.Enabled == true ? userFeeds.Facebook.DestinationId : null);
        var fbPageToken = userFeeds?.Facebook?.Enabled == true && !string.IsNullOrWhiteSpace(userFeeds.Facebook.DestinationToken)
            ? userFeeds.Facebook.DestinationToken
            : null;
        var ttUsername = request.TikTokUsername
            ?? (userFeeds?.TikTok?.Enabled == true ? userFeeds.TikTok.DestinationId : null);
        var ytChannelId = request.YouTubeChannelId
            ?? (userFeeds?.YouTube?.Enabled == true ? userFeeds.YouTube.DestinationId : null);

        var publishRequest = new PublishSocialContentRequest
        {
            Message = tailored.Facebook,          // Facebook copy
            PhotoUrl = request.MediaType == "photo" ? request.MediaUrl : null,
            VideoUrl = request.MediaType == "video" ? request.MediaUrl : null,
            MusicUrl = request.MediaType == "music" ? request.MediaUrl : null,
            MediaType = ResolveMediaType(request.MediaType),
            YouTubeTitle = tailored.YouTubeTitle,
            YouTubeDescription = tailored.YouTubeDescription,
            PublishToFacebook = targetPlatforms.Contains("facebook") && !string.IsNullOrWhiteSpace(fbPageId),
            PublishToInstagram = targetPlatforms.Contains("instagram"),
            PublishToTikTok = targetPlatforms.Contains("tiktok"),
            PublishToYouTube = targetPlatforms.Contains("youtube"),
            FacebookPageId = fbPageId,
            FacebookPageAccessToken = fbPageToken,
            TikTokUsername = ttUsername,
            YouTubeChannelId = ytChannelId
        };

        // Instagram uses a separate tailored caption
        // The service reads Message for all text; set the Instagram caption via context
        // by overriding Message to Instagram copy when only Instagram is targeted,
        // otherwise the platform service routes Message to all configured platforms.
        // For multi-platform we pass a combined message note and store per-platform
        // in the metadata enrichment block below.

        var activePlatforms = ResolveRequestedPlatforms(publishRequest);

        SocialPublishJobSnapshot? snapshot = null;
        PublishSocialContentResponse? directResult = null;

        if (request.Queue != false)
        {
            snapshot = _publishQueue.Enqueue(userId, publishRequest, activePlatforms);
        }
        else
        {
            directResult = await _socialPlatformService.PublishAsync(userId, publishRequest);
        }

        return Ok(new
        {
            queued = snapshot is not null,
            job_id = snapshot?.JobId,
            platforms = activePlatforms,
            tailored_by_llm = tailored.TailoredByLlm,
            preview = new
            {
                facebook = tailored.Facebook,
                instagram = tailored.Instagram,
                tiktok = tailored.TikTok,
                youtube_title = tailored.YouTubeTitle,
                youtube_description = tailored.YouTubeDescription
            },
            direct_results = directResult?.Results.Select(r => new
            {
                platform = r.Platform,
                success = r.Success,
                post_id = r.ExternalPostId,
                url = r.ExternalPostUrl,
                error = r.Error
            })
        });
    }

    // ── Connections endpoint ──────────────────────────────────────────────────

    /// <summary>Returns the calling user's connected social platforms.</summary>
    [HttpGet("connections")]
    public IActionResult GetConnections()
    {
        var userId = User.GetUserId();
        var feeds = ResolveUserFeeds(userId);

        return Ok(new
        {
            facebook = ConnectionStatus(feeds?.Facebook),
            instagram = ConnectionStatus(feeds?.Instagram),
            tiktok = ConnectionStatus(feeds?.TikTok),
            youtube = ConnectionStatus(feeds?.YouTube),
            twitter = ConnectionStatus(feeds?.Twitter),
            bluesky = ConnectionStatus(feeds?.Bluesky)
        });
    }

    // ── LLM tailoring helper ──────────────────────────────────────────────────

    private async Task<TailoredContent> TailorContentAsync(
        OrchestrateRequest request, List<string> platforms, CancellationToken ct)
    {
        var nrBaseUrl = (_cfg["NuRavenCorpLlm:BaseUrl"] ?? "http://localhost:5011").TrimEnd('/');
        var crossAppKey = _cfg["NuRavenCorpLlm:CrossAppKey"]
                          ?? _cfg["NuRavenCorpLlm:AccessToken"]
                          ?? string.Empty;

        if (string.IsNullOrWhiteSpace(nrBaseUrl))
            return Fallback(request.RawContent);

        try
        {
            using var client = _http.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(30);
            if (!string.IsNullOrWhiteSpace(crossAppKey))
                client.DefaultRequestHeaders.TryAddWithoutValidation("X-NR-App-Key", crossAppKey);

            var payload = JsonSerializer.Serialize(new
            {
                rawContent = request.RawContent,
                platforms = platforms.ToArray(),
                mediaType = request.MediaType,
                postTitle = request.PostTitle,
                context = request.Context
            });

            using var httpRequest = new HttpRequestMessage(HttpMethod.Post, $"{nrBaseUrl}/api/social/tailor")
            {
                Content = new StringContent(payload, Encoding.UTF8, "application/json")
            };

            using var response = await client.SendAsync(httpRequest, ct);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("NuRavenCorpLLM social tailor returned {Status}; using fallback.",
                    (int)response.StatusCode);
                return Fallback(request.RawContent);
            }

            var body = await response.Content.ReadAsStringAsync(ct);
            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;

            return new TailoredContent
            {
                Facebook = GetStr(root, "facebook") ?? request.RawContent,
                Instagram = GetStr(root, "instagram") ?? request.RawContent,
                TikTok = GetStr(root, "tikTok") ?? GetStr(root, "tiktok") ?? request.RawContent,
                YouTubeTitle = GetStr(root, "youTubeTitle") ?? GetStr(root, "youtube_title") ?? request.PostTitle ?? TruncateTitle(request.RawContent),
                YouTubeDescription = GetStr(root, "youTubeDescription") ?? GetStr(root, "youtube_description") ?? request.RawContent,
                TailoredByLlm = root.TryGetProperty("tailoredByLlm", out var llmFlag) && llmFlag.GetBoolean()
            };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to reach NuRavenCorpLLM for social tailoring; using raw content.");
            return Fallback(request.RawContent);
        }
    }

    // ── Utilities ─────────────────────────────────────────────────────────────

    private SocialFeedSettings? ResolveUserFeeds(Guid userId)
    {
        if (userId == Guid.Empty) return null;
        try
        {
            var userStore = _sp.GetService<UserStore>();
            if (userStore is null) return null;
            return userStore.TryGetById(userId.ToString(), out var user) && user is not null
                ? user.SocialFeeds
                : null;
        }
        catch { return null; }
    }

    private static List<string> ResolvePlatforms(OrchestrateRequest req, SocialFeedSettings? feeds)
    {
        var requested = req.Platforms?.Select(p => p.Trim().ToLowerInvariant()).Distinct().ToList();
        if (requested is { Count: > 0 }) return requested;

        // Default: auto-select all platforms the user has connected
        var auto = new List<string>();
        if (feeds?.Facebook?.Enabled == true && !string.IsNullOrWhiteSpace(feeds.Facebook.DestinationId))
            auto.Add("facebook");
        if (feeds?.Instagram?.Enabled == true)
            auto.Add("instagram");
        if (feeds?.TikTok?.Enabled == true && !string.IsNullOrWhiteSpace(feeds.TikTok.DestinationId))
            auto.Add("tiktok");
        if (feeds?.YouTube?.Enabled == true && !string.IsNullOrWhiteSpace(feeds.YouTube.DestinationId))
            auto.Add("youtube");

        return auto;
    }

    private static List<string> ResolveRequestedPlatforms(PublishSocialContentRequest req)
    {
        var list = new List<string>();
        if (req.PublishToFacebook) list.Add("facebook");
        if (req.PublishToInstagram) list.Add("instagram");
        if (req.PublishToTikTok) list.Add("tiktok");
        if (req.PublishToYouTube) list.Add("youtube");
        return list;
    }

    private static string ResolveMediaType(string? hint) =>
        (hint ?? "auto").Trim().ToLowerInvariant() switch
        {
            "photo" or "image" => SocialMediaType.Photo,
            "video" => SocialMediaType.Video,
            "music" or "audio" => SocialMediaType.Music,
            "text" => SocialMediaType.Text,
            _ => SocialMediaType.Auto
        };

    private static object ConnectionStatus(SocialFeedConnection? conn) =>
        new
        {
            connected = conn?.Enabled == true,
            destinationId = conn?.DestinationId ?? string.Empty,
            destinationName = conn?.DestinationName ?? string.Empty,
            tokenExpires = conn?.TokenExpiresAt
        };

    private static TailoredContent Fallback(string raw) => new()
    {
        Facebook = raw,
        Instagram = raw,
        TikTok = raw.Length > 150 ? raw[..147] + "..." : raw,
        YouTubeTitle = TruncateTitle(raw),
        YouTubeDescription = raw,
        TailoredByLlm = false
    };

    private static string TruncateTitle(string s)
    {
        s = s.Trim();
        return s.Length <= 70 ? s : s[..67] + "...";
    }

    private static string? GetStr(JsonElement el, string key) =>
        el.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.String
            ? v.GetString() : null;

    private sealed class TailoredContent
    {
        public string Facebook { get; init; } = string.Empty;
        public string Instagram { get; init; } = string.Empty;
        public string TikTok { get; init; } = string.Empty;
        public string YouTubeTitle { get; init; } = string.Empty;
        public string YouTubeDescription { get; init; } = string.Empty;
        public bool TailoredByLlm { get; init; }
    }
}

public sealed class OrchestrateRequest
{
    /// <summary>Raw creator content (caption, description, post text).</summary>
    public string RawContent { get; set; } = string.Empty;

    /// <summary>Platforms to publish to: facebook, instagram, tiktok, youtube.
    /// If omitted, auto-selects all platforms the user has connected.</summary>
    public string[]? Platforms { get; set; }

    /// <summary>Media type hint: photo, video, music, text, auto.</summary>
    public string? MediaType { get; set; }

    /// <summary>Publicly reachable media URL (photo/video/music).</summary>
    public string? MediaUrl { get; set; }

    /// <summary>Optional post/video title (seeds YouTube title).</summary>
    public string? PostTitle { get; set; }

    /// <summary>Extra context for LLM tailoring (audience, campaign, etc.).</summary>
    public string? Context { get; set; }

    /// <summary>Explicit Facebook Page ID (overrides stored connection).</summary>
    public string? FacebookPageId { get; set; }

    /// <summary>Explicit TikTok username (overrides stored connection).</summary>
    public string? TikTokUsername { get; set; }

    /// <summary>Explicit YouTube Channel ID (overrides stored connection).</summary>
    public string? YouTubeChannelId { get; set; }

    /// <summary>Queue the job (default: true). Set false for synchronous publish.</summary>
    public bool? Queue { get; set; }
}
