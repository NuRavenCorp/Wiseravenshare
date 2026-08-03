using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Authorize]
[Route("api/[controller]")]
public class NotificationsController : ControllerBase
{
    private readonly IReminderNotificationService _reminderNotificationService;

    public NotificationsController(IReminderNotificationService reminderNotificationService)
    {
        _reminderNotificationService = reminderNotificationService;
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
}
