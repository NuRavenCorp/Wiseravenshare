using System.Net;
using System.Net.Mail;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace Wiseravenshare.Server.Services;

public sealed class ReminderDispatchRequest
{
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string StartAt { get; set; } = string.Empty;
    public int ReminderMinutes { get; set; }
    public bool SendEmail { get; set; }
    public string EmailTo { get; set; } = string.Empty;
    public bool SendSms { get; set; }
    public string PhoneTo { get; set; } = string.Empty;
}

public sealed class ReminderDispatchResult
{
    public bool EmailRequested { get; set; }
    public bool EmailSent { get; set; }
    public string? EmailMessage { get; set; }
    public bool SmsRequested { get; set; }
    public bool SmsSent { get; set; }
    public string? SmsMessage { get; set; }
}

public interface IReminderNotificationService
{
    Task<ReminderDispatchResult> SendReminderAsync(ReminderDispatchRequest request, CancellationToken cancellationToken);
}

public sealed class ReminderNotificationService : IReminderNotificationService
{
    private readonly IConfiguration _configuration;
    private readonly ILogger<ReminderNotificationService> _logger;
    private readonly IHttpClientFactory _httpClientFactory;

    public ReminderNotificationService(
        IConfiguration configuration,
        ILogger<ReminderNotificationService> logger,
        IHttpClientFactory httpClientFactory)
    {
        _configuration = configuration;
        _logger = logger;
        _httpClientFactory = httpClientFactory;
    }

    public async Task<ReminderDispatchResult> SendReminderAsync(ReminderDispatchRequest request, CancellationToken cancellationToken)
    {
        var result = new ReminderDispatchResult
        {
            EmailRequested = request.SendEmail,
            SmsRequested = request.SendSms
        };

        if (request.SendEmail)
        {
            result.EmailSent = await TrySendEmailAsync(request, cancellationToken);
            result.EmailMessage = result.EmailSent
                ? "Email reminder sent."
                : "Email reminder was not sent. Verify SMTP settings and destination address.";
        }

        if (request.SendSms)
        {
            result.SmsSent = await TrySendSmsAsync(request, cancellationToken);
            result.SmsMessage = result.SmsSent
                ? "SMS reminder sent."
                : "SMS reminder was not sent. Verify Twilio settings and destination number.";
        }

        return result;
    }

    private async Task<bool> TrySendEmailAsync(ReminderDispatchRequest request, CancellationToken cancellationToken)
    {
        var toEmail = (request.EmailTo ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(toEmail))
        {
            _logger.LogWarning("Skipped reminder email because destination address was missing.");
            return false;
        }

        var smtpHost = _configuration["ReminderNotifications:Email:SmtpHost"]?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(smtpHost))
        {
            _logger.LogWarning("Skipped reminder email because SMTP host is not configured.");
            return false;
        }

        var fromAddress = _configuration["ReminderNotifications:Email:FromAddress"]?.Trim();
        if (string.IsNullOrWhiteSpace(fromAddress))
        {
            fromAddress = _configuration["ReminderNotifications:Email:Username"]?.Trim();
        }

        if (string.IsNullOrWhiteSpace(fromAddress))
        {
            _logger.LogWarning("Skipped reminder email because sender address is not configured.");
            return false;
        }

        var fromName = _configuration["ReminderNotifications:Email:FromName"]?.Trim();
        if (string.IsNullOrWhiteSpace(fromName))
        {
            fromName = "Wise Ravens Planner";
        }

        var smtpPortValue = _configuration["ReminderNotifications:Email:SmtpPort"];
        var smtpPort = 587;
        if (!string.IsNullOrWhiteSpace(smtpPortValue) && int.TryParse(smtpPortValue, out var parsedPort) && parsedPort > 0)
        {
            smtpPort = parsedPort;
        }

        var enableSsl = true;
        var enableSslValue = _configuration["ReminderNotifications:Email:EnableSsl"];
        if (!string.IsNullOrWhiteSpace(enableSslValue) && bool.TryParse(enableSslValue, out var parsedEnableSsl))
        {
            enableSsl = parsedEnableSsl;
        }

        var smtpUsername = _configuration["ReminderNotifications:Email:Username"]?.Trim() ?? string.Empty;
        var smtpPassword = _configuration["ReminderNotifications:Email:Password"]?.Trim() ?? string.Empty;

        var subject = $"Reminder: {request.Title}";
        var body = BuildReminderBody(request);

        try
        {
            using var message = new MailMessage
            {
                From = new MailAddress(fromAddress, fromName),
                Subject = subject,
                Body = body,
                IsBodyHtml = false
            };
            message.To.Add(new MailAddress(toEmail));

            using var smtpClient = new SmtpClient(smtpHost, smtpPort)
            {
                EnableSsl = enableSsl,
                DeliveryMethod = SmtpDeliveryMethod.Network,
                UseDefaultCredentials = false
            };

            if (!string.IsNullOrWhiteSpace(smtpUsername))
            {
                smtpClient.Credentials = new NetworkCredential(smtpUsername, smtpPassword);
            }

            await smtpClient.SendMailAsync(message, cancellationToken);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send reminder email to {Email}.", toEmail);
            return false;
        }
    }

    private async Task<bool> TrySendSmsAsync(ReminderDispatchRequest request, CancellationToken cancellationToken)
    {
        var phoneTo = (request.PhoneTo ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(phoneTo))
        {
            _logger.LogWarning("Skipped reminder SMS because destination number was missing.");
            return false;
        }

        var accountSid = _configuration["ReminderNotifications:Sms:TwilioAccountSid"]?.Trim() ?? string.Empty;
        var authToken = _configuration["ReminderNotifications:Sms:TwilioAuthToken"]?.Trim() ?? string.Empty;
        var fromNumber = _configuration["ReminderNotifications:Sms:TwilioFromNumber"]?.Trim() ?? string.Empty;

        if (string.IsNullOrWhiteSpace(accountSid) || string.IsNullOrWhiteSpace(authToken) || string.IsNullOrWhiteSpace(fromNumber))
        {
            _logger.LogWarning("Skipped reminder SMS because Twilio credentials are incomplete.");
            return false;
        }

        var messageBody = BuildReminderBody(request);
        var form = new Dictionary<string, string>
        {
            ["To"] = phoneTo,
            ["From"] = fromNumber,
            ["Body"] = messageBody
        };

        var client = _httpClientFactory.CreateClient();
        var authBytes = Encoding.ASCII.GetBytes($"{accountSid}:{authToken}");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic", Convert.ToBase64String(authBytes));

        try
        {
            using var content = new FormUrlEncodedContent(form);
            using var response = await client.PostAsync(
                $"https://api.twilio.com/2010-04-01/Accounts/{accountSid}/Messages.json",
                content,
                cancellationToken);

            if (response.IsSuccessStatusCode)
            {
                return true;
            }

            var responseBody = await response.Content.ReadAsStringAsync(cancellationToken);
            _logger.LogWarning(
                "Twilio SMS request failed with status {StatusCode}. Body: {Body}",
                response.StatusCode,
                responseBody);
            return false;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send reminder SMS to {Phone}.", phoneTo);
            return false;
        }
    }

    private static string BuildReminderBody(ReminderDispatchRequest request)
    {
        var sb = new StringBuilder();
        sb.Append("Reminder: ").Append(request.Title);

        if (!string.IsNullOrWhiteSpace(request.StartAt)
            && DateTimeOffset.TryParse(request.StartAt, out var parsedStart))
        {
            sb.Append(" | Starts at: ").Append(parsedStart.ToLocalTime().ToString("f"));
        }

        if (request.ReminderMinutes > 0)
        {
            sb.Append(" | Reminder offset: ").Append(request.ReminderMinutes).Append(" minutes");
        }

        if (!string.IsNullOrWhiteSpace(request.Description))
        {
            sb.Append(" | ").Append(request.Description.Trim());
        }

        return sb.ToString();
    }
}
