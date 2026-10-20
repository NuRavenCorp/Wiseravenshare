using System.Collections.Concurrent;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Wiseravenshare.Server.Shared;

namespace Wiseravenshare.Server.Controllers;

[ApiController]
[Authorize]
[Route("api/connectors")]
public sealed class ConnectorsCompatController : ControllerBase
{
    private static readonly ConcurrentDictionary<string, HashSet<string>> LinkedConnectorsByUser = new(StringComparer.OrdinalIgnoreCase);

    private static readonly Dictionary<string, string> ConnectorProviderById = new(StringComparer.OrdinalIgnoreCase)
    {
        ["6ace5a6f7a40e03b930459b0"] = "google",   // Google Drive
        ["6ace5b09fdf3a085bbb1915e"] = "dropbox",  // Dropbox
        ["6acdb848e6d732b0ef836cad"] = "google",   // Google Calendar
    };

    [HttpPost("{connectorId}/connect")]
    public IActionResult Connect(string connectorId)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        if (!ConnectorProviderById.TryGetValue(connectorId, out var provider))
        {
            return BadRequest(new { message = $"Unknown connector '{connectorId}'." });
        }

        MarkLinked(userId, connectorId);

        var connectUrl = provider switch
        {
            "google" => Url.ActionLink(
                action: "StartOAuth",
                controller: "Auth",
                values: new { provider = "google", returnUrl = "/media?tab=cloud" }),
            "dropbox" => Url.ActionLink(
                action: nameof(ConnectedInfo),
                controller: "ConnectorsCompat",
                values: new { connectorId }),
            _ => Url.ActionLink(
                action: nameof(ConnectedInfo),
                controller: "ConnectorsCompat",
                values: new { connectorId }),
        };

        return Ok(new
        {
            connectorId,
            provider,
            connected = true,
            url = connectUrl ?? $"/api/connectors/{Uri.EscapeDataString(connectorId)}/connected"
        });
    }

    [HttpPost("{connectorId}/disconnect")]
    public IActionResult Disconnect(string connectorId)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        MarkUnlinked(userId, connectorId);
        return Ok(new { connectorId, connected = false, success = true });
    }

    [HttpGet("{connectorId}/status")]
    public IActionResult Status(string connectorId)
    {
        var userId = User.GetUserId();
        if (userId == Guid.Empty)
        {
            return Unauthorized(new { message = "Invalid user session." });
        }

        return Ok(new
        {
            connectorId,
            connected = IsLinked(userId, connectorId)
        });
    }

    [AllowAnonymous]
    [HttpGet("{connectorId}/connected")]
    public IActionResult ConnectedInfo(string connectorId)
    {
        const string html = """
<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Connector linked</title></head>
  <body style="font-family:sans-serif;padding:1.5rem;">
    <h1>Connector linked</h1>
    <p>You can close this window and return to WiseravenShare.</p>
    <script>window.close();</script>
  </body>
</html>
""";
        return Content(html, "text/html");
    }

    private static bool IsLinked(Guid userId, string connectorId)
    {
        if (!LinkedConnectorsByUser.TryGetValue(userId.ToString(), out var linked))
        {
            return false;
        }

        lock (linked)
        {
            return linked.Contains(connectorId);
        }
    }

    private static void MarkLinked(Guid userId, string connectorId)
    {
        var set = LinkedConnectorsByUser.GetOrAdd(userId.ToString(), _ => new HashSet<string>(StringComparer.OrdinalIgnoreCase));
        lock (set)
        {
            set.Add(connectorId);
        }
    }

    private static void MarkUnlinked(Guid userId, string connectorId)
    {
        if (!LinkedConnectorsByUser.TryGetValue(userId.ToString(), out var set))
        {
            return;
        }

        lock (set)
        {
            set.Remove(connectorId);
        }
    }
}
