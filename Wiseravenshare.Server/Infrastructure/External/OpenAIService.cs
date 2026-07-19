using Wiseravenshare.Server.Services;

namespace Wiseravenshare.Server.Infrastructure.External;

public class OpenAIService : IOpenAIService
{
    public Task<string> GenerateAsync(string prompt)
    {
        return Task.FromResult("{}");
    }

    public Task<List<string>> ExtractClaimsAsync(string content)
    {
        return Task.FromResult(new List<string> { content });
    }

    public Task<AIVerificationResult> VerifyClaimAsync(string claim)
    {
        return Task.FromResult(new AIVerificationResult
        {
            IsTrue = true,
            Confidence = 0.7m,
            Explanation = "Stub verification result",
            Correction = null,
            Sources = new List<AIVerificationSource>()
        });
    }
}
