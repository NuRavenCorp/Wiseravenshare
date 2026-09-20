using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.Services;
using Wiseravenshare.Server.Shared;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Route("api/music-rights")]
[Authorize]
[Produces("application/json")]
public sealed class MusicRightsController : ControllerBase
{
    private readonly ISubscriptionService _subscriptionService;
    private readonly IConfiguration _configuration;
    private readonly ILogger<MusicRightsController> _logger;

    public MusicRightsController(
        ISubscriptionService subscriptionService,
        IConfiguration configuration,
        ILogger<MusicRightsController> logger)
    {
        _subscriptionService = subscriptionService;
        _configuration = configuration;
        _logger = logger;
    }

    /// <summary>
    /// POST /api/music-rights/register
    /// Creates a timestamped ownership registration record and returns the
    /// formatted ownership document plus a unique registration ID.
    /// </summary>
    [HttpPost("register")]
    public async Task<IActionResult> RegisterTrack(
        [FromBody] TrackRegistrationRequest request,
        CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        var email  = User.FindFirstValue(ClaimTypes.Email) ?? User.FindFirstValue("email") ?? "unknown";
        var name   = User.FindFirstValue(ClaimTypes.Name)  ?? User.FindFirstValue("name")  ?? email;

        // Check subscription or admin pass
        var isAdmin = AuthAccessPolicy.IsConfiguredAdminEmail(_configuration, email);
        if (!isAdmin)
        {
            try
            {
                var sub = await _subscriptionService.GetSubscriptionStatusAsync(userId);
                if (!sub.HasActiveSubscription)
                {
                    return StatusCode(StatusCodes.Status402PaymentRequired, new
                    {
                        message = "A paid Music Rights plan is required to register original tracks.",
                        requiresPayment = true
                    });
                }
            }
            catch
            {
                return StatusCode(StatusCodes.Status402PaymentRequired, new
                {
                    message = "Unable to verify subscription. Please ensure your plan is active.",
                    requiresPayment = true
                });
            }
        }

        if (string.IsNullOrWhiteSpace(request.Title))
            return BadRequest(new { message = "Track title is required." });

        if (string.IsNullOrWhiteSpace(request.ArtistName))
            return BadRequest(new { message = "Artist name is required." });

        var registrationId = Guid.NewGuid().ToString("N").ToUpperInvariant()[..12];
        var createdAtUtc   = DateTime.UtcNow;
        var createdAtLocal = createdAtUtc.ToString("dddd, MMMM dd, yyyy 'at' HH:mm:ss 'UTC'");

        var document = BuildOwnershipDocument(
            registrationId, createdAtUtc, createdAtLocal,
            request, userId.ToString(), email, name);

        _logger.LogInformation(
            "Music rights registration {Id} created for user {UserId} track '{Title}'",
            registrationId, userId, request.Title);

        return Ok(new
        {
            registrationId,
            createdAtUtc,
            message    = $"Track '{request.Title}' successfully registered.",
            document,
            printUrl   = $"/api/music-rights/certificate/{registrationId}/print",
            metadata   = new
            {
                title           = request.Title,
                artist          = request.ArtistName,
                registrationId,
                createdAtUtc,
                sha256Fingerprint = request.Sha256Fingerprint ?? "(not provided)"
            }
        });
    }

    /// <summary>
    /// POST /api/music-rights/certificate/print
    /// Verifies active subscription then regenerates and returns the full HTML
    /// certificate ready for browser printing.  Called by the client after
    /// Stripe payment succeeds.
    /// </summary>
    [HttpPost("certificate/print")]
    public async Task<IActionResult> PrintCertificate(
        [FromBody] PrintCertificateRequest request,
        CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        var email  = User.FindFirstValue(ClaimTypes.Email) ?? User.FindFirstValue("email") ?? "unknown";
        var name   = User.FindFirstValue(ClaimTypes.Name)  ?? User.FindFirstValue("name")  ?? email;

        var isAdmin = AuthAccessPolicy.IsConfiguredAdminEmail(_configuration, email);
        if (!isAdmin)
        {
            try
            {
                var sub = await _subscriptionService.GetSubscriptionStatusAsync(userId);
                if (!sub.HasActiveSubscription)
                {
                    return StatusCode(StatusCodes.Status402PaymentRequired, new
                    {
                        message = "An active Music Rights plan is required to print your certificate.",
                        requiresPayment = true
                    });
                }
            }
            catch
            {
                return StatusCode(StatusCodes.Status402PaymentRequired, new
                {
                    message = "Unable to verify subscription for certificate printing.",
                    requiresPayment = true
                });
            }
        }

        if (string.IsNullOrWhiteSpace(request.Title) || string.IsNullOrWhiteSpace(request.ArtistName))
            return BadRequest(new { message = "Title and artist are required to regenerate certificate." });

        var regReq = new TrackRegistrationRequest
        {
            Title                = request.Title,
            ArtistName           = request.ArtistName,
            Album                = request.Album,
            Genre                = request.Genre,
            YearOfCreation       = request.YearOfCreation,
            Bpm                  = request.Bpm,
            MusicalKey           = request.MusicalKey,
            Isrc                 = request.Isrc,
            Label                = request.Label,
            CoWriters            = request.CoWriters,
            Description          = request.Description,
            LyricsExcerpt        = request.LyricsExcerpt,
            MusicCharacterization = request.MusicCharacterization,
            Sha256Fingerprint    = request.Sha256Fingerprint,
        };
        var registrationId  = request.RegistrationId ?? Guid.NewGuid().ToString("N").ToUpperInvariant()[..12];
        var createdAtUtc    = request.CreatedAtUtc ?? DateTime.UtcNow;
        var createdAtLocal  = createdAtUtc.ToString("dddd, MMMM dd, yyyy 'at' HH:mm:ss 'UTC'");
        var document        = BuildOwnershipDocument(
            registrationId, createdAtUtc, createdAtLocal,
            regReq, userId.ToString(), email, name,
            paymentVerified: true);

        return Content(document, "text/html; charset=utf-8");
    }

    // ── Document builder ──────────────────────────────────────────────────────

    private static string BuildOwnershipDocument(
        string registrationId,
        DateTime createdAtUtc,
        string createdAtFormatted,
        TrackRegistrationRequest req,
        string userId,
        string email,
        string displayName,
        bool paymentVerified = false)
    {
        var sb = new StringBuilder();

        sb.AppendLine("<!DOCTYPE html>");
        sb.AppendLine("<html lang=\"en\">");
        sb.AppendLine("<head>");
        sb.AppendLine("<meta charset=\"UTF-8\" />");
        sb.AppendLine("<title>Ownership Registration Certificate</title>");
        sb.AppendLine("<style>");
        sb.AppendLine("  body{font-family:'Georgia',serif;color:#1a1a2e;max-width:900px;margin:0 auto;padding:40px 32px;background:#fff;}");
        sb.AppendLine("  .header{text-align:center;border-bottom:3px solid #1e3a5f;padding-bottom:24px;margin-bottom:32px;}");
        sb.AppendLine("  .seal{font-size:48px;margin-bottom:8px;}");
        sb.AppendLine("  h1{font-size:22px;font-weight:800;color:#1e3a5f;margin:0;}");
        sb.AppendLine("  .sub{font-size:13px;color:#4a5568;margin-top:4px;}");
        sb.AppendLine("  .reg-id{font-family:monospace;font-size:14px;background:#f0f4f8;border:1px solid #cbd5e0;padding:8px 16px;border-radius:6px;display:inline-block;margin-top:12px;letter-spacing:0.12em;font-weight:700;}");
        sb.AppendLine("  .timestamp{font-size:12px;color:#718096;margin-top:6px;}");
        sb.AppendLine("  h2{font-size:14px;font-weight:700;color:#1e3a5f;border-bottom:1px solid #e2e8f0;padding-bottom:6px;margin:28px 0 12px;}");
        sb.AppendLine("  table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:8px;}");
        sb.AppendLine("  td{padding:7px 10px;vertical-align:top;}");
        sb.AppendLine("  td:first-child{font-weight:600;color:#4a5568;width:38%;background:#f7fafc;}");
        sb.AppendLine("  tr:nth-child(odd) td:first-child{background:#edf2f7;}");
        sb.AppendLine("  .music-box{background:#f0f4f8;border:1px solid #cbd5e0;border-radius:8px;padding:16px;font-size:13px;line-height:1.7;margin-bottom:8px;}");
        sb.AppendLine("  .fp{font-family:monospace;font-size:11px;word-break:break-all;color:#2d3748;background:#e2e8f0;padding:8px;border-radius:4px;}");
        sb.AppendLine("  .declaration{border:2px solid #1e3a5f;border-radius:8px;padding:16px;margin:28px 0;font-size:13px;line-height:1.7;background:#f7fafc;}");
        sb.AppendLine("  .footer{text-align:center;font-size:11px;color:#718096;margin-top:40px;border-top:1px solid #e2e8f0;padding-top:16px;}");
        sb.AppendLine("  @media print{body{padding:20px;}.footer{position:fixed;bottom:0;width:100%;}}");
        sb.AppendLine("</style>");
        sb.AppendLine("<script>window.onload=function(){if(document.body.dataset.autoPrint==='1'){window.print();}};</script>");
        sb.AppendLine("</head>");
        sb.AppendLine($"<body data-auto-print=\"{(paymentVerified ? "1" : "0")}\">");

        // Payment verified seal
        if (paymentVerified)
        {
            sb.AppendLine("<div style=\"text-align:center;background:#e6fffa;border:1px solid #38a169;border-radius:8px;padding:10px;margin-bottom:20px;font-size:13px;font-weight:700;color:#276749;\">✅ PAYMENT VERIFIED — ACTIVE SUBSCRIPTION CONFIRMED</div>");
        }

        // Header
        sb.AppendLine("<div class=\"header\">");
        sb.AppendLine("  <div class=\"seal\">🎵🛡️</div>");
        sb.AppendLine("  <h1>WiseRavenShare Music Rights Studio</h1>");
        sb.AppendLine("  <div class=\"sub\">ORIGINAL TRACK OWNERSHIP REGISTRATION CERTIFICATE</div>");
        sb.AppendLine($"  <div class=\"reg-id\">REG-{registrationId}</div>");
        sb.AppendLine($"  <div class=\"timestamp\">Issued: {createdAtFormatted}</div>");
        sb.AppendLine("</div>");

        // Registrant
        sb.AppendLine("<h2>I. Registrant Identity</h2>");
        sb.AppendLine("<table>");
        Row(sb, "Display Name", HtmlEnc(displayName));
        Row(sb, "Email Address", HtmlEnc(email));
        Row(sb, "User ID", HtmlEnc(userId));
        Row(sb, "Registration Date", HtmlEnc(createdAtFormatted));
        Row(sb, "Registration ID", $"REG-{registrationId}");
        sb.AppendLine("</table>");

        // Track Metadata
        sb.AppendLine("<h2>II. Track Metadata</h2>");
        sb.AppendLine("<table>");
        Row(sb, "Track Title",        HtmlEnc(req.Title));
        Row(sb, "Artist / Stage Name",HtmlEnc(req.ArtistName));
        RowOpt(sb, "Album / Project",  req.Album);
        RowOpt(sb, "Genre",            req.Genre);
        RowOpt(sb, "Year of Creation", req.YearOfCreation?.ToString());
        RowOpt(sb, "BPM / Tempo",      req.Bpm.HasValue ? $"{req.Bpm} BPM" : null);
        RowOpt(sb, "Musical Key",      req.MusicalKey);
        RowOpt(sb, "ISRC Code",        req.Isrc);
        RowOpt(sb, "Label / Publisher",req.Label);
        RowOpt(sb, "Co-writers",       req.CoWriters);
        RowOpt(sb, "Description",      req.Description);
        sb.AppendLine("</table>");

        // Lyrics excerpt
        if (!string.IsNullOrWhiteSpace(req.LyricsExcerpt))
        {
            sb.AppendLine("<h2>III. Lyrics Excerpt (First Verse / Hook)</h2>");
            sb.AppendLine($"<div class=\"music-box\"><em>{HtmlEnc(req.LyricsExcerpt)}</em></div>");
        }

        // Music Characterization
        var charSection = string.IsNullOrWhiteSpace(req.LyricsExcerpt) ? "III" : "IV";
        sb.AppendLine($"<h2>{charSection}. Music Characterization — First 20 Bars</h2>");
        if (!string.IsNullOrWhiteSpace(req.MusicCharacterization))
        {
            sb.AppendLine($"<div class=\"music-box\">{HtmlEnc(req.MusicCharacterization)}</div>");
        }
        else
        {
            sb.AppendLine("<div class=\"music-box\"><em>No audio analysis submitted with this registration.</em></div>");
        }
        if (!string.IsNullOrWhiteSpace(req.Sha256Fingerprint))
        {
            sb.AppendLine($"<h2>{(string.IsNullOrWhiteSpace(req.LyricsExcerpt) ? "IV" : "V")}. Cryptographic Fingerprint (SHA-256)</h2>");
            sb.AppendLine($"<div class=\"fp\">{HtmlEnc(req.Sha256Fingerprint)}</div>");
        }

        // Declaration
        sb.AppendLine("<div class=\"declaration\">");
        sb.AppendLine("<strong>DECLARATION OF ORIGINAL AUTHORSHIP</strong><br/><br/>");
        sb.AppendLine($"I, <strong>{HtmlEnc(displayName)}</strong>, declare under penalty of perjury that:");
        sb.AppendLine("<ol style=\"margin:8px 0 0 0;padding-left:20px;\">");
        sb.AppendLine("  <li>The track identified in this certificate is my original composition and/or recording.</li>");
        sb.AppendLine("  <li>I hold or co-hold the master recording and publishing rights to this work.</li>");
        sb.AppendLine("  <li>The date of this registration accurately reflects my claim of creation priority.</li>");
        sb.AppendLine("  <li>I authorise WiseRavenShare to maintain this record as evidence of my ownership.</li>");
        sb.AppendLine("</ol>");
        sb.AppendLine("<br/>This declaration was digitally submitted on <strong>" + HtmlEnc(createdAtFormatted) + "</strong>.");
        sb.AppendLine("</div>");

        // Footer
        sb.AppendLine("<div class=\"footer\">");
        sb.AppendLine($"  WiseRavenShare Music Rights Studio · Registration REG-{registrationId} · {createdAtUtc:yyyy-MM-dd HH:mm:ss} UTC<br/>");
        sb.AppendLine("  This document serves as evidence of creation date and is not a substitute for formal U.S. Copyright Office registration.<br/>");
        sb.AppendLine("  <a href=\"https://www.copyright.gov\" style=\"color:#4a5568;\">www.copyright.gov</a>");
        sb.AppendLine("</div>");
        sb.AppendLine("</body></html>");

        return sb.ToString();
    }

    private static void Row(StringBuilder sb, string label, string value)
        => sb.AppendLine($"<tr><td>{HtmlEnc(label)}</td><td>{value}</td></tr>");

    private static void RowOpt(StringBuilder sb, string label, string? value)
    {
        if (!string.IsNullOrWhiteSpace(value))
            sb.AppendLine($"<tr><td>{HtmlEnc(label)}</td><td>{HtmlEnc(value)}</td></tr>");
    }

    private static string HtmlEnc(string? value)
        => System.Net.WebUtility.HtmlEncode(value ?? string.Empty);
}

// ── Request DTO ───────────────────────────────────────────────────────────────

public sealed class TrackRegistrationRequest
{
    public string  Title               { get; set; } = string.Empty;
    public string  ArtistName          { get; set; } = string.Empty;
    public string? Album               { get; set; }
    public string? Genre               { get; set; }
    public int?    YearOfCreation      { get; set; }
    public double? Bpm                 { get; set; }
    public string? MusicalKey          { get; set; }
    public string? Isrc                { get; set; }
    public string? Label               { get; set; }
    public string? CoWriters           { get; set; }
    public string? Description         { get; set; }
    public string? LyricsExcerpt       { get; set; }
    public string? MusicCharacterization { get; set; }
    public string? Sha256Fingerprint   { get; set; }
}

public sealed class PrintCertificateRequest
{
    public string?   RegistrationId       { get; set; }
    public DateTime? CreatedAtUtc         { get; set; }
    public string    Title                { get; set; } = string.Empty;
    public string    ArtistName           { get; set; } = string.Empty;
    public string?   Album                { get; set; }
    public string?   Genre                { get; set; }
    public int?      YearOfCreation       { get; set; }
    public double?   Bpm                  { get; set; }
    public string?   MusicalKey           { get; set; }
    public string?   Isrc                 { get; set; }
    public string?   Label                { get; set; }
    public string?   CoWriters            { get; set; }
    public string?   Description          { get; set; }
    public string?   LyricsExcerpt        { get; set; }
    public string?   MusicCharacterization { get; set; }
    public string?   Sha256Fingerprint    { get; set; }
}
