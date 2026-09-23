using System.Net;
using System.Net.Mail;
using System.Text.RegularExpressions;

namespace Wiseravenshare.Server.Services;

public interface IEmailService
{
    Task SendWelcomeEmailAsync(string email, string displayName);
    Task SendPasswordResetEmailAsync(string email, string displayName, string resetToken);
    Task<bool> SendTeamInviteEmailAsync(TeamInviteEmailMessage message, CancellationToken cancellationToken = default);
    Task<bool> SendCollaborationInviteEmailAsync(CollaborationInviteEmailMessage message, CancellationToken cancellationToken = default);
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

public sealed class CollaborationInviteEmailMessage
{
    public string ToEmail { get; set; } = string.Empty;
    public string ToName { get; set; } = string.Empty;
    public string InviterEmail { get; set; } = string.Empty;
    public string RoomName { get; set; } = string.Empty;
    public string RoomId { get; set; } = string.Empty;
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

    public Task<bool> SendCollaborationInviteEmailAsync(CollaborationInviteEmailMessage message, CancellationToken cancellationToken = default)
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

    public async Task SendWelcomeEmailAsync(string email, string displayName)
    {
        if (string.IsNullOrWhiteSpace(email) || !IsValidEmail(email))
        {
            _logger.LogWarning("Skipped welcome email dispatch because destination address '{Email}' is invalid.", email);
            return;
        }

        var smtpHost = GetConfig("InviteEmail:SmtpHost", "ReminderNotifications:Email:SmtpHost");
        if (string.IsNullOrWhiteSpace(smtpHost))
        {
            _logger.LogWarning("Skipped welcome email dispatch because SMTP host is not configured.");
            return;
        }

        var fromAddress = GetConfig("InviteEmail:FromAddress", "ReminderNotifications:Email:FromAddress", "InviteEmail:Username", "ReminderNotifications:Email:Username");
        if (string.IsNullOrWhiteSpace(fromAddress))
        {
            _logger.LogWarning("Skipped welcome email dispatch because sender address is not configured.");
            return;
        }

        var fromName = GetConfig("InviteEmail:FromName", "ReminderNotifications:Email:FromName");
        if (string.IsNullOrWhiteSpace(fromName))
        {
            fromName = "Wise Ravens";
        }

        var smtpPort = ParseIntConfig(587, "InviteEmail:SmtpPort", "ReminderNotifications:Email:SmtpPort");
        var enableSsl = ParseBoolConfig(true, "InviteEmail:EnableSsl", "ReminderNotifications:Email:EnableSsl");
        var smtpTimeout = ParseIntConfig(30000, "InviteEmail:SmtpTimeout", "ReminderNotifications:Email:SmtpTimeout");
        var username = GetConfig("InviteEmail:Username", "ReminderNotifications:Email:Username");
        var password = GetConfig("InviteEmail:Password", "ReminderNotifications:Email:Password");

        var safeName = string.IsNullOrWhiteSpace(displayName) ? email : displayName.Trim();
        var subject = "Welcome to Wise Ravens!";
        var body = $"""
Welcome to Wise Ravens, {safeName}!

Your account has been successfully created. You can now log in and start creating content.

Visit us: https://wiseravenshare.com

If you have any questions, feel free to reach out to our support team.

Wise Ravens Team
""";

        try
        {
            using var mail = new MailMessage
            {
                From = new MailAddress(fromAddress, fromName),
                Subject = subject,
                Body = body,
                IsBodyHtml = false
            };
            mail.To.Add(new MailAddress(email, safeName));

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

            await client.SendMailAsync(mail);
            _logger.LogInformation("Successfully sent welcome email to {Email}.", email);
        }
        catch (FormatException ex)
        {
            _logger.LogError(ex, "Invalid email format for {Email}.", email);
        }
        catch (SmtpException ex)
        {
            _logger.LogError(ex, "SMTP error sending welcome email to {Email}.", email);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send welcome email to {Email}.", email);
        }
    }

    public async Task SendPasswordResetEmailAsync(string email, string displayName, string resetToken)
    {
        if (string.IsNullOrWhiteSpace(email) || !IsValidEmail(email))
        {
            _logger.LogWarning("Skipped password reset email dispatch because destination address '{Email}' is invalid.", email);
            return;
        }

        if (string.IsNullOrWhiteSpace(resetToken))
        {
            _logger.LogWarning("Skipped password reset email dispatch because reset token is missing.");
            return;
        }

        var smtpHost = GetConfig("InviteEmail:SmtpHost", "ReminderNotifications:Email:SmtpHost");
        if (string.IsNullOrWhiteSpace(smtpHost))
        {
            _logger.LogWarning("Skipped password reset email dispatch because SMTP host is not configured.");
            return;
        }

        var fromAddress = GetConfig("InviteEmail:FromAddress", "ReminderNotifications:Email:FromAddress", "InviteEmail:Username", "ReminderNotifications:Email:Username");
        if (string.IsNullOrWhiteSpace(fromAddress))
        {
            _logger.LogWarning("Skipped password reset email dispatch because sender address is not configured.");
            return;
        }

        var fromName = GetConfig("InviteEmail:FromName", "ReminderNotifications:Email:FromName");
        if (string.IsNullOrWhiteSpace(fromName))
        {
            fromName = "Wise Ravens Security";
        }

        var smtpPort = ParseIntConfig(587, "InviteEmail:SmtpPort", "ReminderNotifications:Email:SmtpPort");
        var enableSsl = ParseBoolConfig(true, "InviteEmail:EnableSsl", "ReminderNotifications:Email:EnableSsl");
        var smtpTimeout = ParseIntConfig(30000, "InviteEmail:SmtpTimeout", "ReminderNotifications:Email:SmtpTimeout");
        var username = GetConfig("InviteEmail:Username", "ReminderNotifications:Email:Username");
        var password = GetConfig("InviteEmail:Password", "ReminderNotifications:Email:Password");

        var safeName = string.IsNullOrWhiteSpace(displayName) ? email : displayName.Trim();
        var subject = "Reset Your Wise Ravens Password";
        var resetLink = $"https://wiseravenshare.com/reset-password?token={Uri.EscapeDataString(resetToken)}";
        var body = $"""
Hello {safeName},

We received a request to reset your Wise Ravens password. Click the link below to set a new password:

{resetLink}

This link will expire in 24 hours. If you did not request a password reset, you can safely ignore this email.

Your account security is important to us. Never share this link with anyone.

Wise Ravens Security Team
""";

        try
        {
            using var mail = new MailMessage
            {
                From = new MailAddress(fromAddress, fromName),
                Subject = subject,
                Body = body,
                IsBodyHtml = false
            };
            mail.To.Add(new MailAddress(email, safeName));

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

            await client.SendMailAsync(mail);
            _logger.LogInformation("Successfully sent password reset email to {Email}.", email);
        }
        catch (FormatException ex)
        {
            _logger.LogError(ex, "Invalid email format for {Email}.", email);
        }
        catch (SmtpException ex)
        {
            _logger.LogError(ex, "SMTP error sending password reset email to {Email}.", email);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send password reset email to {Email}.", email);
        }
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

    public async Task<bool> SendCollaborationInviteEmailAsync(CollaborationInviteEmailMessage message, CancellationToken cancellationToken = default)
    {
        if (message is null)
        {
            _logger.LogWarning("Skipped collaboration invite email dispatch because payload was null.");
            return false;
        }

        var toEmail = message.ToEmail.Trim();
        if (string.IsNullOrWhiteSpace(toEmail))
        {
            _logger.LogWarning("Skipped collaboration invite email dispatch because destination address was missing.");
            return false;
        }

        if (!IsValidEmail(toEmail))
        {
            _logger.LogWarning("Skipped collaboration invite email dispatch because destination address '{Email}' is invalid.", toEmail);
            return false;
        }

        var smtpHost = GetConfig("InviteEmail:SmtpHost", "ReminderNotifications:Email:SmtpHost");
        if (string.IsNullOrWhiteSpace(smtpHost))
        {
            _logger.LogWarning("Skipped collaboration invite email dispatch because SMTP host is not configured.");
            return false;
        }

        var fromAddress = GetConfig("InviteEmail:FromAddress", "ReminderNotifications:Email:FromAddress", "InviteEmail:Username", "ReminderNotifications:Email:Username");
        if (string.IsNullOrWhiteSpace(fromAddress))
        {
            _logger.LogWarning("Skipped collaboration invite email dispatch because sender address is not configured.");
            return false;
        }

        var fromName = GetConfig("InviteEmail:FromName", "ReminderNotifications:Email:FromName");
        if (string.IsNullOrWhiteSpace(fromName))
        {
            fromName = "Wise Ravens Collaboration";
        }

        var smtpPort = ParseIntConfig(587, "InviteEmail:SmtpPort", "ReminderNotifications:Email:SmtpPort");
        var enableSsl = ParseBoolConfig(true, "InviteEmail:EnableSsl", "ReminderNotifications:Email:EnableSsl");
        var smtpTimeout = ParseIntConfig(30000, "InviteEmail:SmtpTimeout", "ReminderNotifications:Email:SmtpTimeout");
        var username = GetConfig("InviteEmail:Username", "ReminderNotifications:Email:Username");
        var password = GetConfig("InviteEmail:Password", "ReminderNotifications:Email:Password");

        var safeRoomName = string.IsNullOrWhiteSpace(message.RoomName) ? "Cross-Platform Collaboration Room" : message.RoomName.Trim();
        var subject = $"Collaboration invite: {safeRoomName}";
        var body = BuildCollaborationInviteBody(message, safeRoomName);

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
            _logger.LogInformation("Successfully sent collaboration invite email to {Email}.", toEmail);
            return true;
        }
        catch (FormatException ex)
        {
            _logger.LogError(ex, "Invalid email format for {Email}.", toEmail);
            return false;
        }
        catch (SmtpException ex)
        {
            _logger.LogError(ex, "SMTP error sending collaboration invite email to {Email}.", toEmail);
            return false;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send collaboration invite email to {Email}.", toEmail);
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

    private static string BuildCollaborationInviteBody(CollaborationInviteEmailMessage message, string safeRoomName)
    {
        var safeName = string.IsNullOrWhiteSpace(message.ToName) ? "there" : message.ToName.Trim();
        var safeInviter = string.IsNullOrWhiteSpace(message.InviterEmail) ? "a Wise Ravens collaborator" : message.InviterEmail.Trim();
        var safeRoomId = string.IsNullOrWhiteSpace(message.RoomId) ? "N/A" : message.RoomId.Trim();
        var inviteLink = string.IsNullOrWhiteSpace(message.InviteLink) ? "(link unavailable)" : message.InviteLink.Trim();

        return $"""
Hello {safeName},

{safeInviter} invited you to join a Wise Ravens collaboration room.

Room: {safeRoomName}
Room ID: {safeRoomId}

Join here:
{inviteLink}

If you did not expect this invite, you can ignore this email.

Wise Ravens Collaboration
""";
    }
}
