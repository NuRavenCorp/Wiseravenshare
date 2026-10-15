namespace WiseRavenShare.Server.Application.DTOs.Craft;

public class CraftDraftReviewRequest
{
    public string DomainKey { get; set; } = string.Empty;
    public string DraftContent { get; set; } = string.Empty;
    public string ContentType { get; set; } = "article";
    public string? Context { get; set; }
    public int? MaxPrinciples { get; set; } = 5;
}

public class CraftCoachingSuggestion
{
    public string PrincipleKey { get; set; } = string.Empty;
    public string PrincipleTitle { get; set; } = string.Empty;
    public string Feedback { get; set; } = string.Empty;
    public string? Example { get; set; }
    public string Severity { get; set; } = "medium"; // low, medium, high, critical
}

public class CraftDraftReviewResponse
{
    public Guid DraftReviewId { get; set; }
    public string Domain { get; set; } = string.Empty;
    public decimal OverallScore { get; set; }
    
    public List<string> Strengths { get; set; } = new();
    public List<CraftCoachingSuggestion> Improvements { get; set; } = new();
    public List<string> NextSteps { get; set; } = new();
    
    public List<string> RagContext { get; set; } = new(); // principle keys used in reasoning
    public string AiAnalysis { get; set; } = string.Empty;
    
    public int WordCount { get; set; }
    public DateTime ReviewedAt { get; set; } = DateTime.UtcNow;
}
