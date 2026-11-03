using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using NuRavenCorpLLM.Services;

namespace NuRavenCorpLLM.Infrastructure.External;

public class ModelServingOptions
{
    public bool Enabled { get; set; }
    public string BaseUrl { get; set; } = string.Empty;
    public string GeneratePath { get; set; } = "/generate";
    public int MaxNewTokens { get; set; } = 120;
    public double Temperature { get; set; } = 0.7;
    public int TimeoutSeconds { get; set; } = 60;
}

public sealed class HybridLlmGateway : ILlmGateway
{
    private readonly HttpClient _http;
    private readonly OpenAiClient _openAi;
    private readonly ILogger<HybridLlmGateway> _logger;
    private readonly ModelServingOptions _modelServing;

    public HybridLlmGateway(
        HttpClient http,
        OpenAiClient openAi,
        IOptions<ModelServingOptions> modelServingOptions,
        ILogger<HybridLlmGateway> logger)
    {
        _http = http;
        _openAi = openAi;
        _logger = logger;
        _modelServing = modelServingOptions.Value;

        if (!string.IsNullOrWhiteSpace(_modelServing.BaseUrl) &&
            Uri.TryCreate(_modelServing.BaseUrl, UriKind.Absolute, out var uri))
        {
            _http.BaseAddress = uri;
        }
        _http.Timeout = TimeSpan.FromSeconds(Math.Clamp(_modelServing.TimeoutSeconds, 5, 300));
    }

    public async Task<LlmResponse> CompleteAsync(LlmRequest request, CancellationToken ct = default)
    {
        if (!ShouldUseModelServing())
        {
            return await _openAi.CompleteAsync(request, ct);
        }

        var prompt = BuildPrompt(request);
        var payload = new
        {
            prompt,
            max_new_tokens = Math.Clamp(request.MaxTokens, 1, Math.Max(1, _modelServing.MaxNewTokens)),
            temperature = request.Temperature > 0 ? request.Temperature : _modelServing.Temperature
        };

        var path = NormalizePath(_modelServing.GeneratePath);

        try
        {
            using var content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
            using var response = await _http.PostAsync(path, content, ct);
            response.EnsureSuccessStatusCode();

            using var stream = await response.Content.ReadAsStreamAsync(ct);
            using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
            var root = doc.RootElement;

            var text = root.TryGetProperty("text", out var txt)
                ? txt.GetString() ?? string.Empty
                : root.ToString();

            return new LlmResponse
            {
                Content = text,
                Model = "local-model-serving",
                PromptTokens = 0,
                CompletionTokens = 0
            };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Model serving request failed. Falling back to OpenAI.");
            return await _openAi.CompleteAsync(request, ct);
        }
    }

    public async IAsyncEnumerable<LlmStreamChunk> StreamAsync(
        LlmRequest request,
        [EnumeratorCancellation] CancellationToken ct = default)
    {
        LlmResponse response;
        try
        {
            response = await CompleteAsync(request, ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Completion failed in HybridLlmGateway stream.");
            throw;
        }

        if (!string.IsNullOrEmpty(response.Content))
        {
            yield return new LlmStreamChunk(response.Content, false);
        }

        yield return new LlmStreamChunk(null, true, response.PromptTokens, response.CompletionTokens);
    }

    public Task<float[]> EmbedAsync(string text, CancellationToken ct = default)
        => _openAi.EmbedAsync(text, ct);

    private bool ShouldUseModelServing()
        => _modelServing.Enabled &&
           !string.IsNullOrWhiteSpace(_modelServing.BaseUrl) &&
           _http.BaseAddress is not null;

    private static string NormalizePath(string? path)
    {
        var p = string.IsNullOrWhiteSpace(path) ? "/generate" : path.Trim();
        return p.StartsWith("/", StringComparison.Ordinal) ? p : "/" + p;
    }

    private static string BuildPrompt(LlmRequest request)
    {
        var sb = new StringBuilder();
        if (!string.IsNullOrWhiteSpace(request.SystemPrompt))
        {
            sb.AppendLine(request.SystemPrompt.Trim());
            sb.AppendLine();
        }

        foreach (var message in request.Messages)
        {
            if (string.IsNullOrWhiteSpace(message.Content))
            {
                continue;
            }

            sb.Append('[')
              .Append(message.Role)
              .Append("] ")
              .AppendLine(message.Content.Trim());
        }

        return sb.ToString().Trim();
    }
}
