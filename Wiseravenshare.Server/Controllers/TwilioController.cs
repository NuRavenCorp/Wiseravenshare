using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
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

    private string? AccountSid    => _config["Communique:Twilio:AccountSid"];
    private string? ApiKey        => _config["Communique:Conversations:ApiKey"];
    private string? ApiSecret     => _config["Communique:Conversations:ApiSecret"];
    private string? ServiceSid    => _config["Communique:Conversations:ServiceSid"];

    private bool IsConfigured =>
        !string.IsNullOrWhiteSpace(AccountSid) &&
        !string.IsNullOrWhiteSpace(ApiKey)     &&
        !string.IsNullOrWhiteSpace(ApiSecret)  &&
        !string.IsNullOrWhiteSpace(ServiceSid);

    private string CurrentIdentity =>
        User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? User.FindFirstValue("sub")
        ?? User.FindFirstValue("user_id")
        ?? throw new InvalidOperationException("Authenticated identity not found.");

    // ── GET /api/conversations/token ─────────────────────────────────────────
    [HttpGet("token")]
    public IActionResult GetToken()
    {
        if (!IsConfigured)
            return StatusCode(503, new { error = "Conversations service not configured." });

        try
        {
            var identity = CurrentIdentity;
            var grant = new ChatGrant { ServiceSid = ServiceSid };
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
        if (!IsConfigured)
            return StatusCode(503, new { error = "Conversations service not configured." });

        if (string.IsNullOrWhiteSpace(req?.ParticipantIdentity))
            return BadRequest(new { error = "participantIdentity is required." });

        try
        {
            TwilioClient.Init(ApiKey!, ApiSecret!, AccountSid);

            var conversation = ConversationResource.Create(
                friendlyName: req.FriendlyName ?? $"Chat: {CurrentIdentity} + {req.ParticipantIdentity}",
                pathChatServiceSid: ServiceSid
            );

            ParticipantResource.Create(
                identity: CurrentIdentity,
                pathConversationSid: conversation.Sid,
                pathChatServiceSid: ServiceSid
            );

            ParticipantResource.Create(
                identity: req.ParticipantIdentity,
                pathConversationSid: conversation.Sid,
                pathChatServiceSid: ServiceSid
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
            _logger.LogError(ex, "Failed to create Conversations room");
            return StatusCode(500, new { error = "Could not create conversation room." });
        }
    }
}

public sealed class CreateRoomRequest
{
    public string? ParticipantIdentity { get; set; }
    public string? FriendlyName { get; set; }
}

