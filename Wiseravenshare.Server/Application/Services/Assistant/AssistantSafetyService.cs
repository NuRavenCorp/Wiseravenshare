using System.Text.RegularExpressions;

namespace WiseRavenShare.Server.Application.Services.Assistant;

public interface IAssistantSafetyService
{
    Task<bool> IsSafeAsync(string userText, CancellationToken ct = default);
    Task<bool> IsSafeForTrainingAsync(string a, string? b = null);
}

public class AssistantSafetyService : IAssistantSafetyService
{
    private static readonly string[] BlockedPatterns =
    {
        @"\b(?:social security|ssn)\b.*\b\d{3}-?\d{2}-?\d{4}\b",
        @"\b(?:\d[ -]*?){13,16}\b",
        @"\bhow (?:to|do i) (?:make|build) (?:a )?(?:bomb|explosive)\b",
        @"\b(?:csam|child (?:porn|sexual))\b"
    };

    private static readonly Regex BlockedRegex = new(
        string.Join('|', BlockedPatterns),
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private static readonly string[] BlockedWords = { "kill yourself", "kys", "dox", "swatting" };

    public Task<bool> IsSafeAsync(string userText, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(userText)) return Task.FromResult(false);
        if (BlockedRegex.IsMatch(userText)) return Task.FromResult(false);
        var lower = userText.ToLowerInvariant();
        if (BlockedWords.Any(lower.Contains)) return Task.FromResult(false);
        return Task.FromResult(true);
    }

    public Task<bool> IsSafeForTrainingAsync(string a, string? b = null)
    {
        if (string.IsNullOrWhiteSpace(a)) return Task.FromResult(false);
        if (BlockedRegex.IsMatch(a)) return Task.FromResult(false);
        if (!string.IsNullOrEmpty(b) && BlockedRegex.IsMatch(b)) return Task.FromResult(false);
        return Task.FromResult(true);
    }
}
