using System.Net;
using System.Net.Mail;
using System.Text.RegularExpressions;

namespace Wiseravenshare.Server.Services;

public interface IEmailService
{
    Task SendWelcomeEmailAsync(string email, string displayName);
    Task SendPasswordResetEmailAsync(string email, string displayName, string resetToken);
    Task<bool> SendTeamInviteEmailAsync(TeamInviteEmailMessage message, CancellationToken cancellationToken = default);
}

public sealed class TeamInviteEmailMessage
{
    public string ToEmail { get; set; } = string.Empty;
    public string ToName { get; set; } = string.Empty;
    public string InviterEmail { get; set; } = string.Empty;
    public string TeamRole { get; set; } = "member";
    public bool Prearranged { get; set; }
    public DateTime ExpiresAtUtc { get; set; }
    public string InviteLink { get; set; } = string.Empty;
}

public class NoopEmailService : IEmailService
{
    public Task SendWelcomeEmailAsync(string email, string displayName)
    {
        return Task.CompletedTask;
    }

    public Task SendPasswordResetEmailAsync(string email, string displayName, string resetToken)
    {
        return Task.CompletedTask;
    }

    public Task<bool> SendTeamInviteEmailAsync(TeamInviteEmailMessage message, CancellationToken cancellationToken = default)
    {
        return Task.FromResult(false);
    }
}

public sealed class SmtpEmailService : IEmailService
{
    private readonly IConfiguration _configuration;
    private readonly ILogger<SmtpEmailService> _logger;
    private static readonly Regex EmailRegex = new(@"^[^@\s]+@[^@\s]+\.[^@\s]+$", RegexOptions.Compiled | RegexOptions.IgnoreCase);

    public SmtpEmailService(IConfiguration configuration, ILogger<SmtpEmailService> logger)
    {
        _configuration = configuration;
        _logger = logger;
    }

    public Task SendWelcomeEmailAsync(string email, string displayName)
    {
        return Task.CompletedTask;
    }

    public Task SendPasswordResetEmailAsync(string email, string displayName, string resetToken)
    {
        return Task.CompletedTask;
    }

    public async Task<bool> SendTeamInviteEmailAsync(TeamInviteEmailMessage message, CancellationToken cancellationToken = default)
    {
        if (message is null)
        {
            _logger.LogWarning("Skipped invite email dispatch because message payload was null.");
            return false;
        }

        var toEmail = message.ToEmail.Trim();
        if (string.IsNullOrWhiteSpace(toEmail))
        {
            _logger.LogWarning("Skipped invite email dispatch because destination address was missing.");
            return false;
        }

        if (!IsValidEmail(toEmail))
        {
            _logger.LogWarning("Skipped invite email dispatch because destination address '{Email}' is invalid.", toEmail);
            return false;
        }

        var smtpHost = GetConfig("InviteEmail:SmtpHost", "ReminderNotifications:Email:SmtpHost");
        if (string.IsNullOrWhiteSpace(smtpHost))
        {
            _logger.LogWarning("Skipped invite email dispatch because SMTP host is not configured.");
            return false;
        }

        var fromAddress = GetConfig("InviteEmail:FromAddress", "ReminderNotifications:Email:FromAddress", "InviteEmail:Username", "ReminderNotifications:Email:Username");
        if (string.IsNullOrWhiteSpace(fromAddress))
        {
            _logger.LogWarning("Skipped invite email dispatch because sender address is not configured.");
            return false;
        }

        var fromName = GetConfig("InviteEmail:FromName", "ReminderNotifications:Email:FromName");
        if (string.IsNullOrWhiteSpace(fromName))
        {
            fromName = "Wise Ravens Team Access";
        }

        var smtpPort = ParseIntConfig(587, "InviteEmail:SmtpPort", "ReminderNotifications:Email:SmtpPort");
        var enableSsl = ParseBoolConfig(true, "InviteEmail:EnableSsl", "ReminderNotifications:Email:EnableSsl");
        var smtpTimeout = ParseIntConfig(30000, "InviteEmail:SmtpTimeout", "ReminderNotifications:Email:SmtpTimeout");
        var username = GetConfig("InviteEmail:Username", "ReminderNotifications:Email:Username");
        var password = GetConfig("InviteEmail:Password", "ReminderNotifications:Email:Password");

        var safeRole = string.IsNullOrWhiteSpace(message.TeamRole) ? "member" : message.TeamRole.Trim();
        var inviteType = message.Prearranged ? "prearranged access" : "team access";
        var subject = $"Wise Ravens {inviteType} invite";
        var body = BuildInviteBody(message, safeRole);

        try
        {
            using var mail = new MailMessage
            {
                From = new MailAddress(fromAddress, fromName),
                Subject = subject,
                Body = body,
                IsBodyHtml = false
            };
            mail.To.Add(new MailAddress(toEmail, string.IsNullOrWhiteSpace(message.ToName) ? toEmail : message.ToName));

            using var client = new SmtpClient(smtpHost, smtpPort)
            {
                EnableSsl = enableSsl,
                DeliveryMethod = SmtpDeliveryMethod.Network,
                UseDefaultCredentials = false,
                Timeout = smtpTimeout
            };

            if (!string.IsNullOrWhiteSpace(username) && !string.IsNullOrWhiteSpace(password))
            {
                client.Credentials = new NetworkCredential(username, password);
            }

            await client.SendMailAsync(mail, cancellationToken);
            _logger.LogInformation("Successfully sent team invite email to {Email}.", toEmail);
            return true;
        }
        catch (FormatException ex)
        {
            _logger.LogError(ex, "Invalid email format for {Email}.", toEmail);
            return false;
        }
        catch (SmtpException ex)
        {
            _logger.LogError(ex, "SMTP error sending team invite email to {Email}.", toEmail);
            return false;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send team invite email to {Email}.", toEmail);
            return false;
        }
    }

    private static bool IsValidEmail(string email)
    {
        if (string.IsNullOrWhiteSpace(email))
            return false;

        return EmailRegex.IsMatch(email);
    }

    private string GetConfig(params string[] keys)
    {
        foreach (var key in keys)
        {
            var value = _configuration[key]?.Trim();
            if (!string.IsNullOrWhiteSpace(value))
            {
                return value;
            }
        }

        return string.Empty;
    }

    private int ParseIntConfig(int fallback, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (int.TryParse(_configuration[key], out var parsed) && parsed > 0)
            {
                return parsed;
            }
        }

        return fallback;
    }

    private bool ParseBoolConfig(bool fallback, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (bool.TryParse(_configuration[key], out var parsed))
            {
                return parsed;
            }
        }

        return fallback;
    }

    private static string BuildInviteBody(TeamInviteEmailMessage message, string safeRole)
    {
        var safeName = string.IsNullOrWhiteSpace(message.ToName) ? "there" : message.ToName.Trim();
        var inviteKind = message.Prearranged ? "prearranged" : "team";
        // Use UTC format to avoid timezone confusion
        var expiresUtc = message.ExpiresAtUtc.ToString("yyyy-MM-dd HH:mm:ss") + " UTC";

        return $"""
Hello {safeName},

You have been granted {inviteKind} access to Wise Ravens.

Role: {safeRole}
Invited by: {message.InviterEmail}
Expires: {expiresUtc}

Activate your access with this secure link:
{message.InviteLink}

If you did not expect this invite, you can ignore this email.

Wise Ravens Team Access
""";
    }
}
