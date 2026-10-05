using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

namespace Wiseravenshare.Server.Services.AiAssistant;

/// <summary>
/// DigitalOcean Gradient AI Agentic Cloud chat service.
/// Uses OpenAI-compatible Inference API endpoints:
/// GET  {Gradient:BaseUrl}/models
/// POST {Gradient:BaseUrl}/chat/completions
/// Required config:
///   Gradient:InferenceKey (Bearer key)
/// Optional config:
///   Gradient:BaseUrl (default https://ingress.do-ai.run/v1)
///   Gradient:DefaultModel
/// </summary>
public class GradientChatService : IOllamaChatService
{
    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;
    private readonly ILogger<GradientChatService> _logger;

    private const string SystemPrompt =
        "You are the WiseRavenShare AI Assistant, an intelligent platform guide powered by NuRavenCorp. " +
        "WiseRavenShare is a comprehensive media, podcast, and social engagement platform for creators, journalists, and teams.\n\n" +
        "PLATFORM CAPABILITIES YOU CAN HELP WITH:\n" +
        "• Content creation: Ravensight video studio, newsroom recording, photo/audio management, Canvas design\n" +
        "• Social syndication: cross-post to Facebook, Instagram, TikTok, YouTube, Twitter/X, LinkedIn simultaneously\n" +
        "• Podcast Studio: multi-device recording, team workflows, Spotify/Apple Podcasts distribution\n" +
        "• My Library: unified media vault — videos, photos, music, audio, podcasts — with metadata management\n" +
        "• Wise-tracks (Music Player): personal music library, playlists, 30-song free tier, Creator Plan for unlimited\n" +
        "• Karaoke Party Room: vocal separation (htdemucs), real-time YIN pitch scoring, public domain catalogue\n" +
        "• Amateur Journalist / Dispatch: citizen reporting, evidence upload, credibility scoring, newsroom integration\n" +
        "• Truth Seeker: AI fact-checking, source analysis, viral claim monitoring, correction publishing\n" +
        "• WiseCoin: engagement currency, tipping, creator payouts, referral bonuses\n" +
        "• Subscriptions: WRS Growth Suite $39/mo, Studio Plus $79/mo, Podcast Pro Bundle $149/mo\n" +
        "• Team Launchpad: project workspaces, member roles, real-time collaboration, version control\n" +
        "• FM Radio Creator: launch your own internet radio station, monetise with ads and sponsorships\n" +
        "• Growth Analytics: follower tracking, audience insights, trending dashboard, reach scoring\n" +
        "• Gatekeeper & Admin Panel: content moderation, geo-blocking, rate limiting, bot detection\n" +
        "• Revenue Console: real-time earnings, subscription analytics, forecasting\n" +
        "• Site Crawler: full-site SEO and performance auditing with scored issue categories\n" +
        "• AI Assistant (you): platform guidance, writing help, research support, content suggestions\n\n" +
        "TONE: Be concise, warm, practical, and knowledgeable. " +
        "If a question is outside the platform, say so honestly and suggest contacting support@wiseravenshare.com. " +
        "Use the WiseRavenShare symbol notation when natural: $ = valuable/excellent, % = partial/incomplete.";

    public GradientChatService(HttpClient httpClient, IConfiguration configuration, ILogger<GradientChatService> logger)
    {
        _httpClient = httpClient;
        _configuration = configuration;
        _logger = logger;
    }

    private string BaseUrl => ResolveBaseUrl();

    private string DefaultModel => (_configuration["Gradient:DefaultModel"] ?? "gpt-4o-mini").Trim();

    private string InferenceKey => ResolveInferenceKey();

    private bool IsConfigured => !string.IsNullOrWhiteSpace(InferenceKey);

    private string ResolveBaseUrl()
    {
        var configured = FirstNonEmpty(
            _configuration["Gradient:BaseUrl"],
            _configuration["GRADIENT_BASE_URL"],
            _configuration["DIGITALOCEAN_AI_BASE_URL"],
            "https://ingress.do-ai.run/v1");

        var value = configured.Trim().TrimEnd('/');
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri))
        {
            return "https://ingress.do-ai.run/v1";
        }

        // DigitalOcean examples commonly omit /v1; normalize to the OpenAI-compatible base.
        if (uri.Host.Contains("do-ai.run", StringComparison.OrdinalIgnoreCase)
            && (uri.AbsolutePath == "/" || string.IsNullOrWhiteSpace(uri.AbsolutePath)))
        {
            return value + "/v1";
        }

        return value;
    }

    private string ResolveInferenceKey()
    {
        return FirstNonEmpty(
            _configuration["Gradient:InferenceKey"],
            _configuration["DO_GRADIENT_INFERENCE_KEY"],
            _configuration["GRADIENT_INFERENCE_KEY"],
            _configuration["DIGITALOCEAN_AI_INFERENCE_KEY"],
            _configuration["OPENAI_API_KEY"]);
    }

    private static string FirstNonEmpty(params string?[] values)
    {
        foreach (var value in values)
        {
            var trimmed = (value ?? string.Empty).Trim();
            if (!string.IsNullOrWhiteSpace(trimmed))
            {
                return trimmed;
            }
        }

        return string.Empty;
    }

    public async Task<IReadOnlyList<string>> GetModelsAsync()
    {
        if (!IsConfigured)
        {
            _logger.LogWarning("Gradient provider selected but Gradient:InferenceKey is missing.");
            return [];
        }

        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, $"{BaseUrl}/models");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", InferenceKey);
            using var response = await _httpClient.SendAsync(request);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Gradient model list failed with status {Status}", (int)response.StatusCode);
                return [];
            }

            var payload = await response.Content.ReadFromJsonAsync<JsonElement>();
            var models = new List<string>();
            if (payload.TryGetProperty("data", out var arr) && arr.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in arr.EnumerateArray())
                {
                    if (item.TryGetProperty("id", out var id))
                    {
                        var value = id.GetString();
                        if (!string.IsNullOrWhiteSpace(value))
                        {
                            models.Add(value.Trim());
                        }
                    }
                }
            }

            return models;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to list Gradient models.");
            return [];
        }
    }

    public async Task<AiChatResponse> ChatAsync(AiChatRequest request)
    {
        var message = (request.Message ?? string.Empty).Trim();
        if (message.Length == 0)
        {
            return new AiChatResponse { Success = false, Error = "Message is required." };
        }

        if (!IsConfigured)
        {
            return new AiChatResponse { Success = false, Error = "Gradient AI key is missing." };
        }

        var model = string.IsNullOrWhiteSpace(request.Model) ? DefaultModel : request.Model.Trim();
        var payload = new
        {
            model,
            messages = BuildMessages(request),
            stream = false,
            temperature = 0.6,
            max_tokens = 700
        };

        try
        {
            using var httpRequest = new HttpRequestMessage(HttpMethod.Post, $"{BaseUrl}/chat/completions")
            {
                Content = JsonContent.Create(payload)
            };
            httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", InferenceKey);

            using var response = await _httpClient.SendAsync(httpRequest);
            var body = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Gradient chat failed ({Status}): {Body}", (int)response.StatusCode, body);
                return new AiChatResponse
                {
                    Success = false,
                    Error = "Gradient AI assistant is unavailable right now."
                };
            }

            using var doc = JsonDocument.Parse(body);
            var reply = doc.RootElement.TryGetProperty("choices", out var choices)
                && choices.ValueKind == JsonValueKind.Array
                && choices.GetArrayLength() > 0
                && choices[0].TryGetProperty("message", out var msg)
                && msg.TryGetProperty("content", out var contentNode)
                ? contentNode.GetString()
                : string.Empty;

            return new AiChatResponse
            {
                Success = true,
                Reply = (reply ?? string.Empty).Trim(),
                Model = model
            };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Gradient chat threw unexpectedly.");
            return new AiChatResponse { Success = false, Error = "Unexpected Gradient AI error." };
        }
    }

    public async IAsyncEnumerable<string> ChatStreamAsync(AiChatRequest request, [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct = default)
    {
        var message = (request.Message ?? string.Empty).Trim();
        if (message.Length == 0)
        {
            yield return "Message is required.";
            yield break;
        }

        if (!IsConfigured)
        {
            yield return "Gradient AI key is missing.";
            yield break;
        }

        var model = string.IsNullOrWhiteSpace(request.Model) ? DefaultModel : request.Model.Trim();
        var payload = new
        {
            model,
            messages = BuildMessages(request),
            stream = true,
            temperature = 0.6,
            max_tokens = 700
        };

        HttpResponseMessage? response = null;
        try
        {
            var requestMessage = new HttpRequestMessage(HttpMethod.Post, $"{BaseUrl}/chat/completions")
            {
                Content = JsonContent.Create(payload)
            };
            requestMessage.Headers.Authorization = new AuthenticationHeaderValue("Bearer", InferenceKey);
            response = await _httpClient.SendAsync(requestMessage, HttpCompletionOption.ResponseHeadersRead, ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Gradient streaming request failed.");
        }

        using (response)
        {
            if (response is null || !response.IsSuccessStatusCode)
            {
                yield return "Gradient AI assistant is unavailable right now.";
                yield break;
            }

            await using var stream = await response.Content.ReadAsStreamAsync(ct);
            using var reader = new StreamReader(stream, Encoding.UTF8);

            while (!reader.EndOfStream && !ct.IsCancellationRequested)
            {
                var line = await reader.ReadLineAsync(ct);
                if (string.IsNullOrWhiteSpace(line) || !line.StartsWith("data:", StringComparison.Ordinal))
                {
                    continue;
                }

                var data = line[5..].Trim();
                if (data == "[DONE]")
                {
                    break;
                }

                string token = string.Empty;
                try
                {
                    using var doc = JsonDocument.Parse(data);
                    token = doc.RootElement.TryGetProperty("choices", out var choices)
                        && choices.ValueKind == JsonValueKind.Array
                        && choices.GetArrayLength() > 0
                        && choices[0].TryGetProperty("delta", out var delta)
                        && delta.TryGetProperty("content", out var contentNode)
                        ? contentNode.GetString() ?? string.Empty
                        : string.Empty;
                }
                catch
                {
                    // Ignore malformed stream frame.
                }

                if (!string.IsNullOrWhiteSpace(token))
                {
                    yield return token;
                }
            }
        }
    }

    private static List<object> BuildMessages(AiChatRequest request)
    {
        var messages = new List<object> { new { role = "system", content = SystemPrompt } };

        if (request.History is { Count: > 0 })
        {
            foreach (var h in request.History.TakeLast(12))
            {
                var role = h.Role?.ToLowerInvariant() is "assistant" or "ai" ? "assistant" : "user";
                messages.Add(new { role, content = Truncate(h.Content, 4000) });
            }
        }

        messages.Add(new { role = "user", content = Truncate(request.Message, 4000) });
        return messages;
    }

    private static string Truncate(string? value, int max)
    {
        var source = value ?? string.Empty;
        return source.Length <= max ? source : source[..max];
    }
}
