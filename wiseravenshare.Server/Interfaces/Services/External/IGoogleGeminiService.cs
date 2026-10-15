namespace Wiseravenshare.Server.Interfaces.Services.External;

public interface IGoogleGeminiService
{
    Task<List<string>> ExtractTagsAsync(string content);
    Task<float[]> GenerateEmbeddingAsync(string text);
    Task<TrendAnalysisResultDto> AnalyzeTrendIntelligenceAsync(string crawledContent);
    Task<string> SummarizeContentAsync(string content);
}

public class TrendAnalysisResultDto
{
    public string Topic { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public decimal ImportanceScore { get; set; } = 0.8m;
    public string Sentiment { get; set; } = "Neutral";
    public List<string> Keywords { get; set; } = new();
    public string Summary { get; set; } = string.Empty;
}
