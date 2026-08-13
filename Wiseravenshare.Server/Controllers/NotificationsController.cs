using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Wiseravenshare.Server.Hubs;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Authorize]
[Route("api/[controller]")]
public class NotificationsController : ControllerBase
{
    private readonly IReminderNotificationService _reminderNotificationService;
    private readonly IHubContext<NotificationHub> _notificationHub;
    private readonly IConfiguration _configuration;

    public NotificationsController(
        IReminderNotificationService reminderNotificationService,
        IHubContext<NotificationHub> notificationHub,
        IConfiguration configuration)
    {
        _reminderNotificationService = reminderNotificationService;
        _notificationHub = notificationHub;
        _configuration = configuration;
    }

    [HttpPost("reminder")]
    public async Task<IActionResult> SendReminder([FromBody] ReminderRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Title))
        {
            return BadRequest(new { message = "Title is required." });
        }

        var sendEmail = request.SendEmail;
        var sendSms = request.SendSms;
        if (!sendEmail && !sendSms)
        {
            return BadRequest(new { message = "Enable at least one reminder channel (email or SMS)." });
        }

        var dispatchRequest = new ReminderDispatchRequest
        {
            Title = request.Title.Trim(),
            Description = request.Description?.Trim() ?? string.Empty,
            StartAt = request.StartAt?.Trim() ?? string.Empty,
            ReminderMinutes = Math.Max(request.ReminderMinutes, 0),
            SendEmail = sendEmail,
            EmailTo = request.EmailTo?.Trim() ?? string.Empty,
            SendSms = sendSms,
            PhoneTo = request.PhoneTo?.Trim() ?? string.Empty
        };

        var result = await _reminderNotificationService.SendReminderAsync(dispatchRequest, cancellationToken);

        if ((result.EmailRequested && !result.EmailSent) || (result.SmsRequested && !result.SmsSent))
        {
            return StatusCode(StatusCodes.Status202Accepted, result);
        }

        return Ok(result);
    }

    [HttpPost("personnel/broadcast")]
    public async Task<IActionResult> BroadcastPersonnelNotification([FromBody] PersonnelNotificationRequest request, CancellationToken cancellationToken)
    {
        if (!IsPersonnelCaller())
        {
            return Forbid();
        }

        if (string.IsNullOrWhiteSpace(request.Title) || string.IsNullOrWhiteSpace(request.Message))
        {
            return BadRequest(new { message = "Title and message are required." });
        }

        var payload = new
        {
            id = Guid.NewGuid().ToString("N"),
            title = request.Title.Trim(),
            message = request.Message.Trim(),
            type = string.IsNullOrWhiteSpace(request.Type) ? "alert" : request.Type.Trim(),
            sender = "Wiseravenshare Personnel",
            fromPersonnel = true,
            timestamp = DateTime.UtcNow
        };

        var targets = (request.TargetUserIds ?? Array.Empty<string>())
            .Select((id) => (id ?? string.Empty).Trim().ToLowerInvariant())
            .Where((id) => !string.IsNullOrWhiteSpace(id))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (targets.Count == 0)
        {
            await _notificationHub.Clients.All.SendAsync("PersonnelNotification", payload, cancellationToken);
            return Ok(new { delivered = "all", payload });
        }

        foreach (var target in targets)
        {
            await _notificationHub.Clients.Group(NotificationHub.BuildUserGroup(target))
                .SendAsync("PersonnelNotification", payload, cancellationToken);
        }

        return Ok(new { delivered = targets.Count, targets, payload });
    }

    private bool IsPersonnelCaller()
    {
        if (User.IsInRole("Admin"))
        {
            return true;
        }

        var email = (User.FindFirstValue(ClaimTypes.Email)
            ?? User.FindFirstValue("email")
            ?? string.Empty)
            .Trim()
            .ToLowerInvariant();

        if (string.IsNullOrWhiteSpace(email))
        {
            return false;
        }

        var configured = (_configuration["Admin:Emails"] ?? string.Empty)
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select((value) => value.Trim().ToLowerInvariant())
            .Where((value) => !string.IsNullOrWhiteSpace(value))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        configured.Add("admin@wise-ravens.com");
        return configured.Contains(email);
    }

    public sealed class ReminderRequest
    {
        [Required]
        public string Title { get; set; } = string.Empty;
        public string? Description { get; set; }
        public string? StartAt { get; set; }
        public int ReminderMinutes { get; set; }
        public bool SendEmail { get; set; }
        public string? EmailTo { get; set; }
        public bool SendSms { get; set; }
        public string? PhoneTo { get; set; }
    }

    public sealed class PersonnelNotificationRequest
    {
        [Required]
        public string Title { get; set; } = string.Empty;

        [Required]
        public string Message { get; set; } = string.Empty;

        public string? Type { get; set; }

        public string[]? TargetUserIds { get; set; }
    }
}
