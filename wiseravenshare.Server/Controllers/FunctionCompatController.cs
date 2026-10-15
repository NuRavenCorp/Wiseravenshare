using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.DTOs.Collaboration;
using Wiseravenshare.Server.DTOs.Social;
using Wiseravenshare.Server.Entities;
using Wiseravenshare.Server.Entities.Currency;
using Wiseravenshare.Server.Entities.FM;
using Wiseravenshare.Server.Infrastructure.Data;
using Wiseravenshare.Server.Interfaces.Services;
using Wiseravenshare.Server.Services.AiAssistant;
using Wiseravenshare.Server.Services.Currency;
using Wiseravenshare.Server.Services;
using Wiseravenshare.Server.Services.Interfaces;
using Wiseravenshare.Server.Services.Truth;

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
    private readonly IProjectService _projectService;
    private readonly TeamAccessService _teamAccessService;
    private readonly GrowthService _growthService;
    private readonly IEmailService _emailService;
    private readonly ISocialPlatformService _socialPlatformService;
    private readonly ISiteCrawlerService _siteCrawlerService;
    private readonly ISubscriptionService _subscriptionService;
    private readonly IConfiguration _configuration;
    private readonly ILogger<FunctionCompatController> _logger;

    public FunctionCompatController(
        IOllamaChatService chatService,
        ITruthEngineService truthEngine,
        IWiseCoinService wiseCoinService,
        AppDbContext db,
        IProjectService projectService,
        TeamAccessService teamAccessService,
        GrowthService growthService,
        IEmailService emailService,
        ISocialPlatformService socialPlatformService,
        ISiteCrawlerService siteCrawlerService,
        ISubscriptionService subscriptionService,
        IConfiguration configuration,
        ILogger<FunctionCompatController> logger)
    {
        _chatService = chatService;
        _truthEngine = truthEngine;
        _wiseCoinService = wiseCoinService;
        _db = db;
        _projectService = projectService;
        _teamAccessService = teamAccessService;
        _growthService = growthService;
        _emailService = emailService;
        _socialPlatformService = socialPlatformService;
        _siteCrawlerService = siteCrawlerService;
        _subscriptionService = subscriptionService;
        _configuration = configuration;
        _logger = logger;
    }

    [HttpPost("get-analytics-data")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> GetAnalyticsData([FromBody] AnalyticsRequest request)
    {
        return Ok(await BuildLocalAnalyticsAsync(request.Days, includeTopContent: true));
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
        return Ok(await RunPromptAsync(
            "You are a newsroom research assistant. Produce a structured journalism report with headline, lede, background, evidence, counterpoints, and next steps.",
            request));
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
        if (request.ProjectId == Guid.Empty || string.IsNullOrWhiteSpace(request.Identifier))
        {
            return BadRequest(new { error = "projectId and identifier are required." });
        }

        var inviteeEmail = await ResolveInviteeEmailAsync(request.Identifier);
        if (inviteeEmail is null)
        {
            return BadRequest(new { error = "Provide an email address or a known collaborator identifier." });
        }

        var invite = await _projectService.InviteCollaboratorAsync(request.ProjectId, new InviteCollaboratorDto
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
    public async Task<IActionResult> ListMusicAnalysis([FromBody] MusicAnalysisQueryRequest request)
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
    public async Task<IActionResult> ListTruthScores([FromBody] TruthScoreQueryRequest request)
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
            PublishToFacebook = !string.IsNullOrWhiteSpace(request.FacebookPageId),
            PublishToInstagram = !string.IsNullOrWhiteSpace(request.InstagramMediaUrl),
            PublishToTikTok = request.PublishToTikTok,
            PublishToYouTube = request.PublishToYouTube,
            PublishToWiseRavenStream = false,
            PublishToBluesky = false
        };

        var result = await _socialPlatformService.PublishAsync(ResolveUserId(), publishRequest);
        var response = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
        foreach (var item in result.Results)
        {
            response[item.Platform] = item.Success
                ? new { success = true, post_id = item.ExternalPostId, url = item.ExternalPostUrl }
                : new { error = item.Error ?? "failed" };
        }

        if (request.LinkedInPost)
        {
            response["linkedin"] = new { error = "LinkedIn direct posting is not enabled in the native publisher." };
        }

        return Ok(response);
    }

    [HttpPost("social-get-accounts")]
    [Authorize]
    public async Task<IActionResult> SicialGetAccounts()
    {
        var statuses = await _socialPlatformService.GetProviderStatusesAsync();
        return Ok(new
        {
            facebook = statuses.FirstOrDefault(x => x.Platform.Equals("facebook", StringComparison.OrdinalIgnoreCase)),
            instagram = statuses.FirstOrDefault(x => x.Platform.Equals("instagram", StringComparison.OrdinalIgnoreCase)),
            tiktok = statuses.FirstOrDefault(x => x.Platform.Equals("tiktok", StringComparison.OrdinalIgnoreCase)),
            linkedin = statuses.FirstOrDefault(x => x.Platform.Equals("linkedin", StringComparison.OrdinalIgnoreCase)),
            providers = statuses
        });
    }

    [HttpPost("social-import")]
    [Authorize]
    public async Task<IActionResult> SocialImport([FromBody] SocialImportRequest request)
    {
        if (string.Equals(request.Action, "import", StringComparison.OrdinalIgnoreCase))
        {
            var created = new List<object>();
            foreach (var item in request.Items ?? [])
            {
                var post = new Post
                {
                    UserId = ResolveUserId(),
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

        var facebook = await _socialPlatformService.GetFacebookFeedAsync(null, 10);
        var tiktok = await _socialPlatformService.GetTikTokFeedAsync(null, 10);
        var bluesky = await _socialPlatformService.GetBlueskyFeedAsync(null, 10);
        return Ok(new
        {
            facebook,
            instagram = Array.Empty<object>(),
            tiktok,
            bluesky
        });
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
    public bool LinkedInPost { get; set; }
    public bool PublishToTikTok { get; set; } = true;
    public bool PublishToYouTube { get; set; }
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
