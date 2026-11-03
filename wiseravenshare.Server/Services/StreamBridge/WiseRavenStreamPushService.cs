using System.Net.Http.Headers;
using System.Net.Http.Json;
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

    /// <summary>API key sent as X-Stream-Api-Key to WiseRavenStream service endpoints.</summary>
    public string ApiKey { get; set; } = string.Empty;

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

        using var request = new HttpRequestMessage(HttpMethod.Post, $"{baseUrl}/v1/library/videos")
        {
            Content = JsonContent.Create(payload)
        };

        ApplyServiceKey(request);

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

    private void ApplyServiceKey(HttpRequestMessage request)
    {
        var key = (_options.ApiKey ?? string.Empty).Trim();
        if (!string.IsNullOrWhiteSpace(key))
        {
            request.Headers.Add("X-Stream-Api-Key", key);
        }
    }
}
