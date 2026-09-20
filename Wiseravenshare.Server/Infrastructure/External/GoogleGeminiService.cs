using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Wiseravenshare.Server.Interfaces.Services.External;

namespace Wiseravenshare.Server.Infrastructure.External;

public class GoogleGeminiService : IGoogleGeminiService
{
    private readonly HttpClient _httpClient;
    private readonly string? _apiKey;
    private readonly ILogger<GoogleGeminiService> _logger;

    public GoogleGeminiService(HttpClient httpClient, IConfiguration configuration, ILogger<GoogleGeminiService> logger)
    {
        _httpClient = httpClient;
        _logger = logger;
        _apiKey = configuration["Google:GeminiApiKey"] ?? configuration["GEMINI_API_KEY"];
    }

    public async Task<List<string>> ExtractTagsAsync(string content)
    {
        if (string.IsNullOrWhiteSpace(_apiKey))
        {
            _logger.LogWarning("Google Gemini API Key is missing. Falling back to heuristic tag extraction.");
            return ExtractHeuristicTags(content);
        }

        try
        {
            var prompt = $"Analyze the following content and extract up to 10 relevant categorization tags (genres, topics, moods, skills, or entities). Return ONLY a JSON array of strings:\n\n{content}";
            var requestBody = new
            {
                contents = new[]
                {
                    new { parts = new[] { new { text = prompt } } }
                },
                generationConfig = new { response_mime_type = "application/json" }
            };

            var response = await _httpClient.PostAsJsonAsync($"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={_apiKey}", requestBody);
            if (response.IsSuccessStatusCode)
            {
                var jsonResult = await response.Content.ReadFromJsonAsync<JsonElement>();
                var text = jsonResult.GetProperty("candidates")[0].GetProperty("content").GetProperty("parts")[0].GetProperty("text").GetString();

                if (!string.IsNullOrEmpty(text))
                {
                    var tags = JsonSerializer.Deserialize<List<string>>(text);
                    return tags ?? ExtractHeuristicTags(content);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to extract tags via Google Gemini AI Service.");
        }

        return ExtractHeuristicTags(content);
    }

    public async Task<float[]> GenerateEmbeddingAsync(string text)
    {
        if (string.IsNullOrWhiteSpace(_apiKey))
        {
            return Array.Empty<float>();
        }

        try
        {
            var requestBody = new
            {
                model = "models/text-embedding-004",
                content = new { parts = new[] { new { text } } }
            };

            var response = await _httpClient.PostAsJsonAsync($"https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key={_apiKey}", requestBody);
            if (response.IsSuccessStatusCode)
            {
                var jsonResult = await response.Content.ReadFromJsonAsync<JsonElement>();
                var values = jsonResult.GetProperty("embedding").GetProperty("values");

                var embeddings = new float[values.GetArrayLength()];
                int index = 0;
                foreach (var val in values.EnumerateArray())
                {
                    embeddings[index++] = val.GetSingle();
                }
                return embeddings;
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to generate embedding via Google Gemini Embedding API.");
        }

        return Array.Empty<float>();
    }

    public async Task<TrendAnalysisResultDto> AnalyzeTrendIntelligenceAsync(string crawledContent)
    {
        if (string.IsNullOrWhiteSpace(_apiKey))
        {
            return new TrendAnalysisResultDto
            {
                Topic = "Discovered Information",
                Category = "General",
                ImportanceScore = 0.75m,
                Sentiment = "Neutral",
                Keywords = ExtractHeuristicTags(crawledContent),
                Summary = crawledContent.Length > 200 ? crawledContent.Substring(0, 197) + "..." : crawledContent
            };
        }

        try
        {
            var prompt = $"Analyze this crawled web content for intelligence on importance, emerging trends, and issues. Return JSON matching: " +
                         "{ \"topic\": string, \"category\": string, \"importanceScore\": number (0.0 to 1.0), \"sentiment\": string, \"keywords\": string[], \"summary\": string }\n\nContent:\n" + crawledContent;

            var requestBody = new
            {
                contents = new[] { new { parts = new[] { new { text = prompt } } } },
                generationConfig = new { response_mime_type = "application/json" }
            };

            var response = await _httpClient.PostAsJsonAsync($"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={_apiKey}", requestBody);
            if (response.IsSuccessStatusCode)
            {
                var jsonResult = await response.Content.ReadFromJsonAsync<JsonElement>();
                var text = jsonResult.GetProperty("candidates")[0].GetProperty("content").GetProperty("parts")[0].GetProperty("text").GetString();

                if (!string.IsNullOrEmpty(text))
                {
                    return JsonSerializer.Deserialize<TrendAnalysisResultDto>(text, new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? new TrendAnalysisResultDto();
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to analyze trend intelligence via Google Gemini AI.");
        }

        return new TrendAnalysisResultDto
        {
            Topic = "Crawled Trend",
            Category = "General",
            ImportanceScore = 0.7m,
            Sentiment = "Neutral",
            Keywords = ExtractHeuristicTags(crawledContent),
            Summary = crawledContent.Length > 200 ? crawledContent.Substring(0, 197) + "..." : crawledContent
        };
    }

    public async Task<string> SummarizeContentAsync(string content)
    {
        if (string.IsNullOrWhiteSpace(_apiKey))
        {
            return content.Length > 250 ? content.Substring(0, 247) + "..." : content;
        }

        try
        {
            var prompt = $"Provide a concise 2-sentence summary of the following text:\n\n{content}";
            var requestBody = new
            {
                contents = new[] { new { parts = new[] { new { text = prompt } } } }
            };

            var response = await _httpClient.PostAsJsonAsync($"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={_apiKey}", requestBody);
            if (response.IsSuccessStatusCode)
            {
                var jsonResult = await response.Content.ReadFromJsonAsync<JsonElement>();
                return jsonResult.GetProperty("candidates")[0].GetProperty("content").GetProperty("parts")[0].GetProperty("text").GetString() ?? string.Empty;
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to summarize content via Google Gemini AI.");
        }

        return content.Length > 250 ? content.Substring(0, 247) + "..." : content;
    }

    private List<string> ExtractHeuristicTags(string content)
    {
        if (string.IsNullOrWhiteSpace(content)) return new List<string>();
        var words = content.Split(new[] { ' ', ',', '.', '!', '?', '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries)
                           .Where(w => w.Length > 4 && char.IsUpper(w[0]))
                           .Distinct()
                           .Take(8)
                           .ToList();

        return words.Count > 0 ? words : new List<string> { "General", "Trending", "Media" };
    }
}
