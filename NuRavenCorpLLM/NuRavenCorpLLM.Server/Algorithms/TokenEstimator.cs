using System.Text.RegularExpressions;

namespace NuRavenCorpLLM.Server.Algorithms;

public class TokenEstimator
{
    private readonly ILogger<TokenEstimator> _logger;

    public TokenEstimator(ILogger<TokenEstimator> logger)
    {
        _logger = logger;
    }

    public int Estimate(string text)
    {
        if (string.IsNullOrEmpty(text)) return 0;

        var charCount = text.Length;
        var wordCount = CountWords(text);
        var codeLike = IsCodeLike(text);
        var nonLatin = CountNonLatinChars(text);

        double charEstimate = charCount / 4.0;
        double wordEstimate = wordCount * 1.35;
        double baseEstimate = (charEstimate + wordEstimate) / 2.0;

        if (codeLike) baseEstimate *= 1.25;

        double nonLatinRatio = charCount > 0 ? (double)nonLatin / charCount : 0;
        baseEstimate *= 1.0 + nonLatinRatio * 0.6;

        return (int)Math.Ceiling(baseEstimate);
    }

    public int EstimateTotal(IEnumerable<string> items) => items?.Sum(Estimate) ?? 0;

    public int EstimateMessage(string role, string content) => Estimate(content) + 4;

    public int EstimateConversation(IEnumerable<(string Role, string Content)> messages)
    {
        int total = 0;
        foreach (var (role, content) in messages)
            total += EstimateMessage(role, content);
        return total + 3;
    }

    public bool FitsWithin(string text, int maxTokens) => Estimate(text) <= maxTokens;

    public List<string> SplitToFit(string text, int maxTokensPerPiece)
    {
        if (FitsWithin(text, maxTokensPerPiece)) return new List<string> { text };

        var words = text.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var chunks = new List<string>();
        var buffer = new List<string>();
        int running = 0;

        foreach (var w in words)
        {
            int wTokens = Estimate(w);
            if (running + wTokens > maxTokensPerPiece && buffer.Count > 0)
            {
                chunks.Add(string.Join(' ', buffer));
                buffer.Clear();
                running = 0;
            }
            buffer.Add(w);
            running += wTokens;
        }

        if (buffer.Count > 0) chunks.Add(string.Join(' ', buffer));
        return chunks;
    }

    public decimal EstimateCost(int inputTokens, int outputTokens, decimal inputRatePer1K, decimal outputRatePer1K)
    {
        return (inputTokens / 1000m) * inputRatePer1K + (outputTokens / 1000m) * outputRatePer1K;
    }

    private static int CountWords(string text)
    {
        if (string.IsNullOrEmpty(text)) return 0;
        int count = 0;
        bool inWord = false;
        foreach (var c in text)
        {
            bool isWordChar = char.IsLetterOrDigit(c) || c == '_' || c == '\'';
            if (isWordChar && !inWord)
            {
                count++;
                inWord = true;
            }
            else if (!isWordChar)
            {
                inWord = false;
            }
        }
        return count;
    }

    private static bool IsCodeLike(string text)
    {
        if (text.Length < 40) return false;

        int codeSignals = 0;
        if (text.Contains("function ") || text.Contains("def ")) codeSignals++;
        if (text.Contains("class ") || text.Contains("interface ")) codeSignals++;
        if (text.Contains("{\n") || text.Contains(";\n")) codeSignals++;
        if (text.Contains("=>") || text.Contains("->")) codeSignals++;
        if (text.Contains("```")) codeSignals++;
        if (Regex.IsMatch(text, @"\b(public|private|protected|static|void|return)\b")) codeSignals++;

        return codeSignals >= 2;
    }

    private static int CountNonLatinChars(string text)
    {
        int count = 0;
        foreach (var c in text)
        {
            if (c > 0x024F && !char.IsWhiteSpace(c) && !char.IsPunctuation(c))
                count++;
        }
        return count;
    }
}
