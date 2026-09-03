using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.Services.CrossPlatform;

namespace Wiseravenshare.Server.Controllers.CrossPlatform;

[ApiController]
[Route("api/webhooks/zernio")]
public class ZernioWebhookController : ControllerBase
{
    private readonly IZernioWebhookStore _webhookStore;
    private readonly IConfiguration _configuration;
    private readonly ILogger<ZernioWebhookController> _logger;

    public ZernioWebhookController(
        IZernioWebhookStore webhookStore,
        IConfiguration configuration,
        ILogger<ZernioWebhookController> logger)
    {
        _webhookStore = webhookStore;
        _configuration = configuration;
        _logger = logger;
    }

    [HttpPost]
    [AllowAnonymous]
    public async Task<IActionResult> Receive(CancellationToken cancellationToken)
    {
        string rawBody;
        using (var reader = new StreamReader(Request.Body, Encoding.UTF8))
        {
            rawBody = await reader.ReadToEndAsync(cancellationToken);
        }

        if (string.IsNullOrWhiteSpace(rawBody))
        {
            return BadRequest(new { error = "Webhook payload is empty." });
        }

        var webhookSecret = (_configuration["Social:Zernio:WebhookSecret"]
            ?? _configuration["ZERNIO_WEBHOOK_SECRET"]
            ?? _configuration["ZERNIO_WEBHOOKS_SECRET"]
            ?? string.Empty).Trim();

        if (!VerifySignatureIfConfigured(
                webhookSecret,
                rawBody,
                Request.Headers["X-Zernio-Signature"].ToString()))
        {
            return Unauthorized(new { error = "Invalid webhook signature." });
        }

        JsonDocument payload;
        try
        {
            payload = JsonDocument.Parse(rawBody);
        }
        catch (JsonException)
        {
            return BadRequest(new { error = "Invalid JSON payload." });
        }

        using (payload)
        {
            var root = payload.RootElement;
            var eventId = ReadString(root, "id")
                ?? Request.Headers["X-Zernio-Event-Id"].ToString()
                ?? Request.Headers["X-Late-Event-Id"].ToString();
            var eventType = ReadString(root, "event") ?? "unknown";

            if (string.IsNullOrWhiteSpace(eventId))
            {
                return BadRequest(new { error = "Missing event id." });
            }

            var accountNode = root.TryGetProperty("account", out var account) ? account : default;
            var accountId = accountNode.ValueKind != JsonValueKind.Undefined
                ? ReadString(accountNode, "accountId") ?? ReadString(accountNode, "id") ?? ReadString(root, "accountId")
                : ReadString(root, "accountId");
            var profileId = accountNode.ValueKind != JsonValueKind.Undefined
                ? ReadString(accountNode, "profileId") ?? ReadString(root, "profileId")
                : ReadString(root, "profileId");

            try
            {
                var accepted = await _webhookStore.TryRecordEventAsync(
                    eventId.Trim(),
                    eventType,
                    rawBody,
                    NullIfWhiteSpace(accountId),
                    NullIfWhiteSpace(profileId),
                    cancellationToken);

                if (!accepted)
                {
                    return Ok(new { accepted = true, duplicate = true });
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to persist incoming Zernio webhook event {EventId}.", eventId);
                return StatusCode(StatusCodes.Status503ServiceUnavailable, new { error = "Webhook persistence unavailable." });
            }

            _ = Task.Run(async () =>
            {
                await ProcessEventAsync(
                    eventId.Trim(),
                    eventType,
                    rawBody,
                    accountId,
                    profileId);
            });

            return Ok(new { accepted = true, duplicate = false });
        }
    }

    private async Task ProcessEventAsync(
        string eventId,
        string eventType,
        string rawBody,
        string? accountId,
        string? profileId)
    {
        try
        {
            using var payload = JsonDocument.Parse(rawBody);
            var root = payload.RootElement;
            if (eventType.Equals("account.connected", StringComparison.OrdinalIgnoreCase))
            {
                var accountNode = root.TryGetProperty("account", out var account) ? account : default;
                var platform = accountNode.ValueKind != JsonValueKind.Undefined ? ReadString(accountNode, "platform") : null;
                var username = accountNode.ValueKind != JsonValueKind.Undefined ? ReadString(accountNode, "username") : null;
                var resolvedAccountId = accountNode.ValueKind != JsonValueKind.Undefined
                    ? ReadString(accountNode, "accountId") ?? ReadString(accountNode, "id") ?? accountId
                    : accountId;
                var resolvedProfileId = accountNode.ValueKind != JsonValueKind.Undefined
                    ? ReadString(accountNode, "profileId") ?? profileId
                    : profileId;

                if (!string.IsNullOrWhiteSpace(resolvedAccountId))
                {
                    await _webhookStore.UpsertAccountMappingAsync(
                        resolvedAccountId,
                        NullIfWhiteSpace(resolvedProfileId),
                        NullIfWhiteSpace(platform),
                        NullIfWhiteSpace(username));
                }
            }
            else if (eventType.Equals("account.disconnected", StringComparison.OrdinalIgnoreCase))
            {
                var accountNode = root.TryGetProperty("account", out var account) ? account : default;
                var resolvedAccountId = accountNode.ValueKind != JsonValueKind.Undefined
                    ? ReadString(accountNode, "accountId") ?? ReadString(accountNode, "id") ?? accountId
                    : accountId;

                if (!string.IsNullOrWhiteSpace(resolvedAccountId))
                {
                    await _webhookStore.SetAccountConnectionStateAsync(resolvedAccountId, isConnected: false);
                }
            }

            await _webhookStore.MarkProcessedAsync(eventId, "processed", null);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Zernio webhook event {EventId} processing failed for {EventType}.", eventId, eventType);
            try
            {
                await _webhookStore.MarkProcessedAsync(eventId, "processing_failed", ex.Message);
            }
            catch (Exception markEx)
            {
                _logger.LogWarning(markEx, "Failed to mark Zernio webhook processing error for {EventId}.", eventId);
            }
        }
    }

    private static string? ReadString(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var property))
        {
            return null;
        }

        if (property.ValueKind == JsonValueKind.String)
        {
            return property.GetString();
        }

        return property.ValueKind == JsonValueKind.Null ? null : property.ToString();
    }

    private static string? NullIfWhiteSpace(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    private bool VerifySignatureIfConfigured(string secret, string rawBody, string signatureHeader)
    {
        if (string.IsNullOrWhiteSpace(secret))
        {
            return true;
        }

        if (string.IsNullOrWhiteSpace(signatureHeader))
        {
            return false;
        }

        var expectedHex = ComputeHmacHex(secret, rawBody);
        return FixedTimeEqualsHex(expectedHex, signatureHeader.Trim());
    }

    private static string ComputeHmacHex(string secret, string rawBody)
    {
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(rawBody));
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    private static bool FixedTimeEqualsHex(string expectedHex, string presentedHex)
    {
        if (!TryHexToBytes(expectedHex, out var expectedBytes) ||
            !TryHexToBytes(presentedHex, out var presentedBytes))
        {
            return false;
        }

        if (expectedBytes.Length != presentedBytes.Length)
        {
            return false;
        }

        return CryptographicOperations.FixedTimeEquals(expectedBytes, presentedBytes);
    }

    private static bool TryHexToBytes(string hex, out byte[] bytes)
    {
        bytes = Array.Empty<byte>();
        if (string.IsNullOrWhiteSpace(hex))
        {
            return false;
        }

        try
        {
            bytes = Convert.FromHexString(hex.Trim());
            return true;
        }
        catch
        {
            return false;
        }
    }
}
