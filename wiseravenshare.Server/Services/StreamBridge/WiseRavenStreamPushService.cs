using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Wiseravenshare.Server.Entities.Stream;
using Wiseravenshare.Server.Infrastructure.Data;

namespace Wiseravenshare.Server.Services.StreamBridge;

/// <summary>
/// Configuration for the WiseRavenStream push integration.
/// Bind from appsettings "StreamBridge" section.
/// </summary>
public sealed class StreamBridgeOptions
{
    public const string SectionName = "StreamBridge";

    /// <summary>Base URL of the WiseRavenStream API (e.g. https://wiseravenstream.com).</summary>
    public string WiseRavenStreamBaseUrl { get; set; } = string.Empty;

    /// <summary>
    /// Service identity key sent as X-WRS-Service header.
    /// Must match WiseravenShareIntegration__ServiceKey configured in WiseRavenStream.
    /// </summary>
    public string ServiceKey { get; set; } = string.Empty;

    /// <summary>
    /// HMAC-SHA256 signing secret.
    /// Must match WiseravenShareIntegration__ServiceSecret configured in WiseRavenStream.
    /// </summary>
    public string ServiceSecret { get; set; } = string.Empty;

    /// <summary>
    /// API key WiseRavenStream uses when calling back to WiseRavenShare's
    /// /api/stream-transfer endpoints (X-Stream-Api-Key header).
    /// Set this here so WiseRavenShare can verify inbound callbacks.
    /// </summary>
    public string WiseRavenStreamApiKey { get; set; } = string.Empty;

    /// <summary>How often the push loop polls for approved transfers (seconds).</summary>
    public int PollIntervalSeconds { get; set; } = 60;

    /// <summary>Max number of transfers pushed per poll cycle.</summary>
    public int MaxPushBatchSize { get; set; } = 10;
}

/// <summary>
/// Background service that polls WiseRavenShare for approved stream transfers and
/// pushes them to WiseRavenStream via POST /v1/library/videos.
///
/// After a successful push it marks the transfer as Uploading via the local
/// UpdateStreamStatus path so the pipeline can continue.
/// </summary>
public sealed class WiseRavenStreamPushService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IHttpClientFactory _httpFactory;
    private readonly StreamBridgeOptions _options;
    private readonly ILogger<WiseRavenStreamPushService> _logger;

    private static readonly JsonSerializerOptions _jsonOpts = new(JsonSerializerDefaults.Web);

    public WiseRavenStreamPushService(
        IServiceScopeFactory scopeFactory,
        IHttpClientFactory httpFactory,
        StreamBridgeOptions options,
        ILogger<WiseRavenStreamPushService> logger)
    {
        _scopeFactory = scopeFactory;
        _httpFactory = httpFactory;
        _options = options;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (string.IsNullOrWhiteSpace(_options.WiseRavenStreamBaseUrl))
        {
            _logger.LogWarning(
                "WiseRavenStreamPushService is disabled: StreamBridge:WiseRavenStreamBaseUrl is not configured.");
            return;
        }

        _logger.LogInformation(
            "WiseRavenStreamPushService started. Pushing approved transfers to {BaseUrl} every {Interval}s.",
            _options.WiseRavenStreamBaseUrl, _options.PollIntervalSeconds);

        var interval = TimeSpan.FromSeconds(Math.Max(_options.PollIntervalSeconds, 10));

        while (!stoppingToken.IsCancellationRequested)
        {
            await Task.Delay(interval, stoppingToken).ConfigureAwait(false);

            try
            {
                await PushApprovedBatchAsync(stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during WiseRavenStream push cycle.");
            }
        }
    }

    private async Task PushApprovedBatchAsync(CancellationToken ct)
    {
        await using var scope = _scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var transfers = await db.Set<StreamTransfer>()
            .Where(t => t.Status == StreamTransferStatus.Approved)
            .OrderBy(t => t.CreatedAt)
            .Take(Math.Clamp(_options.MaxPushBatchSize, 1, 100))
            .ToListAsync(ct);

        if (transfers.Count == 0)
        {
            return;
        }

        _logger.LogInformation("Pushing {Count} approved transfer(s) to WiseRavenStream.", transfers.Count);

        var baseUrl = _options.WiseRavenStreamBaseUrl.TrimEnd('/');
        using var http = _httpFactory.CreateClient("WiseRavenStreamBridge");

        foreach (var transfer in transfers)
        {
            try
            {
                await PushTransferAsync(http, baseUrl, transfer, db, ct);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to push transfer {Id} to WiseRavenStream.", transfer.Id);
            }
        }
    }

    private async Task PushTransferAsync(
        HttpClient http,
        string baseUrl,
        StreamTransfer transfer,
        AppDbContext db,
        CancellationToken ct)
    {
        var payload = new
        {
            asset_id = transfer.SourceContentId,
            source_creator_id = transfer.SourceCreatorId,
            video_url = transfer.VideoUrl,
            title = transfer.Title,
            description = transfer.Description,
            source_app = transfer.SourceApp,
            transfer_id = transfer.Id.ToString("N"),
            mime_type = transfer.MimeType,
            file_size_bytes = transfer.FileSizeBytes
        };

        var path = "/v1/library/videos";
        var bodyJson = JsonSerializer.Serialize(payload, _jsonOpts);
        var bodyBytes = Encoding.UTF8.GetBytes(bodyJson);

        using var request = new HttpRequestMessage(HttpMethod.Post, $"{baseUrl}{path}")
        {
            Content = new StringContent(bodyJson, Encoding.UTF8, "application/json")
        };

        ApplyWrsSignature(request, "POST", path, bodyBytes);

        using var response = await http.SendAsync(request, ct);
        var body = await response.Content.ReadAsStringAsync(ct);

        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning(
                "WiseRavenStream rejected transfer {Id}: {Status} {Body}",
                transfer.Id, (int)response.StatusCode, body?.Length > 200 ? body[..200] : body);
            return;
        }

        // Mark as uploading now that WiseRavenStream has accepted it
        transfer.Status = StreamTransferStatus.Uploading;
        await db.SaveChangesAsync(ct);

        _logger.LogInformation("Transfer {Id} ({Title}) successfully pushed to WiseRavenStream.", transfer.Id, transfer.Title);
    }

    /// <summary>
    /// Adds the three WRS auth headers that WiseRavenStream's WiseravenShareSignatureValidator expects:
    ///   X-WRS-Service   = ServiceKey (identity)
    ///   X-WRS-Timestamp = Unix seconds
    ///   X-WRS-Signature = HMAC-SHA256 of "{timestamp}.{METHOD}.{path+query}.{sha256(body)}"
    /// </summary>
    private void ApplyWrsSignature(HttpRequestMessage request, string method, string pathAndQuery, byte[] bodyBytes)
    {
        var serviceKey = (_options.ServiceKey ?? string.Empty).Trim();
        var serviceSecret = (_options.ServiceSecret ?? string.Empty).Trim();

        if (string.IsNullOrWhiteSpace(serviceKey) || string.IsNullOrWhiteSpace(serviceSecret))
        {
            _logger.LogWarning(
                "StreamBridge:ServiceKey or ServiceSecret is not configured — request will be unsigned and rejected by WiseRavenStream.");
            return;
        }

        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString();
        var bodyHashHex = Convert.ToHexString(SHA256.HashData(bodyBytes)).ToLowerInvariant();
        var message = $"{timestamp}.{method.ToUpperInvariant()}.{pathAndQuery}.{bodyHashHex}";
        var signatureHex = Convert.ToHexString(
            HMACSHA256.HashData(
                Encoding.UTF8.GetBytes(serviceSecret),
                Encoding.UTF8.GetBytes(message)))
            .ToLowerInvariant();

        request.Headers.Add("X-WRS-Service", serviceKey);
        request.Headers.Add("X-WRS-Timestamp", timestamp);
        request.Headers.Add("X-WRS-Signature", signatureHex);
    }
}
