namespace Wiseravenshare.Server.Services;

public interface IOpenAIService
{
    Task<string> GenerateAsync(string prompt);
    Task<List<string>> ExtractClaimsAsync(string content);
    Task<AIVerificationResult> VerifyClaimAsync(string claim);
}

public class AIVerificationResult
{
    public bool IsTrue { get; set; }
    public decimal Confidence { get; set; }
    public string? Correction { get; set; }
    public string? Explanation { get; set; }
    public List<AIVerificationSource> Sources { get; set; } = new();
}

public class AIVerificationSource
{
    public string Name { get; set; } = string.Empty;
    public string Url { get; set; } = string.Empty;
    public decimal Confidence { get; set; }
    public string Verdict { get; set; } = string.Empty;
}
