using System.Security.Claims;
using System.Text.Json;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Stripe;
using Wiseravenshare.Server.Exceptions;
using WiseRavenShare.Server.Application.Services.Assistant;
using Wiseravenshare.Server.DTOs.Collaboration;
using Wiseravenshare.Server.DTOs.Social;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Entities.Currency;
using Wiseravenshare.Server.Entities.FM;
using Wiseravenshare.Server.Infrastructure.Data;
using Wiseravenshare.Server.Interfaces.Services;
using Wiseravenshare.Server.Models;
using Wiseravenshare.Server.Services.AiAssistant;
using Wiseravenshare.Server.Services.Currency;
using Wiseravenshare.Server.Services;
using Wiseravenshare.Server.Services.Interfaces;
using Wiseravenshare.Server.Services.SocialPublishing;
using Wiseravenshare.Server.Services.Truth;
using CreateRavensightMediaAssetRequest = Wiseravenshare.Server.Models.CreateRavensightMediaAssetRequest;
using CreateVideoLibraryEntryRequest = Wiseravenshare.Server.Models.CreateVideoLibraryEntryRequest;
using RavensightMediaType = Wiseravenshare.Server.Models.RavensightMediaType;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/functions")]
[Authorize]
[Produces("application/json")]
public sealed class FunctionCompatController : ControllerBase
{
    private readonly IOllamaChatService _chatService;
    private readonly ITruthEngineService _truthEngine;
    private readonly IWiseCoinService _wiseCoinService;
    private readonly AppDbContext _db;
    private readonly IServiceProvider _serviceProvider;
    private readonly TeamAccessService _teamAccessService;
    private readonly GrowthService _growthService;
    private readonly IEmailService _emailService;
    private readonly ISocialPlatformService _socialPlatformService;
    private readonly ISiteCrawlerService _siteCrawlerService;
    private readonly ISubscriptionService _subscriptionService;
    private readonly ISocialPublishQueue _socialPublishQueue;
    private readonly IMusicLibraryStore _musicLibraryStore;
    private readonly IRavensightVideoService _videoService;
    private readonly IRavensightPhotoService _photoService;
    private readonly RavensightMediaCatalogStore _mediaCatalogStore;
    private readonly VideoLibraryStore _videoLibraryStore;
    private readonly IMediaBlobSignatureService _signatureService;
    private readonly ISpeechToTextService _speechToTextService;
    private readonly IConfiguration _configuration;
    private readonly ILogger<FunctionCompatController> _logger;

    public FunctionCompatController(
        IOllamaChatService chatService,
        ITruthEngineService truthEngine,
        IWiseCoinService wiseCoinService,
        AppDbContext db,
        IServiceProvider serviceProvider,
        TeamAccessService teamAccessService,
        GrowthService growthService,
        IEmailService emailService,
        ISocialPlatformService socialPlatformService,
        ISiteCrawlerService siteCrawlerService,
        ISubscriptionService subscriptionService,
        ISocialPublishQueue socialPublishQueue,
        IMusicLibraryStore musicLibraryStore,
        IRavensightVideoService videoService,
        IRavensightPhotoService photoService,
        RavensightMediaCatalogStore mediaCatalogStore,
        VideoLibraryStore videoLibraryStore,
        IMediaBlobSignatureService signatureService,
        ISpeechToTextService speechToTextService,
        IConfiguration configuration,
        ILogger<FunctionCompatController> logger)
    {
        _chatService = chatService;
        _truthEngine = truthEngine;
        _wiseCoinService = wiseCoinService;
        _db = db;
        _serviceProvider = serviceProvider;
        _teamAccessService = teamAccessService;
        _growthService = growthService;
        _emailService = emailService;
        _socialPlatformService = socialPlatformService;
        _siteCrawlerService = siteCrawlerService;
        _subscriptionService = subscriptionService;
        _socialPublishQueue = socialPublishQueue;
        _musicLibraryStore = musicLibraryStore;
        _videoService = videoService;
        _photoService = photoService;
        _mediaCatalogStore = mediaCatalogStore;
        _videoLibraryStore = videoLibraryStore;
        _signatureService = signatureService;
        _speechToTextService = speechToTextService;
        _configuration = configuration;
        _logger = logger;
    }

    [HttpPost("get-analytics-data")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> GetAnalyticsData([FromBody] AnalyticsRequest request)
    {
        return Ok(await BuildLocalAnalyticsAsync(request.Days, includeTopContent: true));
    }

    [HttpPost("create-karaoke-checkout")]
    [HttpPost("CreateKaraokeCheckout")]
    public async Task<IActionResult> CreateKaraokeCheckout([FromBody] JsonElement body)
    {
        var userId = ResolveUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { error = "Unauthorized" });
        }

        var origin = GetAppBaseUrl();
        var successUrl = $"{origin}/media?karaoke=success";
        var cancelUrl = $"{origin}/media?karaoke=cancelled";

        try
        {
            var checkout = await _subscriptionService.CreateCheckoutSessionAsync(userId, new global::Wiseravenshare.Server.DTOs.CreateCheckoutSessionRequest
            {
                Plan = "karaoke_pro",
                BillingCycle = "monthly",
                SuccessUrl = successUrl,
                CancelUrl = cancelUrl
            });

            return Ok(new { url = checkout.Url, session_id = checkout.SessionId });
        }
        catch (InvalidOperationException ex)
        {
            _logger.LogWarning(ex, "Karaoke checkout prerequisites are not met for user {UserId}.", userId);
            return BadRequest(new { error = ex.Message });
        }
        catch (NotFoundException ex)
        {
            _logger.LogWarning(ex, "Karaoke checkout could not resolve user {UserId}.", userId);
            return NotFound(new { error = ex.Message });
        }
        catch (StripeException ex)
        {
            _logger.LogWarning(ex, "Failed to create karaoke checkout session for user {UserId}.", userId);
            return BadRequest(new { error = ex.StripeError?.Message ?? ex.Message });
        }
    }

    [HttpPost("create-podcast-checkout")]
    [HttpPost("CreatePodcastCheckout")]
    public async Task<IActionResult> CreatePodcastCheckout([FromBody] JsonElement body)
    {
        var userId = ResolveUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { error = "Unauthorized" });
        }

        var paymentType = body.TryGetProperty("payment_type", out var paymentTypeProp)
            ? paymentTypeProp.GetString()?.Trim().ToLowerInvariant()
            : "subscription";

        if (!string.Equals(paymentType, "subscription", StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest(new { error = "Only subscription checkout is supported for podcast plans." });
        }

        var podcastId = body.TryGetProperty("podcast_id", out var podcastIdProp)
            ? podcastIdProp.GetString()
            : null;

        var origin = GetAppBaseUrl();
        var successUrl = string.IsNullOrWhiteSpace(podcastId)
            ? $"{origin}/ravensight?podcastCheckout=success"
            : $"{origin}/ravensight?podcastCheckout=success&podcastId={Uri.EscapeDataString(podcastId)}";
        var cancelUrl = string.IsNullOrWhiteSpace(podcastId)
            ? $"{origin}/ravensight?podcastCheckout=cancelled"
            : $"{origin}/ravensight?podcastCheckout=cancelled&podcastId={Uri.EscapeDataString(podcastId)}";

        try
        {
            var checkout = await _subscriptionService.CreateCheckoutSessionAsync(userId, new global::Wiseravenshare.Server.DTOs.CreateCheckoutSessionRequest
            {
                Plan = "podcast_pro",
                BillingCycle = "monthly",
                SuccessUrl = successUrl,
                CancelUrl = cancelUrl
            });

            return Ok(new { url = checkout.Url, session_id = checkout.SessionId });
        }
        catch (InvalidOperationException ex)
        {
            _logger.LogWarning(ex, "Podcast checkout prerequisites are not met for user {UserId}.", userId);
            return BadRequest(new { error = ex.Message });
        }
        catch (NotFoundException ex)
        {
            _logger.LogWarning(ex, "Podcast checkout could not resolve user {UserId}.", userId);
            return NotFound(new { error = ex.Message });
        }
        catch (StripeException ex)
        {
            _logger.LogWarning(ex, "Failed to create podcast checkout session for user {UserId}.", userId);
            return BadRequest(new { error = ex.StripeError?.Message ?? ex.Message });
        }
    }

    [HttpPost("transcribe-local-file")]
    [HttpPost("TranscribeLocalFile")]
    [RequestSizeLimit(25_000_000)]
    public async Task<IActionResult> TranscribeLocalFile(CancellationToken cancellationToken)
    {
        if (!Request.HasFormContentType)
        {
            return BadRequest(new { message = "multipart/form-data is required." });
        }

        var form = await Request.ReadFormAsync(cancellationToken);
        var audio = form.Files.GetFile("audio")
            ?? form.Files.GetFile("file")
            ?? form.Files.FirstOrDefault();

        if (audio is null || audio.Length == 0)
        {
            return BadRequest(new { message = "Audio file required." });
        }

        using var stream = audio.OpenReadStream();
        try
        {
            var contentType = string.IsNullOrWhiteSpace(audio.ContentType)
                ? "application/octet-stream"
                : audio.ContentType;
            var result = await _speechToTextService.TranscribeAsync(stream, contentType, audio.FileName, cancellationToken);
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Direct local transcription failed for {FileName}.", audio.FileName);
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("cloud-media-transfer")]
    [HttpPost("CloudMediaTransfer")]
    public async Task<IActionResult> CloudMediaTransfer([FromBody] JsonElement payload, CancellationToken cancellationToken = default)
    {
        var action = payload.TryGetProperty("action", out var actionProp)
            ? actionProp.GetString()?.Trim().ToLowerInvariant()
            : string.Empty;
        var provider = payload.TryGetProperty("provider", out var providerProp)
            ? providerProp.GetString()?.Trim().ToLowerInvariant()
            : string.Empty;

        if (provider is not ("googledrive" or "dropbox"))
        {
            return BadRequest(new { message = "provider must be googledrive or dropbox." });
        }

        if (provider == "googledrive")
        {
            return action switch
            {
                "list" => Ok(new
                {
                    provider,
                    files = Array.Empty<object>(),
                    connected = true,
                    message = "Google Drive browsing is not configured on this deployment."
                }),
                "import" => Ok(new
                {
                    provider,
                    action,
                    success = true,
                    message = "Google Drive import request accepted (compat mode)."
                }),
                "export" => Ok(new
                {
                    provider,
                    action,
                    success = true,
                    message = "Google Drive export request accepted (compat mode)."
                }),
                _ => BadRequest(new { message = "action must be list, import, export, or include." })
            };
        }

        var dropboxAccessToken = ResolveDropboxAccessToken();
        if (string.IsNullOrWhiteSpace(dropboxAccessToken))
        {
            if (action is "include" or "import")
            {
                var hasLink = !string.IsNullOrWhiteSpace(ReadString(payload, "sharedUrl"))
                    || !string.IsNullOrWhiteSpace(ReadString(payload, "url"))
                    || !string.IsNullOrWhiteSpace(ReadString(payload, "directUrl"));
                if (hasLink)
                {
                    return await IncludeDropboxSharedLinkAsync(payload, cancellationToken);
                }
            }

            return Ok(new
            {
                provider,
                connected = false,
                success = false,
                inclusionMethods = new[]
                {
                    "Paste Dropbox shared URL (sharedUrl/url) to include media without server token.",
                    "Configure Dropbox:AccessToken for full folder browsing/import."
                },
                message = "Dropbox API token is missing. Shared-link inclusion is still available."
            });
        }

        return action switch
        {
            "list" => await ListDropboxFilesAsync(payload, dropboxAccessToken, cancellationToken),
            "import" => await ImportDropboxFileAsync(payload, dropboxAccessToken, cancellationToken),
            "include" => await IncludeDropboxSharedLinkAsync(payload, cancellationToken),
            "export" => Ok(new
            {
                provider,
                action,
                success = true,
                methods = new[]
                {
                    "Export by direct upload to Dropbox API (not yet enabled on this deployment).",
                    "Use 'include' with Dropbox shared links for immediate in-app rendering."
                },
                message = "Dropbox export fallback returned inclusion methods."
            }),
            _ => BadRequest(new { message = "action must be list, import, export, or include." })
        };
    }

    [HttpPost("add-jam-session-to-calendar")]
    [HttpPost("AddJamSessionToCalendar")]
    public IActionResult AddJamSessionToCalendar([FromBody] AddJamSessionToCalendarRequest? request)
    {
        if (request is null || string.IsNullOrWhiteSpace(request.Title))
        {
            return BadRequest(new { error = "title is required." });
        }

        return Ok(new
        {
            success = true,
            provider = "google-calendar",
            event_id = $"compat-{Guid.NewGuid():N}",
            title = request.Title.Trim(),
            scheduled_date = request.ScheduledDate,
            invited = request.AttendeeEmails?.Length ?? 0,
            message = "Jam session accepted in compatibility mode."
        });
    }

    [HttpPost("get-pg-analytics")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> GetPgAnalytics([FromBody] AnalyticsRequest request)
    {
        return Ok(await BuildLocalAnalyticsAsync(request.Days, includeTopContent: false));
    }

    [HttpPost("generate-ai-news")]
    public async Task<IActionResult> GenerateAiNews([FromBody] FunctionPromptRequest request)
    {
        return Ok(await RunPromptAsync(
            "You are WiseRavenShare News. Write a concise, factual news brief with headline, summary, key points, and suggested tags.",
            request));
    }

    [HttpPost("generate-journalism-report")]
    public async Task<IActionResult> GenerateJournalismReport([FromBody] FunctionPromptRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Prompt))
        {
            return Ok(new { error = "Prompt is required." });
        }

        var response = await _chatService.ChatAsync(new AiChatRequest
        {
            Message = "You are a newsroom research assistant. Produce a structured journalism report with headline, lede, background, evidence, counterpoints, and next steps.\n\nUser prompt:\n" + request.Prompt,
            Model = request.Model,
            UseCrawlerContext = true
        });

        if (response.Success && !string.IsNullOrWhiteSpace(response.Reply))
        {
            return Ok(new
            {
                reply = response.Reply,
                model = response.Model
            });
        }

        _logger.LogWarning("Journalism report AI generation failed; returning structured fallback. Error: {Error}", response.Error);
        return Ok(new
        {
            reply = BuildFallbackJournalismReport(request.Prompt),
            model = "fallback-journalism-v1",
            warning = response.Error ?? "AI generation failed."
        });
    }

    [HttpPost("score-truth")]
    public async Task<IActionResult> ScoreTruth([FromBody] FunctionTextRequest request)
    {
        var content = request.Text;
        if (string.IsNullOrWhiteSpace(content) && request.PostId.HasValue)
        {
            var post = await _db.Posts.AsNoTracking().FirstOrDefaultAsync(x => x.Id == request.PostId.Value);
            content = post?.Content;
        }

        if (string.IsNullOrWhiteSpace(content))
        {
            return BadRequest(new { error = "text or post_id is required." });
        }

        var score = await _truthEngine.GetTruthScoreAsync(content);
        return Ok(score);
    }

    [HttpPost("evaluate-wisecoins")]
    public async Task<IActionResult> EvaluateWiseCoins()
    {
        var userId = ResolveUserId();
        var wallet = await _wiseCoinService.GetOrCreateWalletAsync(userId);
        var valuation = await _wiseCoinService.GetCurrentValuationAsync();

        return Ok(new
        {
            userId,
            balance = wallet.Balance,
            lockedBalance = wallet.LockedBalance,
            escrowedBalance = wallet.EscrowedBalance,
            effectiveBalance = wallet.GetEffectiveBalance(),
            totalMultiplier = wallet.TotalMultiplier,
            currentValueUsd = decimal.Round(wallet.Balance * valuation.WSCPerHour / 100m, 2),
            workHoursContributed = wallet.WorkHoursContributed,
            hasReceivedInitialAllocation = wallet.HasReceivedInitialAllocation
        });
    }

    [HttpPost("notify-activity")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> NotifyActivity([FromBody] NotifyActivityRequest request)
    {
        if (request.RecipientId == Guid.Empty || string.IsNullOrWhiteSpace(request.Type) || string.IsNullOrWhiteSpace(request.Message))
        {
            return BadRequest(new { error = "recipient_id, type, and message are required." });
        }

        var currentUserId = ResolveUserId();
        if (request.RecipientId == currentUserId)
        {
            return Ok(new { skipped = true });
        }

        var notification = new Notification
        {
            UserId = request.RecipientId,
            ActorId = currentUserId == Guid.Empty ? null : currentUserId,
            Type = ParseNotificationType(request.Type),
            Content = request.Message.Trim(),
            Metadata = BuildJsonDocument(new
            {
                link = request.Link,
                source = "function-compat.notify-activity"
            }),
            IsRead = false
        };

        _db.Set<Notification>().Add(notification);
        await _db.SaveChangesAsync();
        return Ok(new { notification_id = notification.Id });
    }

    [HttpPost("invite-collaborator")]
    [Authorize]
    public async Task<IActionResult> InviteCollaborator([FromBody] InviteCollaboratorRequest request)
    {
        var projectService = _serviceProvider.GetService<IProjectService>();
        if (projectService is null)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { error = "Collaboration services are not available." });
        }

        if (request.ProjectId == Guid.Empty || string.IsNullOrWhiteSpace(request.Identifier))
        {
            return BadRequest(new { error = "projectId and identifier are required." });
        }

        var inviteeEmail = await ResolveInviteeEmailAsync(request.Identifier);
        if (inviteeEmail is null)
        {
            return BadRequest(new { error = "Provide an email address or a known collaborator identifier." });
        }

        var invite = await projectService.InviteCollaboratorAsync(request.ProjectId, new InviteCollaboratorDto
        {
            Email = inviteeEmail,
            Role = string.IsNullOrWhiteSpace(request.Role) ? "Contributor" : request.Role,
            Level = request.Level,
            Message = request.Message
        }, ResolveUserId());

        return Ok(new { invite, invitee_email = inviteeEmail });
    }

    [HttpPost("invite-collaborators")]
    [Authorize]
    public async Task<IActionResult> InviteCollaborators([FromBody] TeamCollaboratorInviteRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Identifier))
        {
            return BadRequest(new { error = "identifier is required." });
        }

        var inviteeEmail = await ResolveInviteeEmailAsync(request.Identifier);
        if (inviteeEmail is null)
        {
            return BadRequest(new { error = "Provide an email address or a known user identifier." });
        }

        var inviter = await ResolveCurrentUserAsync();
        var displayName = request.Responsibility?.Trim();
        var issue = _teamAccessService.IssueInvite(
            inviter.Email,
            inviteeEmail,
            displayName ?? inviter.DisplayName ?? inviter.Email,
            string.IsNullOrWhiteSpace(request.Role) ? "member" : request.Role,
            TimeSpan.FromDays(7),
            prearranged: !string.IsNullOrWhiteSpace(request.Device));

        var inviteLink = $"{GetAppBaseUrl()}/register?team_invite={Uri.EscapeDataString(issue.InviteToken)}";
        _ = await _emailService.SendTeamInviteEmailAsync(new TeamInviteEmailMessage
        {
            ToEmail = inviteeEmail,
            ToName = displayName ?? inviteeEmail.Split('@')[0],
            InviterEmail = inviter.Email,
            TeamRole = string.IsNullOrWhiteSpace(request.Role) ? "member" : request.Role,
            Prearranged = !string.IsNullOrWhiteSpace(request.Device),
            ExpiresAtUtc = issue.ExpiresAtUtc,
            InviteLink = inviteLink
        });

        return Ok(new
        {
            success = true,
            invited = inviteeEmail,
            inviteId = issue.InviteId,
            inviteLink,
            expiresAtUtc = issue.ExpiresAtUtc
        });
    }

    [HttpPost("invite-user-with-reward")]
    [Authorize]
    public async Task<IActionResult> InviteUserWithReward([FromBody] InviteUserWithRewardRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Email))
        {
            return BadRequest(new { error = "email is required." });
        }

        var inviter = await ResolveCurrentUserAsync();
        var invite = _growthService.CreateInvite(inviter.Id.ToString("N"), inviter.Email, request.Email, request.Message ?? string.Empty);
        var inviteLink = $"{GetAppBaseUrl()}/register?ref={Uri.EscapeDataString(invite.Code)}";

        await _emailService.SendWelcomeEmailAsync(request.Email, request.Email.Split('@')[0]);

        return Ok(new
        {
            success = true,
            email = request.Email,
            reward = request.RewardAmount <= 0 ? 25 : request.RewardAmount,
            inviteCode = invite.Code,
            inviteLink
        });
    }

    [HttpPost("issue-digital-certificate")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> IssueDigitalCertificate([FromBody] IssueDigitalCertificateRequest request)
    {
        if (request.MediaAssetId == Guid.Empty || string.IsNullOrWhiteSpace(request.RightsHolderName))
        {
            return BadRequest(new { error = "media_asset_id and rights_holder_name are required." });
        }

        var asset = await _db.SavedMediaItems.AsNoTracking().FirstOrDefaultAsync(x => x.Id == request.MediaAssetId);
        if (asset is null)
        {
            return NotFound(new { error = "Media asset not found." });
        }

        var fingerprint = await ComputeFingerprintAsync(asset.MediaUrl);
        var certificateId = $"WRS-DRM-{Guid.NewGuid():N}"[..18].ToUpperInvariant();
        var authority = ResolveAuthority(request.State);

        return Ok(new
        {
            certificate_id = certificateId,
            media_asset_id = asset.Id,
            asset_title = asset.Title,
            asset_type = asset.MediaType.ToString(),
            file_uri = asset.MediaUrl,
            rights_holder_name = request.RightsHolderName,
            rights_holder_email = request.RightsHolderEmail,
            certificate_type = string.IsNullOrWhiteSpace(request.CertificateType) ? "ownership" : request.CertificateType,
            metadata_timestamp = DateTime.UtcNow,
            authenticity_badge = "verified",
            verification_status = "verified",
            state = (request.State ?? string.Empty).Trim().ToUpperInvariant(),
            copyright_authority = authority.name,
            authority_url = authority.url,
            file_hash = fingerprint.hash,
            hash_method = fingerprint.method,
            verified_at = DateTime.UtcNow
        });
    }

    [HttpPost("list-music-analysis")]
    [Authorize]
    public async Task<IActionResult> ListMusicAnalysis([FromBody] MusicAnalysisQueryRequest? request)
    {
        request ??= new MusicAnalysisQueryRequest();

        try
        {
            var query = _db.SavedMediaItems.AsNoTracking().Where(x => x.MediaType == MediaLibraryType.Music);
            if (request.CreatedById.HasValue)
            {
                query = query.Where(x => x.UserId == request.CreatedById.Value);
            }

            var items = await query
                .OrderByDescending(x => x.CreatedAt)
                .Take(ClampLimit(request.Limit))
                .Select(x => new
                {
                    analysis_id = x.Id,
                    created_by_id = x.UserId,
                    title = x.Title,
                    description = x.Description,
                    media_url = x.MediaUrl,
                    tags = x.Tags,
                    created_date = x.CreatedAt,
                    metadata = x.MediaMetadata
                })
                .ToListAsync();

            return Ok(new { items, total = items.Count, sort = request.Sort ?? "-created_date" });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "list-music-analysis fell back to empty response.");
            return Ok(new
            {
                items = Array.Empty<object>(),
                total = 0,
                sort = request.Sort ?? "-created_date",
                degraded = true
            });
        }
    }

    [HttpPost("manage-music-analysis")]
    [Authorize]
    public async Task<IActionResult> ManageMusicAnalysis([FromBody] ManageMusicAnalysisRequest request)
    {
        if (request.AnalysisId == Guid.Empty || string.IsNullOrWhiteSpace(request.Action))
        {
            return BadRequest(new { error = "analysis_id and action are required." });
        }

        var analysis = await _db.SavedMediaItems.FirstOrDefaultAsync(x => x.Id == request.AnalysisId);
        if (analysis is null)
        {
            return NotFound(new { error = "Analysis not found." });
        }

        ApplyMusicAnalysisAction(analysis, request);
        await _db.SaveChangesAsync();

        return Ok(new { success = true, analysis_id = analysis.Id, action = request.Action });
    }

    [HttpPost("list-truth-scores")]
    [Authorize]
    public async Task<IActionResult> ListTruthScores([FromBody] TruthScoreQueryRequest? request)
    {
        request ??= new TruthScoreQueryRequest();

        try
        {
            var query = _db.Posts.AsNoTracking().Where(x => x.TruthScore != null);
            if (request.TargetId.HasValue)
            {
                query = query.Where(x => x.Id == request.TargetId.Value);
            }

            var items = await query
                .OrderByDescending(x => x.CreatedAt)
                .Take(ClampLimit(request.Limit))
                .Select(x => new
                {
                    score_id = x.Id,
                    target_id = x.Id,
                    target_type = "post",
                    score = x.TruthScore,
                    correction = x.TruthCorrection,
                    created_date = x.CreatedAt
                })
                .ToListAsync();

            return Ok(new { items, total = items.Count, sort = request.Sort ?? "-created_date" });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "list-truth-scores fell back to empty response.");
            return Ok(new
            {
                items = Array.Empty<object>(),
                total = 0,
                sort = request.Sort ?? "-created_date",
                degraded = true
            });
        }
    }

    [HttpPost("manage-truth-score")]
    [Authorize]
    public async Task<IActionResult> ManageTruthScore([FromBody] ManageTruthScoreRequest request)
    {
        if (request.ScoreId == Guid.Empty || string.IsNullOrWhiteSpace(request.Action))
        {
            return BadRequest(new { error = "score_id and action are required." });
        }

        var post = await _db.Posts.FirstOrDefaultAsync(x => x.Id == request.ScoreId);
        if (post is null)
        {
            return NotFound(new { error = "Truth score not found." });
        }

        switch (request.Action.Trim().ToLowerInvariant())
        {
            case "clear":
                post.TruthScore = null;
                post.TruthCorrection = null;
                post.TruthSources = null;
                break;
            case "set":
            case "update":
                if (!request.Score.HasValue)
                {
                    return BadRequest(new { error = "score is required for set/update actions." });
                }
                post.TruthScore = request.Score.Value;
                post.TruthCorrection = request.Correction;
                break;
            default:
                return BadRequest(new { error = "Unsupported action." });
        }

        await _db.SaveChangesAsync();
        return Ok(new { success = true, score_id = post.Id, action = request.Action });
    }

    [HttpPost("suggest-podcast-pricing")]
    public IActionResult SuggestPodcastPricing([FromBody] PodcastPricingRequest request)
    {
        var monthly = Math.Max(request.MonthlyEpisodes, 1);
        var suggestedMonthly = Math.Clamp(request.BaseMonthlyPrice + (monthly * 5), 5, 500);
        var suggestedAnnual = suggestedMonthly * 10;

        return Ok(new
        {
            request.PodcastTitle,
            request.MonthlyEpisodes,
            currency = "USD",
            suggestedMonthlyPrice = suggestedMonthly,
            suggestedAnnualPrice = suggestedAnnual,
            rationale = "Computed from a simple base-price plus episode cadence heuristic."
        });
    }

    [HttpPost("send-message")]
    [Authorize]
    public async Task<IActionResult> SendMessage([FromBody] SendMessageRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Content))
        {
            return BadRequest(new { error = "content is required." });
        }

        var senderId = ResolveUserId();
        if (senderId == Guid.Empty)
        {
            return Unauthorized(new { error = "Unauthorized" });
        }

        var recipientId = request.RecipientId;
        if (!recipientId.HasValue && !string.IsNullOrWhiteSpace(request.RecipientEmail))
        {
            recipientId = await _db.Users.AsNoTracking()
                .Where(x => x.Email == request.RecipientEmail)
                .Select(x => (Guid?)x.Id)
                .FirstOrDefaultAsync();
        }

        Guid conversationId;
        if (request.ConversationId.HasValue)
        {
            conversationId = request.ConversationId.Value;
            var isParticipant = await _db.ConversationParticipants.AsNoTracking()
                .AnyAsync(x => x.ConversationId == conversationId && x.UserId == senderId);
            if (!isParticipant)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { error = "Forbidden" });
            }
        }
        else
        {
            if (!recipientId.HasValue || recipientId.Value == Guid.Empty)
            {
                return BadRequest(new { error = "Could not resolve conversation" });
            }

            var recipient = recipientId.Value;
            var existingConversationId = await _db.ConversationParticipants
                .Where(cp => cp.UserId == senderId || cp.UserId == recipient)
                .GroupBy(cp => cp.ConversationId)
                .Where(g => g.Any(x => x.UserId == senderId)
                            && g.Any(x => x.UserId == recipient)
                            && g.Select(x => x.UserId).Distinct().Count() == 2)
                .Select(g => g.Key)
                .FirstOrDefaultAsync();

            if (existingConversationId != Guid.Empty)
            {
                conversationId = existingConversationId;
            }
            else
            {
                var conversation = new Conversation
                {
                    IsGroup = false,
                    CreatedBy = senderId,
                    LastMessageAt = DateTime.UtcNow
                };
                _db.Conversations.Add(conversation);
                await _db.SaveChangesAsync();

                _db.ConversationParticipants.AddRange(
                    new ConversationParticipant
                    {
                        ConversationId = conversation.Id,
                        UserId = senderId,
                        JoinedAt = DateTime.UtcNow
                    },
                    new ConversationParticipant
                    {
                        ConversationId = conversation.Id,
                        UserId = recipient,
                        JoinedAt = DateTime.UtcNow
                    });
                await _db.SaveChangesAsync();
                conversationId = conversation.Id;
            }
        }

        var participants = await _db.ConversationParticipants.AsNoTracking()
            .Where(x => x.ConversationId == conversationId)
            .Select(x => x.UserId)
            .ToListAsync();

        var message = new Message
        {
            ConversationId = conversationId,
            SenderId = senderId,
            Content = request.Content.Trim(),
            Type = MessageType.Text,
            ReplyToId = request.ParentMessageId
        };
        _db.Messages.Add(message);

        var conversationToUpdate = await _db.Conversations.FirstOrDefaultAsync(x => x.Id == conversationId);
        if (conversationToUpdate is not null)
        {
            conversationToUpdate.LastMessageAt = DateTime.UtcNow;
        }

        var sender = await _db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == senderId);
        foreach (var otherParticipantId in participants.Where(x => x != senderId))
        {
            _db.Set<Notification>().Add(new Notification
            {
                UserId = otherParticipantId,
                ActorId = senderId,
                MessageId = message.Id,
                Type = NotificationType.Message,
                Content = $"New message from {(sender?.DisplayName ?? sender?.Email ?? "a collaborator")}",
                IsRead = false,
                Metadata = BuildJsonDocument(new { link = "/messages" })
            });
        }

        await _db.SaveChangesAsync();
        return Ok(new { message_id = message.Id, conversation_id = conversationId });
    }

    [HttpPost("site-crawler")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> SiteCrawler([FromBody] SiteCrawlerCompatRequest request, CancellationToken ct)
    {
        var summary = await _siteCrawlerService.GetSummaryAsync(request.CountryCode, request.UserCategory, ct);
        var overview = await _siteCrawlerService.GetOverviewAsync(request.CountryCode, ct);
        return Ok(new { summary, overview });
    }

    [HttpPost("social-cross-posts")]
    [Authorize]
    public async Task<IActionResult> SocialCrossPosts([FromBody] SocialCrossPostsRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Content))
        {
            return BadRequest(new { error = "content is required" });
        }

        // Resolve per-user social destinations from UserStore as defaults when not supplied by client.
        var userStore = _serviceProvider.GetRequiredService<UserStore>();
        var userId = ResolveUserId();
        SocialFeedSettings? userFeeds = null;
        if (userId != Guid.Empty && userStore.TryGetById(userId.ToString(), out var userRecord) && userRecord is not null)
        {
            userFeeds = userRecord.SocialFeeds;
        }

        var resolvedFbPageId = !string.IsNullOrWhiteSpace(request.FacebookPageId)
            ? request.FacebookPageId
            : (!string.IsNullOrWhiteSpace(userFeeds?.Facebook?.DestinationId) ? userFeeds.Facebook.DestinationId : null);

        var resolvedFbPageToken = !string.IsNullOrWhiteSpace(userFeeds?.Facebook?.DestinationToken)
            ? userFeeds.Facebook.DestinationToken
            : null;

        var resolvedTikTokUsername = !string.IsNullOrWhiteSpace(request.TikTokUsername)
            ? request.TikTokUsername
            : (!string.IsNullOrWhiteSpace(userFeeds?.TikTok?.DestinationId) ? userFeeds.TikTok.DestinationId
               : (!string.IsNullOrWhiteSpace(userFeeds?.TikTok?.Username) ? userFeeds.TikTok.Username : null));

        var resolvedYtChannelId = !string.IsNullOrWhiteSpace(request.YouTubeChannelId)
            ? request.YouTubeChannelId
            : (!string.IsNullOrWhiteSpace(userFeeds?.YouTube?.DestinationId) ? userFeeds.YouTube.DestinationId
               : (!string.IsNullOrWhiteSpace(userFeeds?.YouTube?.Username) ? userFeeds.YouTube.Username : null));

        var publishRequest = new PublishSocialContentRequest
        {
            Message = request.Content.Trim(),
            VideoUrl = request.InstagramMediaType?.Equals("video", StringComparison.OrdinalIgnoreCase) == true
                ? request.InstagramMediaUrl
                : null,
            PhotoUrl = request.InstagramMediaType?.Equals("video", StringComparison.OrdinalIgnoreCase) == true
                ? null
                : request.InstagramMediaUrl,
            MediaType = request.InstagramMediaType?.Equals("video", StringComparison.OrdinalIgnoreCase) == true
                ? SocialMediaType.Video
                : SocialMediaType.Photo,
            PublishToFacebook = !string.IsNullOrWhiteSpace(resolvedFbPageId),
            PublishToInstagram = !string.IsNullOrWhiteSpace(request.InstagramMediaUrl),
            PublishToTikTok = request.PublishToTikTok,
            PublishToYouTube = request.PublishToYouTube,
            PublishToWiseRavenStream = false,
            PublishToBluesky = false,
            FacebookPageId = resolvedFbPageId,
            FacebookPageAccessToken = resolvedFbPageToken,
            TikTokUsername = resolvedTikTokUsername,
            YouTubeChannelId = resolvedYtChannelId
        };

        var requestedPlatforms = ResolveRequestedPlatforms(publishRequest);
        if (!request.Queue)
        {
            var result = await _socialPlatformService.PublishAsync(ResolveUserId(), publishRequest);
            var response = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
            foreach (var item in result.Results)
            {
                response[item.Platform] = item.Success
                    ? new { success = true, post_id = item.ExternalPostId, url = item.ExternalPostUrl }
                    : new { error = item.Error ?? "failed" };
            }

            return Ok(response);
        }

        var queued = _socialPublishQueue.Enqueue(ResolveUserId(), publishRequest, requestedPlatforms);
        return Ok(new
        {
            job_id = queued.JobId,
            queued = true,
            state = "queued",
            platforms = requestedPlatforms,
            results = queued.Results
        });
    }

    [HttpPost("social-cross-post-status")]
    [Authorize]
    public IActionResult SocialCrossPostStatus([FromBody] SocialCrossPostStatusRequest request)
    {
        if (request.JobId == Guid.Empty)
        {
            return BadRequest(new { error = "job_id is required" });
        }

        var snapshot = _socialPublishQueue.Get(request.JobId, ResolveUserId());
        if (snapshot is null)
        {
            return NotFound(new { error = "job not found" });
        }

        return Ok(new
        {
            job_id = snapshot.JobId,
            state = snapshot.State.ToString().ToLowerInvariant(),
            results = snapshot.Results,
            error = snapshot.Error,
            created_utc = snapshot.CreatedUtc,
            completed_utc = snapshot.CompletedUtc
        });
    }

    [HttpPost("social-get-accounts")]
    [Authorize]
    public async Task<IActionResult> SicialGetAccounts()
    {
        var statuses = await _socialPlatformService.GetProviderStatusesAsync();
        var facebookStatus = statuses.FirstOrDefault(x => x.Platform.Equals("facebook", StringComparison.OrdinalIgnoreCase));
        var instagramStatus = statuses.FirstOrDefault(x => x.Platform.Equals("instagram", StringComparison.OrdinalIgnoreCase));
        var tiktokStatus = statuses.FirstOrDefault(x => x.Platform.Equals("tiktok", StringComparison.OrdinalIgnoreCase));
        var youtubeStatus = statuses.FirstOrDefault(x => x.Platform.Equals("youtube", StringComparison.OrdinalIgnoreCase));

        // Load per-user social connections from UserStore (populated at OAuth connect time).
        var userStore = _serviceProvider.GetRequiredService<UserStore>();
        var userId = ResolveUserId();
        SocialFeedSettings? userFeeds = null;
        if (userId != Guid.Empty && userStore.TryGetById(userId.ToString(), out var userRecord) && userRecord is not null)
        {
            userFeeds = userRecord.SocialFeeds;
        }

        var userFb = userFeeds?.Facebook;
        var userIg = userFeeds?.Instagram;
        var userTt = userFeeds?.TikTok;
        var userYt = userFeeds?.YouTube;

        // Build per-user Facebook page list. Use stored page from OAuth if available; fall back to config-level pages.
        var facebookPages = new List<object>();
        string? selectedFbPageId = null;
        if (!string.IsNullOrWhiteSpace(userFb?.DestinationId))
        {
            facebookPages.Add(new { id = userFb.DestinationId, name = string.IsNullOrWhiteSpace(userFb.DestinationName) ? "My Facebook Page" : userFb.DestinationName });
            selectedFbPageId = userFb.DestinationId;
        }
        else
        {
            var configPages = ResolveFacebookPagesFromConfiguration();
            facebookPages.AddRange(configPages.Select(page => (object)new { id = page.Id, name = page.Name }));
            selectedFbPageId = configPages.FirstOrDefault(page => page.IsDefault)?.Id ?? configPages.FirstOrDefault()?.Id;
        }

        // TikTok: prefer stored display username over open_id.
        var tiktokAccounts = new List<object>();
        string? selectedTikTokUsername = null;
        if (!string.IsNullOrWhiteSpace(userTt?.DestinationId))
        {
            tiktokAccounts.Add(new { username = userTt.DestinationId, label = string.IsNullOrWhiteSpace(userTt.DestinationName) ? userTt.DestinationId : userTt.DestinationName });
            selectedTikTokUsername = userTt.DestinationId;
        }
        else if (!string.IsNullOrWhiteSpace(userTt?.Username))
        {
            tiktokAccounts.Add(new { username = userTt.Username, label = userTt.Username });
            selectedTikTokUsername = userTt.Username;
        }
        else
        {
            var configAccounts = ResolveTikTokAccountsFromConfiguration();
            tiktokAccounts.AddRange(configAccounts.Select(a => (object)new { username = a.Username, label = a.Label }));
            selectedTikTokUsername = configAccounts.FirstOrDefault(a => a.IsDefault)?.Username ?? configAccounts.FirstOrDefault()?.Username;
        }

        // YouTube: DestinationId = UC-prefixed channel ID from OAuth.
        var youtubeChannels = new List<object>();
        string? selectedYtChannelId = null;
        if (!string.IsNullOrWhiteSpace(userYt?.DestinationId))
        {
            youtubeChannels.Add(new { id = userYt.DestinationId, name = string.IsNullOrWhiteSpace(userYt.DestinationName) ? "My YouTube Channel" : userYt.DestinationName });
            selectedYtChannelId = userYt.DestinationId;
        }
        else if (!string.IsNullOrWhiteSpace(userYt?.Username))
        {
            youtubeChannels.Add(new { id = userYt.Username, name = userYt.Username });
            selectedYtChannelId = userYt.Username;
        }
        else
        {
            var configChannels = ResolveYouTubeChannelsFromConfiguration();
            youtubeChannels.AddRange(configChannels.Select(c => (object)new { id = c.Id, name = c.Name }));
            selectedYtChannelId = configChannels.FirstOrDefault(c => c.IsDefault)?.Id ?? configChannels.FirstOrDefault()?.Id;
        }

        return Ok(new
        {
            facebook = new
            {
                connected = userFb?.Enabled == true || facebookStatus?.PublishConfigured == true,
                pages = facebookPages,
                selectedPageId = selectedFbPageId,
                status = facebookStatus
            },
            instagram = new
            {
                connected = userIg?.Enabled == true || instagramStatus?.PublishConfigured == true,
                status = instagramStatus
            },
            tiktok = new
            {
                connected = userTt?.Enabled == true || tiktokStatus?.PublishConfigured == true,
                accounts = tiktokAccounts,
                selectedUsername = selectedTikTokUsername,
                status = tiktokStatus
            },
            youtube = new
            {
                connected = userYt?.Enabled == true || youtubeStatus?.PublishConfigured == true,
                channels = youtubeChannels,
                selectedChannelId = selectedYtChannelId,
                status = youtubeStatus
            },
            providers = statuses
        });
    }

    [HttpPost("social-import")]
    [Authorize]
    public async Task<IActionResult> SocialImport([FromBody] SocialImportRequest request)
    {
        var userId = ResolveUserId();

        if (string.Equals(request.Action, "import", StringComparison.OrdinalIgnoreCase))
        {
            // Ensure the user exists in the EF Users table before creating Posts with a FK reference.
            // CreatePost via PostController auto-provisions, but FunctionCompat must do it too.
            var efUser = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId);
            if (efUser == null)
            {
                var email = User.FindFirstValue(ClaimTypes.Email) ?? User.FindFirstValue("email") ?? $"local-{userId:N}@local";
                var rawName = User.FindFirstValue(ClaimTypes.Name) ?? email.Split('@')[0];
                var safeName = new string(rawName.Where(char.IsLetterOrDigit).ToArray()).ToLowerInvariant();
                if (string.IsNullOrWhiteSpace(safeName)) safeName = $"user{userId:N[..6]}";
                efUser = new Wiseravenshare.Server.Entities.User
                {
                    Id = userId,
                    Email = email,
                    Username = safeName,
                    DisplayName = rawName,
                    PasswordHash = string.Empty,
                    IsActive = true,
                    TruthScore = 50.00m
                };
                _db.Users.Add(efUser);
                try { await _db.SaveChangesAsync(); }
                catch (Exception ex) { _logger.LogWarning(ex, "User auto-provision during social import failed for {UserId}; continuing.", userId); }
            }

            var created = new List<object>();
            foreach (var item in request.Items ?? [])
            {
                var post = new Wiseravenshare.Server.Entities.Post
                {
                    UserId = userId,
                    Content = string.IsNullOrWhiteSpace(item.Content) ? "(imported post)" : item.Content,
                    Type = ParsePostType(item.PostType),
                    MediaUrls = item.MediaUris,
                    TruthScore = null
                };
                _db.Posts.Add(post);
                created.Add(new { id = post.Id });
            }
            await _db.SaveChangesAsync();
            return Ok(new { imported = created.Count, posts = created });
        }

        // FETCH action: use the current user's stored social-account credentials first,
        // then fall back to server-level config accounts.
        var userStore = _serviceProvider.GetRequiredService<UserStore>();
        userStore.TryGetById(userId.ToString("N"), out var userRecord);
        var socialFeeds = userRecord?.SocialFeeds ?? new SocialFeedSettings();
        const int importLimit = 10;

        // ── Facebook ─────────────────────────────────────────────────────────
        IReadOnlyList<SocialFeedItemDto> facebookItems;
        if (socialFeeds.Facebook.Enabled && !string.IsNullOrWhiteSpace(socialFeeds.Facebook.AccessToken))
            facebookItems = await FetchFacebookUserPostsAsync(socialFeeds.Facebook.AccessToken, importLimit);
        else
            facebookItems = await _socialPlatformService.GetFacebookFeedAsync(null, importLimit);

        // ── Instagram ─────────────────────────────────────────────────────────
        IReadOnlyList<SocialFeedItemDto> instagramItems = Array.Empty<SocialFeedItemDto>();
        if (socialFeeds.Instagram.Enabled && !string.IsNullOrWhiteSpace(socialFeeds.Instagram.AccessToken))
            instagramItems = await FetchInstagramUserPostsAsync(socialFeeds.Instagram.AccessToken, importLimit);

        // ── TikTok ────────────────────────────────────────────────────────────
        IReadOnlyList<SocialFeedItemDto> tiktokItems;
        if (socialFeeds.TikTok.Enabled && !string.IsNullOrWhiteSpace(socialFeeds.TikTok.AccessToken))
        {
            var tikTokSvc = _serviceProvider.GetService<ITikTokAggregatorService>();
            if (tikTokSvc != null)
            {
                var catalog = await tikTokSvc.GetVideoCatalogAsync(socialFeeds.TikTok.AccessToken, 0, importLimit);
                var ttItems = new List<SocialFeedItemDto>();
                foreach (var video in catalog?.Videos ?? [])
                {
                    ttItems.Add(new SocialFeedItemDto
                    {
                        Platform = "tiktok",
                        ExternalId = video.Id,
                        Text = video.VideoDescription ?? video.Title ?? string.Empty,
                        MediaUrl = video.CoverImageUrl,
                        PermalinkUrl = video.ShareUrl ?? video.EmbedLink,
                        AuthorHandle = socialFeeds.TikTok.Username ?? "you",
                        CreatedAt = video.CreateTime > 0 ? DateTimeOffset.FromUnixTimeSeconds(video.CreateTime) : null
                    });
                }
                tiktokItems = ttItems;
            }
            else tiktokItems = await _socialPlatformService.GetTikTokFeedAsync(null, importLimit);
        }
        else
            tiktokItems = await _socialPlatformService.GetTikTokFeedAsync(null, importLimit);

        // ── Bluesky ───────────────────────────────────────────────────────────
        var bskyHandle = (socialFeeds.Bluesky.Enabled && !string.IsNullOrWhiteSpace(socialFeeds.Bluesky.Username))
            ? socialFeeds.Bluesky.Username
            : null;
        var blueskyItems = await _socialPlatformService.GetBlueskyFeedAsync(bskyHandle, importLimit);

        return Ok(new
        {
            facebook = facebookItems,
            instagram = instagramItems,
            tiktok = tiktokItems,
            bluesky = blueskyItems,
        });
    }

    private async Task<IReadOnlyList<SocialFeedItemDto>> FetchFacebookUserPostsAsync(string accessToken, int limit)
    {
        const string graphBase = "https://graph.facebook.com/v26.0";
        var fields = Uri.EscapeDataString("id,message,created_time,permalink_url,full_picture");
        var url = $"{graphBase}/me/posts?fields={fields}&limit={Math.Clamp(limit, 1, 25)}&access_token={Uri.EscapeDataString(accessToken)}";
        try
        {
            var httpFactory = _serviceProvider.GetRequiredService<IHttpClientFactory>();
            using var client = httpFactory.CreateClient();
            using var response = await client.GetAsync(url);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Facebook user import request failed ({Status})", (int)response.StatusCode);
                return [];
            }
            var json = await response.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(json);
            if (!doc.RootElement.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Array)
                return [];
            var items = new List<SocialFeedItemDto>();
            foreach (var entry in data.EnumerateArray())
            {
                DateTimeOffset? createdAt = null;
                if (entry.TryGetProperty("created_time", out var ct) && ct.ValueKind == JsonValueKind.String)
                    DateTimeOffset.TryParse(ct.GetString(), out var dtParsed);
                items.Add(new SocialFeedItemDto
                {
                    Platform = "facebook",
                    ExternalId = entry.TryGetProperty("id", out var id) ? id.GetString() ?? string.Empty : string.Empty,
                    Text = entry.TryGetProperty("message", out var msg) ? msg.GetString() : null,
                    MediaUrl = entry.TryGetProperty("full_picture", out var pic) ? pic.GetString() : null,
                    PermalinkUrl = entry.TryGetProperty("permalink_url", out var link) ? link.GetString() : null,
                    AuthorHandle = "me",
                    CreatedAt = createdAt
                });
            }
            return items;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Facebook user post import failed.");
            return [];
        }
    }

    private async Task<IReadOnlyList<SocialFeedItemDto>> FetchInstagramUserPostsAsync(string accessToken, int limit)
    {
        const string graphBase = "https://graph.instagram.com/v26.0";
        var fields = Uri.EscapeDataString("id,caption,media_type,media_url,permalink,timestamp");
        var url = $"{graphBase}/me/media?fields={fields}&limit={Math.Clamp(limit, 1, 25)}&access_token={Uri.EscapeDataString(accessToken)}";
        try
        {
            var httpFactory = _serviceProvider.GetRequiredService<IHttpClientFactory>();
            using var client = httpFactory.CreateClient();
            using var response = await client.GetAsync(url);
            if (!response.IsSuccessStatusCode) return [];
            var json = await response.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(json);
            if (!doc.RootElement.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Array)
                return [];
            var items = new List<SocialFeedItemDto>();
            foreach (var entry in data.EnumerateArray())
            {
                DateTimeOffset? createdAt = null;
                if (entry.TryGetProperty("timestamp", out var ts) && ts.ValueKind == JsonValueKind.String)
                    DateTimeOffset.TryParse(ts.GetString(), out var dtParsed);
                items.Add(new SocialFeedItemDto
                {
                    Platform = "instagram",
                    ExternalId = entry.TryGetProperty("id", out var id) ? id.GetString() ?? string.Empty : string.Empty,
                    Text = entry.TryGetProperty("caption", out var cap) ? cap.GetString() : null,
                    MediaUrl = entry.TryGetProperty("media_url", out var mu) ? mu.GetString() : null,
                    PermalinkUrl = entry.TryGetProperty("permalink", out var pl) ? pl.GetString() : null,
                    AuthorHandle = "me",
                    CreatedAt = createdAt
                });
            }
            return items;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Instagram user post import failed.");
            return [];
        }
    }

    [HttpPost("spaces-upload")]
    [Authorize]
    public IActionResult SpacesUpload([FromBody] SpacesUploadRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Filename))
        {
            return BadRequest(new { error = "filename is required" });
        }

        if (request.FileSize <= 0)
        {
            return BadRequest(new { error = "fileSize (bytes) is required" });
        }

        var appBase = GetAppBaseUrl();
        var uploadEndpoint = $"{appBase}/api/media/upload";
        return Ok(new
        {
            uploadUrl = uploadEndpoint,
            uploadEndpoint,
            method = "POST multipart/form-data",
            notes = "Native uploads are handled by /api/media/upload (authenticated multipart upload)."
        });
    }

    [HttpPost("stamp-music-analysis")]
    [Authorize]
    public async Task<IActionResult> StampMusicAnalysis([FromBody] StampMusicAnalysisRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.TrackTitle) || request.Bpm <= 0 || string.IsNullOrWhiteSpace(request.Fingerprint))
        {
            return BadRequest(new { error = "track_title, bpm, and fingerprint are required" });
        }

        var analysis = new SavedMedia
        {
            UserId = ResolveUserId(),
            Title = request.TrackTitle.Trim(),
            Description = request.Description?.Trim(),
            MediaType = MediaLibraryType.Music,
            MediaUrl = string.IsNullOrWhiteSpace(request.MediaUrl) ? $"fingerprint://{request.Fingerprint}" : request.MediaUrl.Trim(),
            Tags = request.Tags,
            MediaMetadata = BuildJsonDocument(new
            {
                bpm = request.Bpm,
                key = request.Key,
                fingerprint = request.Fingerprint,
                stamped_at = DateTime.UtcNow
            }),
            IsVisibleInFeed = false,
            IsPublished = false
        };

        _db.SavedMediaItems.Add(analysis);
        await _db.SaveChangesAsync();

        return Ok(new
        {
            analysis_id = analysis.Id,
            status = "stamped",
            fingerprint = request.Fingerprint
        });
    }

    [HttpPost("stripe-webhook-podcast")]
    [AllowAnonymous]
    public async Task<IActionResult> StripeWebhookPodcast()
    {
        using var reader = new StreamReader(HttpContext.Request.Body);
        var payload = await reader.ReadToEndAsync();
        var signature = Request.Headers["Stripe-Signature"].ToString();
        if (string.IsNullOrWhiteSpace(signature))
        {
            return BadRequest(new { error = "Missing signature" });
        }

        await _subscriptionService.HandleWebhookAsync(payload, signature);
        return Ok(new { received = true });
    }

    [HttpPost("sync-do-postgres")]
    [Authorize(Roles = "Admin")]
    public IActionResult SyncDoPostgres()
    {
        return StatusCode(StatusCodes.Status501NotImplemented, new
        {
            error = "Legacy Base44 PostgreSQL sync is not available in native runtime.",
            alternative = "Use EF migrations and native repositories for synchronization."
        });
    }

    [HttpPost("sync-to-postgres")]
    [Authorize(Roles = "Admin")]
    public IActionResult SyncToPostgres()
    {
        return StatusCode(StatusCodes.Status501NotImplemented, new
        {
            error = "Legacy Base44 proxy sync is not available in native runtime.",
            alternative = "Use EF migrations and direct PostgreSQL access."
        });
    }

    [HttpPost("track-podcast-view")]
    [Authorize]
    public async Task<IActionResult> TrackPodcastView([FromBody] TrackPodcastViewRequest request)
    {
        if (request.PodcastId == Guid.Empty)
        {
            return BadRequest(new { error = "podcast_id is required" });
        }

        var episode = await _db.Set<RadioStationEpisode>().FirstOrDefaultAsync(x => x.Id == request.PodcastId);
        if (episode is null)
        {
            return NotFound(new { error = "Podcast not found" });
        }

        var station = await _db.Set<CreatorRadioStation>().AsNoTracking().FirstOrDefaultAsync(x => x.Id == episode.StationId);
        if (station?.CreatorId == ResolveUserId())
        {
            return Ok(new { success = true, skipped = true });
        }

        episode.ListenCount += 1;
        await _db.SaveChangesAsync();
        return Ok(new { success = true });
    }

    [HttpPost("notify-upcoming-jams")]
    [AllowAnonymous]
    public IActionResult NotifyUpcomingJams([FromBody] WorkflowSecretRequest request)
    {
        if (!IsWorkflowAuthorized(request.Secret))
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { error = "Unauthorized" });
        }

        return Ok(new
        {
            ok = true,
            checked_sessions = 0,
            sessions_notified = 0,
            emails_sent = 0,
            note = "JamSession data model is not present in the native backend."
        });
    }

    [HttpPost("process-invitation-reward")]
    [AllowAnonymous]
    public async Task<IActionResult> ProcessInvitationReward([FromBody] ProcessInvitationRewardRequest request)
    {
        if (!IsWorkflowAuthorized(request.Secret))
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { error = "Unauthorized" });
        }

        if (string.IsNullOrWhiteSpace(request.Email))
        {
            return Ok(new { processed = 0 });
        }

        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Email == request.Email);
        if (user is null)
        {
            return Ok(new { processed = 0, email = request.Email });
        }

        return Ok(new
        {
            processed = 0,
            email = request.Email,
            note = "Legacy Invitation reward table is not present; use GrowthService referral codes."
        });
    }

    [HttpPost("request-admin-access")]
    [Authorize]
    public async Task<IActionResult> RequestAdminAccess([FromBody] RequestAdminAccessRequest request)
    {
        if (!string.IsNullOrWhiteSpace(request.Website))
        {
            return Ok(new { success = true });
        }

        if (string.IsNullOrWhiteSpace(request.UserId) || !request.UserId.StartsWith("admin", StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest(new { error = "User ID must be prefixed with \"admin\" (e.g. admin-arnold)" });
        }

        var user = await ResolveCurrentUserAsync();
        var configuredAdminEmails = AuthAccessPolicy.ResolveConfiguredAdminEmails(_configuration);
        var adminIds = await _db.Users.AsNoTracking()
            .Where(x => configuredAdminEmails.Contains(x.Email) || x.Role == UserRole.Admin)
            .Select(x => x.Id)
            .Distinct()
            .ToListAsync();

        foreach (var adminId in adminIds.Where(id => id != user.Id))
        {
            _db.Set<Notification>().Add(new Notification
            {
                UserId = adminId,
                ActorId = user.Id,
                Type = NotificationType.SystemAlert,
                Content = $"Admin access request from {user.Email} ({request.UserId})",
                IsRead = false,
                Metadata = BuildJsonDocument(new
                {
                    requester_name = request.Name,
                    reason = request.Reason,
                    link = "/admin"
                })
            });
        }
        await _db.SaveChangesAsync();

        return Ok(new { success = true });
    }

    [HttpPost("resolve-content-alert")]
    [AllowAnonymous]
    public async Task<IActionResult> ResolveContentAlert([FromBody] ResolveContentAlertRequest request)
    {
        if (!IsWorkflowAuthorized(request.Secret))
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { error = "Unauthorized" });
        }

        var resolvedPostId = request.AlertType?.Equals("challenge", StringComparison.OrdinalIgnoreCase) == true
            ? request.PostId
            : request.TargetId;
        if (!resolvedPostId.HasValue || resolvedPostId.Value == Guid.Empty)
        {
            return Ok(new { recipient_email = (string?)null });
        }

        var post = await _db.Posts.AsNoTracking().FirstOrDefaultAsync(x => x.Id == resolvedPostId.Value);
        if (post is null)
        {
            return Ok(new { recipient_email = (string?)null });
        }

        var creator = await _db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == post.UserId);
        if (creator is null || string.IsNullOrWhiteSpace(creator.Email))
        {
            return Ok(new { recipient_email = (string?)null });
        }

        return Ok(new
        {
            recipient_email = creator.Email,
            creator_name = string.IsNullOrWhiteSpace(creator.DisplayName) ? creator.Email : creator.DisplayName,
            post_snippet = (post.Content ?? string.Empty).Length > 160 ? post.Content[..160] : post.Content,
            score = request.Score,
            reason = request.Reason ?? string.Empty,
            evidence = request.Evidence ?? "Not provided",
            post_url = $"{GetAppBaseUrl()}/social"
        });
    }

    private async Task<object> RunPromptAsync(string systemPrompt, FunctionPromptRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Prompt))
        {
            return new { error = "Prompt is required." };
        }

        var response = await _chatService.ChatAsync(new AiChatRequest
        {
            Message = $"{systemPrompt}\n\nUser prompt:\n{request.Prompt}",
            Model = request.Model,
            UseCrawlerContext = true
        });

        if (!response.Success)
        {
            _logger.LogWarning("Function prompt generation failed: {Error}", response.Error);
            return new { error = response.Error ?? "AI generation failed." };
        }

        return new
        {
            reply = response.Reply,
            model = response.Model
        };
    }

    private static string BuildFallbackJournalismReport(string prompt)
    {
        var who = ReadJournalismField(prompt, "Who");
        var what = ReadJournalismField(prompt, "What");
        var where = ReadJournalismField(prompt, "Where");
        var when = ReadJournalismField(prompt, "When");
        var why = ReadJournalismField(prompt, "Why");
        var how = ReadJournalismField(prompt, "How");

        var headline = !string.IsNullOrWhiteSpace(what)
            ? $"Report: {TrimSentence(what, 90)}"
            : "Community Incident Report";

        var lede = $"A developing report describes {DefaultIfEmpty(what, "an event")} involving {DefaultIfEmpty(who, "local participants")} in {DefaultIfEmpty(where, "an unspecified location")}.";
        var timeline = $"The reported timeframe is {DefaultIfEmpty(when, "not yet confirmed")}, and the current explanation points to {DefaultIfEmpty(why, "causes still under review")}.";
        var process = $"Initial account of how events unfolded: {DefaultIfEmpty(how, "details are still being gathered from witnesses and evidence")}.";

        return string.Join("\n\n", new[]
        {
            headline,
            "Lede\n" + lede,
            "Background\n" + timeline,
            "Evidence & Verification\n" +
            "- Cross-check names, times, and locations against independent records.\n" +
            "- Confirm uploaded media metadata (timestamp, source, geolocation where available).\n" +
            "- Seek at least one additional witness or official source before final publication.",
            "Counterpoints\n" +
            "- Include statements from any directly affected parties.\n" +
            "- Distinguish verified facts from unverified claims.",
            "Next Steps\n" +
            process + "\n" +
            "- Update this report as new verified facts are obtained."
        });
    }

    private static string ReadJournalismField(string prompt, string fieldName)
    {
        if (string.IsNullOrWhiteSpace(prompt))
        {
            return string.Empty;
        }

        var prefix = fieldName + ":";
        foreach (var line in prompt.Split('\n'))
        {
            var trimmed = (line ?? string.Empty).Trim();
            if (!trimmed.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            return trimmed[prefix.Length..].Trim();
        }

        return string.Empty;
    }

    private static string DefaultIfEmpty(string value, string fallback)
        => string.IsNullOrWhiteSpace(value) ? fallback : value.Trim();

    private static string TrimSentence(string input, int maxLength)
    {
        var text = (input ?? string.Empty).Trim();
        if (text.Length <= maxLength)
        {
            return text;
        }

        return text[..Math.Max(0, maxLength)].TrimEnd().TrimEnd('.', ',', ';', ':') + "…";
    }

    private async Task<object> BuildLocalAnalyticsAsync(int days, bool includeTopContent)
    {
        var safeDays = Math.Clamp(days <= 0 ? 30 : days, 1, 365);
        var cutoff = DateTime.UtcNow.AddDays(-safeDays);

        var dailyActiveUsers = await _db.Posts.AsNoTracking()
            .Where(x => x.CreatedAt >= cutoff)
            .Select(x => x.UserId)
            .Union(_db.MediaComments.AsNoTracking().Where(x => x.CreatedAt >= cutoff).Select(x => x.UserId))
            .Union(_db.PostLikes.AsNoTracking().Where(x => x.CreatedAt >= cutoff).Select(x => x.UserId))
            .Distinct()
            .CountAsync();

        var truthAggregate = await _db.Posts.AsNoTracking()
            .Where(x => x.TruthScore != null)
            .GroupBy(_ => 1)
            .Select(g => new
            {
                AvgTruth = g.Average(x => x.TruthScore) ?? 0m,
                TotalPosts = g.Count()
            })
            .FirstOrDefaultAsync();

        var totalLikes = await _db.PostLikes.AsNoTracking().CountAsync();
        var totalComments = await _db.MediaComments.AsNoTracking().CountAsync();
        var totalReposts = await _db.PostReposts.AsNoTracking().CountAsync();

        var response = new Dictionary<string, object?>
        {
            ["dailyActiveUsers"] = dailyActiveUsers,
            ["truthScoreAverage"] = truthAggregate is null ? null : Math.Round((double)truthAggregate.AvgTruth, 2),
            ["totalPublishedPosts"] = truthAggregate?.TotalPosts ?? 0,
            ["totalLikes"] = totalLikes,
            ["totalComments"] = totalComments,
            ["totalShares"] = totalReposts,
            ["totalChallenges"] = 0,
            ["totalLikeRecords"] = totalLikes,
            ["totalInteractions"] = totalLikes + totalComments + totalReposts,
            ["errors"] = Array.Empty<string>(),
            ["mode"] = "local-db",
            ["rangeDays"] = safeDays
        };

        if (includeTopContent)
        {
            response["properties"] = new[]
            {
                new { id = "local-app", displayName = "WiseRavenShare Local Analytics", propertyId = "local-app", parentAccount = "wiseravenshare" }
            };
            response["topPages"] = await _db.Posts.AsNoTracking()
                .Where(x => x.CreatedAt >= cutoff)
                .OrderByDescending(x => x.ViewsCount)
                .Take(20)
                .Select(x => new
                {
                    path = $"/posts/{x.Id}",
                    title = x.Content.Length > 80 ? x.Content.Substring(0, 80) : x.Content,
                    pageViews = x.ViewsCount,
                    sessions = x.CommentsCount,
                    users = 1
                })
                .ToListAsync();
        }

        return response;
    }

    private static int ClampLimit(int limit) => Math.Clamp(limit <= 0 ? 50 : limit, 1, 200);

    private async Task<(string hash, string method)> ComputeFingerprintAsync(string? uri)
    {
        if (string.IsNullOrWhiteSpace(uri))
        {
            return ("", "metadata-only");
        }

        try
        {
            if (!Uri.TryCreate(uri, UriKind.Absolute, out var parsed) || parsed.Scheme is not ("http" or "https"))
            {
                return (Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(uri))).ToLowerInvariant(), "uri-sha256");
            }

            using var client = new HttpClient();
            using var response = await client.GetAsync(uri, HttpCompletionOption.ResponseHeadersRead);
            if (!response.IsSuccessStatusCode || response.Content.Headers.ContentLength is > 10_000_000)
            {
                return (Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(uri))).ToLowerInvariant(), "uri-sha256");
            }

            await using var stream = await response.Content.ReadAsStreamAsync();
            using var memory = new MemoryStream();
            await stream.CopyToAsync(memory);
            var hash = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(memory.ToArray())).ToLowerInvariant();
            return (hash, "content-sha256");
        }
        catch
        {
            return (Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(uri))).ToLowerInvariant(), "uri-sha256");
        }
    }

    private static (string name, string url) ResolveAuthority(string? state)
    {
        var normalized = (state ?? string.Empty).Trim().ToUpperInvariant();
        return normalized switch
        {
            "CA" => ("California Arts Council", "https://arts.ca.gov"),
            "NY" => ("New York State Council on the Arts", "https://arts.ny.gov"),
            "TX" => ("Texas Commission on the Arts", "https://www.txarts.org"),
            _ => ("U.S. Copyright Office", "https://www.copyright.gov")
        };
    }

    private async Task<string?> ResolveInviteeEmailAsync(string identifier)
    {
        var cleaned = identifier.Trim();
        if (cleaned.Contains('@') && cleaned.Contains('.'))
        {
            return cleaned.ToLowerInvariant();
        }

        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(x =>
            x.Email == cleaned
            || x.Username == cleaned
            || x.DisplayName == cleaned);

        return user?.Email;
    }

    private async Task<(Guid Id, string Email, string DisplayName)> ResolveCurrentUserAsync()
    {
        var userId = ResolveUserId();
        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == userId);
        return user is null
            ? (userId, "unknown@example.com", "Unknown User")
            : (user.Id, user.Email, string.IsNullOrWhiteSpace(user.DisplayName) ? user.Email : user.DisplayName);
    }

    private string GetAppBaseUrl()
    {
        var appUrl = Request.Headers["X-Base44-App-Url"].ToString();
        if (Uri.TryCreate(appUrl, UriKind.Absolute, out var uri))
        {
            return uri.GetLeftPart(UriPartial.Authority);
        }

        return $"{Request.Scheme}://{Request.Host}";
    }

    private static void ApplyMusicAnalysisAction(SavedMedia analysis, ManageMusicAnalysisRequest request)
    {
        switch (request.Action.Trim().ToLowerInvariant())
        {
            case "archive":
                analysis.IsVisibleInFeed = false;
                break;
            case "publish":
                analysis.IsPublished = true;
                analysis.IsVisibleInFeed = true;
                break;
            case "restore":
                analysis.IsVisibleInFeed = true;
                break;
            case "update":
                if (!string.IsNullOrWhiteSpace(request.Title))
                {
                    analysis.Title = request.Title.Trim();
                }
                if (!string.IsNullOrWhiteSpace(request.Description))
                {
                    analysis.Description = request.Description.Trim();
                }
                if (request.Tags is { Length: > 0 })
                {
                    analysis.Tags = request.Tags;
                }
                break;
            default:
                break;
        }
    }

    private NotificationType ParseNotificationType(string type)
    {
        if (Enum.TryParse<NotificationType>(type, true, out var parsed))
        {
            return parsed;
        }

        return type.Trim().ToLowerInvariant() switch
        {
            "dm" => NotificationType.Message,
            "truth" => NotificationType.TruthAlert,
            "system" => NotificationType.SystemAlert,
            _ => NotificationType.SystemAlert
        };
    }

    private PostType ParsePostType(string? postType)
    {
        if (Enum.TryParse<PostType>(postType, true, out var parsed))
        {
            return parsed;
        }

        return postType?.Trim().ToLowerInvariant() switch
        {
            "photo" => PostType.Image,
            "video" => PostType.Video,
            "music" => PostType.Audio,
            "podcast" => PostType.Podcast,
            _ => PostType.Text
        };
    }

    private static JsonDocument? BuildJsonDocument(object value)
    {
        try
        {
            return JsonDocument.Parse(JsonSerializer.Serialize(value));
        }
        catch
        {
            return null;
        }
    }

    private bool IsWorkflowAuthorized(string? providedSecret)
    {
        var workflowSecret = (_configuration["WORKFLOW_CALL_SECRET"] ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(workflowSecret))
        {
            return false;
        }

        return string.Equals(workflowSecret, providedSecret?.Trim(), StringComparison.Ordinal);
    }

    private static List<string> ResolveRequestedPlatforms(PublishSocialContentRequest request)
    {
        var platforms = new List<string>();
        if (request.PublishToFacebook) platforms.Add("facebook");
        if (request.PublishToInstagram) platforms.Add("instagram");
        if (request.PublishToTikTok) platforms.Add("tiktok");
        if (request.PublishToYouTube) platforms.Add("youtube");
        if (request.PublishToWiseRavenStream) platforms.Add("wiseravenstream");
        if (request.PublishToBluesky) platforms.Add("bluesky");
        return platforms;
    }

    private IReadOnlyList<ConfiguredFacebookPage> ResolveFacebookPagesFromConfiguration()
    {
        var pages = _configuration.GetSection("Social:Facebook:Pages")
            .GetChildren()
            .Select(section => new ConfiguredFacebookPage(
                Id: (section["Id"] ?? string.Empty).Trim(),
                Name: string.IsNullOrWhiteSpace(section["Name"]) ? "Facebook Page" : section["Name"]!.Trim(),
                IsDefault: bool.TryParse(section["IsDefault"], out var isDefault) && isDefault))
            .Where(page => !string.IsNullOrWhiteSpace(page.Id))
            .ToList();

        var singleId = (_configuration["Social:Facebook:PageId"] ?? string.Empty).Trim();
        if (!string.IsNullOrWhiteSpace(singleId) && pages.All(page => !page.Id.Equals(singleId, StringComparison.OrdinalIgnoreCase)))
        {
            pages.Insert(0, new ConfiguredFacebookPage(
                Id: singleId,
                Name: (_configuration["Social:Facebook:PageName"] ?? "Facebook Page").Trim(),
                IsDefault: true));
        }

        return pages;
    }

    private IReadOnlyList<ConfiguredTikTokAccount> ResolveTikTokAccountsFromConfiguration()
    {
        var accounts = _configuration.GetSection("Social:TikTok:Accounts")
            .GetChildren()
            .Select(section => new ConfiguredTikTokAccount(
                Username: (section["Username"] ?? string.Empty).Trim(),
                Label: string.IsNullOrWhiteSpace(section["Label"]) ? (section["Username"] ?? string.Empty).Trim() : section["Label"]!.Trim(),
                IsDefault: bool.TryParse(section["IsDefault"], out var isDefault) && isDefault))
            .Where(account => !string.IsNullOrWhiteSpace(account.Username))
            .ToList();

        var singleUsername = (_configuration["Social:TikTok:Username"] ?? string.Empty).Trim();
        if (!string.IsNullOrWhiteSpace(singleUsername)
            && accounts.All(account => !account.Username.Equals(singleUsername, StringComparison.OrdinalIgnoreCase)))
        {
            accounts.Insert(0, new ConfiguredTikTokAccount(singleUsername, singleUsername, true));
        }

        return accounts;
    }

    private IReadOnlyList<ConfiguredYouTubeChannel> ResolveYouTubeChannelsFromConfiguration()
    {
        var channels = _configuration.GetSection("YouTubeSync:Channels")
            .GetChildren()
            .Select(section => new ConfiguredYouTubeChannel(
                Id: (section["Id"] ?? string.Empty).Trim(),
                Name: string.IsNullOrWhiteSpace(section["Name"]) ? "YouTube Channel" : section["Name"]!.Trim(),
                IsDefault: bool.TryParse(section["IsDefault"], out var isDefault) && isDefault))
            .Where(channel => !string.IsNullOrWhiteSpace(channel.Id))
            .ToList();

        var singleChannelId = (_configuration["YouTubeSync:ChannelId"] ?? string.Empty).Trim();
        if (!string.IsNullOrWhiteSpace(singleChannelId)
            && channels.All(channel => !channel.Id.Equals(singleChannelId, StringComparison.OrdinalIgnoreCase)))
        {
            channels.Insert(0, new ConfiguredYouTubeChannel(singleChannelId, "YouTube Channel", true));
        }

        return channels;
    }

    private string? ResolveDropboxAccessToken()
    {
        return _configuration["Dropbox:AccessToken"]
            ?? _configuration["DROPBOX_ACCESS_TOKEN"]
            ?? _configuration["DropboxAccessToken"];
    }

    private HttpClient CreateDropboxClient(string accessToken)
    {
        var client = new HttpClient
        {
            BaseAddress = new Uri("https://api.dropboxapi.com/2/")
        };
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        return client;
    }

    private static string? ReadString(JsonElement payload, string propertyName)
    {
        return payload.TryGetProperty(propertyName, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;
    }

    private static MediaLibraryType InferMediaLibraryType(string? fileNameOrUrl, string? providedType = null)
    {
        var normalized = (providedType ?? string.Empty).Trim().ToLowerInvariant();
        if (normalized is "photo" or "image") return MediaLibraryType.Photo;
        if (normalized is "video") return MediaLibraryType.Video;
        if (normalized is "music" or "audio") return MediaLibraryType.Music;

        var extension = Path.GetExtension(fileNameOrUrl ?? string.Empty).Trim().ToLowerInvariant();
        return extension switch
        {
            ".jpg" or ".jpeg" or ".png" or ".gif" or ".webp" or ".bmp" or ".svg" => MediaLibraryType.Photo,
            ".mp4" or ".mov" or ".mkv" or ".webm" or ".avi" or ".m4v" => MediaLibraryType.Video,
            ".mp3" or ".wav" or ".flac" or ".aac" or ".ogg" or ".m4a" => MediaLibraryType.Music,
            _ => MediaLibraryType.Photo
        };
    }

    private static string NormalizeDropboxSharedUrl(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri))
        {
            return url;
        }

        var builder = new UriBuilder(uri);
        var host = builder.Host.ToLowerInvariant();
        if (host == "www.dropbox.com")
        {
            builder.Host = "dl.dropboxusercontent.com";
        }

        var query = System.Web.HttpUtility.ParseQueryString(builder.Query);
        query.Remove("dl");
        query.Remove("raw");
        query["raw"] = "1";
        builder.Query = query.ToString();
        return builder.Uri.ToString();
    }

    private async Task<IActionResult> ListDropboxFilesAsync(JsonElement payload, string accessToken, CancellationToken cancellationToken)
    {
        var folderId = ReadString(payload, "folderId") ?? ReadString(payload, "path") ?? string.Empty;
        var listPath = folderId.Trim();
        if (!string.IsNullOrWhiteSpace(listPath) && !listPath.StartsWith("/") && !listPath.StartsWith("id:", StringComparison.OrdinalIgnoreCase))
        {
            listPath = "/" + listPath.TrimStart('/');
        }

        using var client = CreateDropboxClient(accessToken);
        var body = new
        {
            path = listPath,
            recursive = false,
            include_media_info = true,
            include_deleted = false,
            include_has_explicit_shared_members = false
        };

        using var response = await client.PostAsJsonAsync("files/list_folder", body, cancellationToken);
        var raw = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            return StatusCode((int)response.StatusCode, new { message = "Dropbox list failed.", detail = raw });
        }

        using var json = JsonDocument.Parse(raw);
        var entries = json.RootElement.TryGetProperty("entries", out var entriesNode) && entriesNode.ValueKind == JsonValueKind.Array
            ? entriesNode.EnumerateArray()
            : Enumerable.Empty<JsonElement>();

        var files = entries.Select(entry =>
        {
            var tag = entry.TryGetProperty(".tag", out var tagNode) ? tagNode.GetString() : string.Empty;
            var name = entry.TryGetProperty("name", out var nameNode) ? nameNode.GetString() ?? "Untitled" : "Untitled";
            var pathLower = entry.TryGetProperty("path_lower", out var pl) ? pl.GetString() ?? string.Empty : string.Empty;
            var fallbackId = entry.TryGetProperty("id", out var idNode) ? idNode.GetString() ?? string.Empty : string.Empty;
            var id = !string.IsNullOrWhiteSpace(pathLower) ? pathLower : fallbackId;
            var isFolder = string.Equals(tag, "folder", StringComparison.OrdinalIgnoreCase);
            var mediaType = isFolder ? string.Empty : InferMediaLibraryType(name).ToString().ToLowerInvariant();

            return new
            {
                id,
                name,
                isFolder,
                path = id,
                size = entry.TryGetProperty("size", out var sizeNode) && sizeNode.ValueKind == JsonValueKind.Number ? sizeNode.GetInt64() : 0L,
                mediaType
            };
        }).ToList();

        return Ok(new
        {
            provider = "dropbox",
            connected = true,
            files,
            methods = new[]
            {
                "Browse folders and import files into WiseRavenShare.",
                "Paste a Dropbox shared URL and include it directly."
            }
        });
    }

    private async Task<IActionResult> ImportDropboxFileAsync(JsonElement payload, string accessToken, CancellationToken cancellationToken)
    {
        var userId = ResolveUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        var filePath = ReadString(payload, "filePath")
            ?? ReadString(payload, "path")
            ?? ReadString(payload, "fileId");
        var fileName = ReadString(payload, "fileName") ?? "Dropbox file";
        var title = ReadString(payload, "title") ?? Path.GetFileNameWithoutExtension(fileName) ?? "Dropbox import";

        if (string.IsNullOrWhiteSpace(filePath))
        {
            return BadRequest(new { message = "filePath/fileId is required for Dropbox import." });
        }

        using var client = CreateDropboxClient(accessToken);
        using var tempLinkResponse = await client.PostAsJsonAsync("files/get_temporary_link", new { path = filePath }, cancellationToken);
        var raw = await tempLinkResponse.Content.ReadAsStringAsync(cancellationToken);
        if (!tempLinkResponse.IsSuccessStatusCode)
        {
            return StatusCode((int)tempLinkResponse.StatusCode, new { message = "Dropbox temporary link request failed.", detail = raw });
        }

        using var tempLinkJson = JsonDocument.Parse(raw);
        var mediaUrl = tempLinkJson.RootElement.TryGetProperty("link", out var linkNode) ? linkNode.GetString() : null;
        if (string.IsNullOrWhiteSpace(mediaUrl))
        {
            return StatusCode(502, new { message = "Dropbox returned no temporary link." });
        }

        var mediaType = InferMediaLibraryType(fileName, ReadString(payload, "mediaType")).ToString().ToLowerInvariant();
        return Ok(await ImportExternalMediaAsync(
            userId,
            normalizedSourceUrl: mediaUrl,
            fileNameHint: fileName,
            titleHint: title,
            mediaTypeHint: mediaType,
            provider: "dropbox",
            includedVia: "import",
            cancellationToken));
    }

    private async Task<IActionResult> IncludeDropboxSharedLinkAsync(JsonElement payload, CancellationToken cancellationToken)
    {
        var userId = ResolveUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        var sharedUrl = ReadString(payload, "sharedUrl") ?? ReadString(payload, "url");
        if (string.IsNullOrWhiteSpace(sharedUrl))
        {
            return BadRequest(new { message = "sharedUrl is required for Dropbox include." });
        }

        var normalizedUrl = NormalizeDropboxSharedUrl(sharedUrl);
        var title = ReadString(payload, "title");
        var mediaType = InferMediaLibraryType(normalizedUrl, ReadString(payload, "mediaType")).ToString().ToLowerInvariant();
        var inferredTitle = "Dropbox media";
        if (Uri.TryCreate(normalizedUrl, UriKind.Absolute, out var parsedIncludedUri))
        {
            inferredTitle = Path.GetFileNameWithoutExtension(parsedIncludedUri.AbsolutePath) ?? inferredTitle;
        }

        return Ok(await ImportExternalMediaAsync(
            userId,
            normalizedSourceUrl: normalizedUrl,
            fileNameHint: Path.GetFileName(parsedIncludedUri?.AbsolutePath ?? string.Empty),
            titleHint: string.IsNullOrWhiteSpace(title) ? inferredTitle : title.Trim(),
            mediaTypeHint: mediaType,
            provider: "dropbox",
            includedVia: "shared_link",
            cancellationToken));
    }

    private async Task<object> ImportExternalMediaAsync(
        Guid userId,
        string normalizedSourceUrl,
        string? fileNameHint,
        string? titleHint,
        string mediaTypeHint,
        string provider,
        string includedVia,
        CancellationToken cancellationToken)
    {
        var downloaded = await DownloadRemoteMediaAsync(normalizedSourceUrl, fileNameHint, cancellationToken);
        var mediaType = ResolveRavensightMediaType(mediaTypeHint, downloaded.FileName, downloaded.ContentType);
        if (mediaType is null)
        {
            throw new InvalidOperationException("Could not infer media type from the Dropbox object. Set mediaType to music, video, or photo.");
        }

        var userStorageIdentity = ResolveUserStorageIdentityForImport(userId);
        var title = string.IsNullOrWhiteSpace(titleHint)
            ? Path.GetFileNameWithoutExtension(downloaded.FileName)
            : titleHint.Trim();
        if (string.IsNullOrWhiteSpace(title))
        {
            title = "Dropbox import";
        }

        await using var stream = new MemoryStream(downloaded.Bytes, writable: false);
        var formFile = new FormFile(stream, 0, downloaded.Bytes.Length, "file", downloaded.FileName)
        {
            Headers = new HeaderDictionary(),
            ContentType = downloaded.ContentType
        };

        if (mediaType == RavensightMediaType.Music)
        {
            var destinationFolder = $"users/{userStorageIdentity}/media/music";
            var dto = new SaveRavensightMusicDto
            {
                File = formFile,
                Title = title,
                DestinationFolder = destinationFolder
            };
            var track = await _musicLibraryStore.SaveMusicAsync(userId, formFile, dto, userStorageIdentity, cancellationToken);
            var savedAtUtc = DateTime.TryParse(track.UploadedAt, out var uploadedAt) ? uploadedAt.ToUniversalTime() : DateTime.UtcNow;
            await _mediaCatalogStore.CreateAssetAsync(new CreateRavensightMediaAssetRequest
            {
                UserId = userId,
                MediaType = RavensightMediaType.Music,
                FileName = track.FileName,
                RelativePath = string.IsNullOrWhiteSpace(track.ObjectKey) ? $"{destinationFolder}/{track.FileName}" : track.ObjectKey,
                PublicUrl = track.MediaUrl.StartsWith("/", StringComparison.Ordinal) ? null : track.MediaUrl,
                AbsolutePath = string.Empty,
                DestinationFolder = destinationFolder,
                ContentType = formFile.ContentType,
                SizeBytes = track.SizeBytes,
                SavedAtUtc = savedAtUtc,
                MetadataJson = JsonSerializer.Serialize(new
                {
                    title = track.Title,
                    artist = track.Artist,
                    album = track.Album,
                    genre = track.Genre,
                    source = provider,
                    included_via = includedVia
                })
            }, cancellationToken);

            return new
            {
                provider,
                success = true,
                mediaType = "music",
                title = "Music imported",
                message = "Dropbox music was added to your Wise-tracks library.",
                track
            };
        }

        if (mediaType == RavensightMediaType.Video)
        {
            var destinationFolder = $"users/{userStorageIdentity}/media/videos";
            var saved = await _videoService.SaveVideoAsync(
                userId,
                formFile,
                title,
                $"Imported from {provider}",
                destinationFolder,
                userStorageIdentity,
                PrivacyStatus.Unlisted,
                cancellationToken);

            var blobPath = StreamingUrlHelper.StreamByBlobPath(saved.File.RelativePath);
            if (string.IsNullOrWhiteSpace(blobPath))
            {
                blobPath = StreamingUrlHelper.StreamByFileName(saved.File.FileName);
            }

            var mediaUrl = StreamingUrlHelper.ResolveMediaUrl(saved.File.PublicUrl, blobPath ?? string.Empty);
            mediaUrl = AppendBlobSignatureIfNeeded(mediaUrl, saved.File.RelativePath);

            var asset = await _mediaCatalogStore.CreateAssetAsync(new CreateRavensightMediaAssetRequest
            {
                UserId = userId,
                MediaType = RavensightMediaType.Video,
                FileName = saved.File.FileName,
                RelativePath = saved.File.RelativePath,
                PublicUrl = saved.File.PublicUrl,
                AbsolutePath = saved.File.AbsolutePath,
                DestinationFolder = saved.File.DestinationFolder,
                ContentType = saved.File.ContentType,
                SizeBytes = saved.File.SizeBytes,
                SavedAtUtc = saved.File.SavedAtUtc,
                MetadataJson = JsonSerializer.Serialize(new
                {
                    title,
                    description = $"Imported from {provider}",
                    source = provider,
                    included_via = includedVia
                })
            }, cancellationToken);

            try
            {
                await _videoLibraryStore.CreateVideoAsync(new CreateVideoLibraryEntryRequest
                {
                    UserId = userId.ToString("D"),
                    Title = title,
                    Description = $"Imported from {provider}",
                    VideoUrl = mediaUrl,
                    PrivacyStatus = "unlisted",
                    Status = "published",
                    StorageMode = "permanent",
                    IsPermanent = true
                }, cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Video library row creation failed after Dropbox import for user {UserId}.", userId);
            }

            return new
            {
                provider,
                success = true,
                mediaType = "video",
                title = "Video imported",
                message = "Dropbox video was added to your video library.",
                video = new { id = asset.Id, fileName = saved.File.FileName, mediaUrl }
            };
        }

        var photoFolder = $"users/{userStorageIdentity}/media/photos";
        var photo = await _photoService.SavePhotoAsync(formFile, photoFolder, userStorageIdentity, cancellationToken);
        var photoBlobPath = StreamingUrlHelper.StreamByBlobPath(photo.RelativePath);
        if (string.IsNullOrWhiteSpace(photoBlobPath))
        {
            photoBlobPath = StreamingUrlHelper.StreamByFileName(photo.FileName);
        }

        var photoUrl = StreamingUrlHelper.ResolveMediaUrl(photo.PublicUrl, photoBlobPath ?? string.Empty);
        photoUrl = AppendBlobSignatureIfNeeded(photoUrl, photo.RelativePath);
        var photoAsset = await _mediaCatalogStore.CreateAssetAsync(new CreateRavensightMediaAssetRequest
        {
            UserId = userId,
            MediaType = RavensightMediaType.Photo,
            FileName = photo.FileName,
            RelativePath = photo.RelativePath,
            PublicUrl = photo.PublicUrl,
            AbsolutePath = photo.AbsolutePath,
            DestinationFolder = photo.DestinationFolder,
            ContentType = photo.ContentType,
            SizeBytes = photo.SizeBytes,
            SavedAtUtc = photo.SavedAtUtc,
            MetadataJson = JsonSerializer.Serialize(new
            {
                caption = title,
                source = provider,
                included_via = includedVia
            })
        }, cancellationToken);

        return new
        {
            provider,
            success = true,
            mediaType = "photo",
            title = "Photo imported",
            message = "Dropbox photo was added to your photo library.",
            photo = new { id = photoAsset.Id, fileName = photo.FileName, mediaUrl = photoUrl }
        };
    }

    private async Task<DownloadedCloudObject> DownloadRemoteMediaAsync(string mediaUrl, string? fileNameHint, CancellationToken cancellationToken)
    {
        if (!Uri.TryCreate(mediaUrl, UriKind.Absolute, out var uri) || uri.Scheme is not ("http" or "https"))
        {
            throw new InvalidOperationException("Dropbox media URL must be an absolute HTTP(S) URL.");
        }

        using var client = new HttpClient();
        using var response = await client.GetAsync(uri, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw new HttpRequestException($"Download failed with status {(int)response.StatusCode}.");
        }

        const long maxBytes = 250L * 1024L * 1024L;
        if (response.Content.Headers.ContentLength is > maxBytes)
        {
            throw new InvalidOperationException("Dropbox media exceeds the 250MB import limit.");
        }

        await using var source = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var memory = new MemoryStream();
        var buffer = new byte[81920];
        long total = 0;
        while (true)
        {
            var read = await source.ReadAsync(buffer.AsMemory(0, buffer.Length), cancellationToken);
            if (read == 0)
            {
                break;
            }

            total += read;
            if (total > maxBytes)
            {
                throw new InvalidOperationException("Dropbox media exceeds the 250MB import limit.");
            }

            memory.Write(buffer, 0, read);
        }

        if (memory.Length == 0)
        {
            throw new InvalidOperationException("Dropbox media download was empty.");
        }

        var fileName = string.IsNullOrWhiteSpace(fileNameHint)
            ? Path.GetFileName(uri.AbsolutePath)
            : fileNameHint.Trim();
        if (string.IsNullOrWhiteSpace(fileName))
        {
            fileName = $"dropbox-import-{Guid.NewGuid():N}";
        }

        var contentType = response.Content.Headers.ContentType?.MediaType ?? GuessContentTypeFromExtension(fileName);
        return new DownloadedCloudObject
        {
            Bytes = memory.ToArray(),
            FileName = fileName,
            ContentType = contentType
        };
    }

    private static string GuessContentTypeFromExtension(string fileName)
    {
        return Path.GetExtension(fileName).ToLowerInvariant() switch
        {
            ".mp3" => "audio/mpeg",
            ".wav" => "audio/wav",
            ".flac" => "audio/flac",
            ".aac" => "audio/aac",
            ".m4a" => "audio/mp4",
            ".ogg" => "audio/ogg",
            ".mp4" => "video/mp4",
            ".mov" => "video/quicktime",
            ".webm" => "video/webm",
            ".jpg" or ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            ".gif" => "image/gif",
            ".webp" => "image/webp",
            _ => "application/octet-stream"
        };
    }

    private static RavensightMediaType? ResolveRavensightMediaType(string? mediaTypeHint, string fileName, string contentType)
    {
        var hint = (mediaTypeHint ?? string.Empty).Trim().ToLowerInvariant();
        if (hint is "music" or "audio")
        {
            return RavensightMediaType.Music;
        }

        if (hint == "video")
        {
            return RavensightMediaType.Video;
        }

        if (hint is "photo" or "image")
        {
            return RavensightMediaType.Photo;
        }

        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        if (new[] { ".mp3", ".wav", ".flac", ".aac", ".ogg", ".m4a", ".opus", ".aiff", ".aif", ".wma", ".oga", ".caf" }.Contains(extension))
        {
            return RavensightMediaType.Music;
        }

        if (new[] { ".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v", ".mpeg", ".mpg", ".3gp", ".3g2", ".ts", ".m2ts" }.Contains(extension))
        {
            return RavensightMediaType.Video;
        }

        if (new[] { ".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".gif", ".bmp" }.Contains(extension))
        {
            return RavensightMediaType.Photo;
        }

        if (contentType.StartsWith("audio/", StringComparison.OrdinalIgnoreCase))
        {
            return RavensightMediaType.Music;
        }

        if (contentType.StartsWith("video/", StringComparison.OrdinalIgnoreCase))
        {
            return RavensightMediaType.Video;
        }

        if (contentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase))
        {
            return RavensightMediaType.Photo;
        }

        return null;
    }

    private string ResolveUserStorageIdentityForImport(Guid userId)
    {
        var displayName = User.FindFirstValue(ClaimTypes.Name);
        var email = User.FindFirstValue(ClaimTypes.Email) ?? User.FindFirstValue("email");
        return StoragePathResolver.ResolveUserStorageIdentity(displayName, email, userId.ToString("N"));
    }

    private string AppendBlobSignatureIfNeeded(string streamPath, string? relativePath)
    {
        if (string.IsNullOrWhiteSpace(streamPath)
            || !streamPath.StartsWith("/api/media/blob/", StringComparison.OrdinalIgnoreCase))
        {
            return streamPath;
        }

        var objectKey = (relativePath ?? string.Empty).Replace('\\', '/').Trim('/');
        if (string.IsNullOrWhiteSpace(objectKey))
        {
            return streamPath;
        }

        var signature = _signatureService.SignKey(objectKey);
        if (string.IsNullOrWhiteSpace(signature))
        {
            return streamPath;
        }

        var separator = streamPath.Contains('?') ? "&" : "?";
        return $"{streamPath}{separator}sig={Uri.EscapeDataString(signature)}";
    }

    private sealed class DownloadedCloudObject
    {
        public byte[] Bytes { get; init; } = Array.Empty<byte>();
        public string FileName { get; init; } = string.Empty;
        public string ContentType { get; init; } = "application/octet-stream";
    }

    private Guid ResolveUserId()
    {
        var raw = User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? User.FindFirstValue("sub")
            ?? User.FindFirstValue("userId");

        return Guid.TryParse(raw, out var id) ? id : Guid.Empty;
    }
}

public sealed class FunctionPromptRequest
{
    public string Prompt { get; set; } = string.Empty;
    public string? Model { get; set; }
}

public sealed class AnalyticsRequest
{
    public int Days { get; set; } = 30;
}

public sealed class FunctionTextRequest
{
    public string Text { get; set; } = string.Empty;
    public Guid? PostId { get; set; }
}

public sealed class PodcastPricingRequest
{
    public string PodcastTitle { get; set; } = string.Empty;
    public decimal BaseMonthlyPrice { get; set; } = 15m;
    public int MonthlyEpisodes { get; set; } = 4;
}

public sealed class InviteCollaboratorRequest
{
    public Guid ProjectId { get; set; }
    public string Identifier { get; set; } = string.Empty;
    public string Role { get; set; } = "Contributor";
    public string? Level { get; set; }
    public string? Message { get; set; }
}

public sealed class TeamCollaboratorInviteRequest
{
    public string Identifier { get; set; } = string.Empty;
    public string? Role { get; set; }
    public string? Responsibility { get; set; }
    public string? Device { get; set; }
}

public sealed class InviteUserWithRewardRequest
{
    public string Email { get; set; } = string.Empty;
    public string? Message { get; set; }
    public decimal RewardAmount { get; set; } = 25m;
}

public sealed class IssueDigitalCertificateRequest
{
    public Guid MediaAssetId { get; set; }
    public string RightsHolderName { get; set; } = string.Empty;
    public string? RightsHolderEmail { get; set; }
    public string CertificateType { get; set; } = "ownership";
    public string? State { get; set; }
}

public sealed class AddJamSessionToCalendarRequest
{
    public string Title { get; set; } = string.Empty;
    public string? ScheduledDate { get; set; }
    public string? Description { get; set; }
    public int? Bpm { get; set; }
    public string[]? AttendeeEmails { get; set; }
}

public sealed class MusicAnalysisQueryRequest
{
    public string? StampedStatus { get; set; }
    public string? Key { get; set; }
    public int? MinBpm { get; set; }
    public int? MaxBpm { get; set; }
    public Guid? CreatedById { get; set; }
    public int Limit { get; set; } = 50;
    public string? Sort { get; set; }
}

public sealed class ManageMusicAnalysisRequest
{
    public string Action { get; set; } = string.Empty;
    public Guid AnalysisId { get; set; }
    public string? Title { get; set; }
    public string? Description { get; set; }
    public string[]? Tags { get; set; }
}

public sealed class TruthScoreQueryRequest
{
    public Guid? TargetId { get; set; }
    public string? TargetType { get; set; }
    public decimal? MinScore { get; set; }
    public decimal? MaxScore { get; set; }
    public int Limit { get; set; } = 50;
    public string? Sort { get; set; }
}

public sealed class ManageTruthScoreRequest
{
    public string Action { get; set; } = string.Empty;
    public Guid ScoreId { get; set; }
    public decimal? Score { get; set; }
    public string? Correction { get; set; }
}

public sealed class NotifyActivityRequest
{
    public Guid RecipientId { get; set; }
    public string Type { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string? Link { get; set; }
}

public sealed class SendMessageRequest
{
    public Guid? ConversationId { get; set; }
    public Guid? RecipientId { get; set; }
    public string? RecipientEmail { get; set; }
    public string Content { get; set; } = string.Empty;
    public Guid? ParentMessageId { get; set; }
}

public sealed class SiteCrawlerCompatRequest
{
    public string? CountryCode { get; set; }
    public string? UserCategory { get; set; }
}

public sealed class SocialCrossPostsRequest
{
    public string Content { get; set; } = string.Empty;
    public string? FacebookPageId { get; set; }
    public string? InstagramMediaUrl { get; set; }
    public string? InstagramMediaType { get; set; }
    public bool PublishToTikTok { get; set; } = true;
    public bool PublishToYouTube { get; set; }
    public string? TikTokUsername { get; set; }
    public string? YouTubeChannelId { get; set; }
    public bool Queue { get; set; } = true;
}

public sealed record ConfiguredFacebookPage(string Id, string Name, bool IsDefault);
public sealed record ConfiguredTikTokAccount(string Username, string Label, bool IsDefault);
public sealed record ConfiguredYouTubeChannel(string Id, string Name, bool IsDefault);

public sealed class SocialCrossPostStatusRequest
{
    public Guid JobId { get; set; }
}

public sealed class SocialImportRequest
{
    public string? Action { get; set; }
    public List<SocialImportItem>? Items { get; set; }
}

public sealed class SocialImportItem
{
    public string? Content { get; set; }
    public string? PostType { get; set; }
    public string[]? MediaUris { get; set; }
}

public sealed class SpacesUploadRequest
{
    public string Filename { get; set; } = string.Empty;
    public string Folder { get; set; } = "uploads";
    public long FileSize { get; set; }
}

public sealed class StampMusicAnalysisRequest
{
    public string TrackTitle { get; set; } = string.Empty;
    public int Bpm { get; set; }
    public string Fingerprint { get; set; } = string.Empty;
    public string? Key { get; set; }
    public string? Description { get; set; }
    public string? MediaUrl { get; set; }
    public string[]? Tags { get; set; }
}

public sealed class TrackPodcastViewRequest
{
    public Guid PodcastId { get; set; }
}

public sealed class WorkflowSecretRequest
{
    public string? Secret { get; set; }
}

public sealed class ProcessInvitationRewardRequest
{
    public string? Email { get; set; }
    public string? Secret { get; set; }
}

public sealed class RequestAdminAccessRequest
{
    public string UserId { get; set; } = string.Empty;
    public string? Name { get; set; }
    public string? Reason { get; set; }
    public string? Website { get; set; }
}

public sealed class ResolveContentAlertRequest
{
    public string? AlertType { get; set; }
    public Guid? TargetId { get; set; }
    public Guid? PostId { get; set; }
    public decimal? Score { get; set; }
    public string? Reason { get; set; }
    public string? Evidence { get; set; }
    public string? Secret { get; set; }
}
