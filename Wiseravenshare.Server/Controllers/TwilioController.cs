using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using Twilio.Exceptions;
using Twilio.Jwt.AccessToken;
using Twilio.Rest.Conversations.V1.Service;
using Twilio.Rest.Conversations.V1.Service.Conversation;
using Twilio;

[ApiController]
[Route("api/conversations")]
[Authorize]
public class ConversationsChatController : ControllerBase
{
    private readonly IConfiguration _config;
    private readonly ILogger<ConversationsChatController> _logger;

    public ConversationsChatController(IConfiguration config, ILogger<ConversationsChatController> logger)
    {
        _config = config;
        _logger = logger;
    }

    private string? AccountSid    => FirstNonEmpty(_config["Communique:Twilio:AccountSid"], _config["TWILIO_ACCOUNT_SID"]);
    private string? AuthToken     => FirstNonEmpty(_config["Communique:Twilio:AuthToken"], _config["TWILIO_AUTH_TOKEN"]);
    private string? ApiKey        => FirstNonEmpty(_config["Communique:Conversations:ApiKey"], _config["TWILIO_CONVERSATIONS_API_KEY"]);
    private string? ApiSecret     => FirstNonEmpty(_config["Communique:Conversations:ApiSecret"], _config["TWILIO_CONVERSATIONS_API_SECRET"]);
    private string? ServiceSid    => FirstNonEmpty(_config["Communique:Conversations:ServiceSid"], _config["TWILIO_CONVERSATIONS_SERVICE_SID"]);

    private bool HasTokenCredentials =>
        !string.IsNullOrWhiteSpace(AccountSid) &&
        !string.IsNullOrWhiteSpace(ApiKey)     &&
        !string.IsNullOrWhiteSpace(ApiSecret);

    private bool HasValidAccountAndApiSidShapes =>
        (AccountSid ?? string.Empty).StartsWith("AC", StringComparison.OrdinalIgnoreCase)
        && (ApiKey ?? string.Empty).StartsWith("SK", StringComparison.OrdinalIgnoreCase);

    private static string? FirstNonEmpty(params string?[] values)
    {
        foreach (var value in values)
        {
            if (!string.IsNullOrWhiteSpace(value))
            {
                return value;
            }
        }

        return null;
    }

    private string? ResolveConversationServiceSid()
    {
        var configuredServiceSid = ServiceSid;
        if (!string.IsNullOrWhiteSpace(configuredServiceSid)
            && configuredServiceSid.StartsWith("IS", StringComparison.OrdinalIgnoreCase))
        {
            return configuredServiceSid;
        }

        if (string.IsNullOrWhiteSpace(AccountSid) || string.IsNullOrWhiteSpace(AuthToken))
        {
            return null;
        }

        try
        {
            TwilioClient.Init(AccountSid, AuthToken);
            var existingService = Twilio.Rest.Conversations.V1.ServiceResource.Read(limit: 20).FirstOrDefault();
            if (existingService is not null && !string.IsNullOrWhiteSpace(existingService.Sid))
            {
                return existingService.Sid;
            }

            var createdService = Twilio.Rest.Conversations.V1.ServiceResource.Create(friendlyName: "WiseRavenShare Conversations");
            return createdService?.Sid;
        }
        catch (ApiException ex)
        {
            _logger.LogWarning(ex, "Unable to auto-resolve Twilio Conversations Service SID.");
            return null;
        }
    }

    private string CurrentIdentity =>
        User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? User.FindFirstValue("sub")
        ?? User.FindFirstValue("user_id")
        ?? throw new InvalidOperationException("Authenticated identity not found.");

    // ── GET /api/conversations/token ─────────────────────────────────────────
    [HttpGet("token")]
    public IActionResult GetToken()
    {
        if (!HasTokenCredentials)
            return StatusCode(500, new { error = "Conversations service not configured. Set Account SID, Conversations API key, and API secret." });
        if (!HasValidAccountAndApiSidShapes)
            return StatusCode(500, new { error = "Conversations credentials are invalid. Expected AC (account) and SK (API key)." });

        try
        {
            var resolvedServiceSid = ResolveConversationServiceSid();
            if (string.IsNullOrWhiteSpace(resolvedServiceSid))
            {
                return StatusCode(500, new { error = "Conversations Service SID is missing. Set TWILIO_CONVERSATIONS_SERVICE_SID (IS...) or add Twilio Auth Token to auto-resolve." });
            }

            var identity = CurrentIdentity;
            var grant = new ChatGrant { ServiceSid = resolvedServiceSid };
            var token = new Token(
                AccountSid!,
                ApiKey!,
                ApiSecret!,
                identity,
                grants: new HashSet<IGrant> { grant }
            );

            return Ok(new { token = token.ToJwt(), identity });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to generate Conversations token");
            return StatusCode(500, new { error = "Token generation failed." });
        }
    }

    // ── POST /api/conversations/room ─────────────────────────────────────────
    // Body: { "participantIdentity": "other-user-id", "friendlyName": "optional" }
    [HttpPost("room")]
    public IActionResult CreateRoom([FromBody] CreateRoomRequest req)
    {
        if (!HasTokenCredentials)
            return StatusCode(500, new { error = "Conversations service not configured. Set Account SID, Conversations API key, and API secret." });
        if (!HasValidAccountAndApiSidShapes)
            return StatusCode(500, new { error = "Conversations credentials are invalid. Expected AC (account) and SK (API key)." });

        if (string.IsNullOrWhiteSpace(req?.ParticipantIdentity))
            return BadRequest(new { error = "participantIdentity is required." });

        try
        {
            var resolvedServiceSid = ResolveConversationServiceSid();
            if (string.IsNullOrWhiteSpace(resolvedServiceSid))
            {
                return StatusCode(500, new { error = "Conversations Service SID is missing. Set TWILIO_CONVERSATIONS_SERVICE_SID (IS...) or add Twilio Auth Token to auto-resolve." });
            }

            TwilioClient.Init(ApiKey, ApiSecret, AccountSid);

            var conversation = ConversationResource.Create(
                friendlyName: req.FriendlyName ?? $"Chat: {CurrentIdentity} + {req.ParticipantIdentity}",
                pathChatServiceSid: resolvedServiceSid
            );

            if (conversation?.Sid == null)
            {
                _logger.LogError("Conversation creation returned null SID");
                return StatusCode(500, new { error = "Failed to create conversation room (no SID returned)." });
            }

            ParticipantResource.Create(
                identity: CurrentIdentity,
                pathConversationSid: conversation.Sid,
                pathChatServiceSid: resolvedServiceSid
            );

            ParticipantResource.Create(
                identity: req.ParticipantIdentity,
                pathConversationSid: conversation.Sid,
                pathChatServiceSid: resolvedServiceSid
            );

            _logger.LogInformation("Conversation {Sid} created between {A} and {B}",
                conversation.Sid, CurrentIdentity, req.ParticipantIdentity);

            return Ok(new
            {
                conversationSid = conversation.Sid,
                friendlyName = conversation.FriendlyName
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to create Conversations room: {Message}", ex.Message);
            return StatusCode(500, new { error = $"Could not create conversation room: {ex.Message}" });
        }
    }
}

public sealed class CreateRoomRequest
{
    public string? ParticipantIdentity { get; set; }
    public string? FriendlyName { get; set; }
}
