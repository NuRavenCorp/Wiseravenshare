using System.Text.RegularExpressions;

namespace NuRavenCorpLLM.Server.Algorithms;

public class ChunkingStrategy
{
    private readonly ILogger<ChunkingStrategy> _logger;

    public ChunkingStrategy(ILogger<ChunkingStrategy> logger)
    {
        _logger = logger;
    }

    public List<string> ChunkByTokens(string text, int maxTokens = 512, int overlapTokens = 64)
    {
        if (string.IsNullOrWhiteSpace(text)) return new List<string>();
        if (maxTokens <= 0) throw new ArgumentOutOfRangeException(nameof(maxTokens));
        if (overlapTokens < 0 || overlapTokens >= maxTokens)
            throw new ArgumentOutOfRangeException(nameof(overlapTokens));

        var words = text.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var chunks = new List<string>();
        int stride = Math.Max(1, maxTokens - overlapTokens);

        for (int i = 0; i < words.Length; i += stride)
        {
            var slice = words.Skip(i).Take(maxTokens).ToArray();
            if (slice.Length == 0) break;

            var chunk = string.Join(' ', slice).Trim();
            if (chunk.Length >= 32) chunks.Add(chunk);
        }

        return chunks;
    }

    public List<string> ChunkBySentences(string text, int maxTokens = 512, int overlapSentences = 1)
    {
        if (string.IsNullOrWhiteSpace(text)) return new List<string>();

        var sentences = SplitSentences(text);
        var chunks = new List<string>();
        var current = new List<string>();
        int currentTokens = 0;

        foreach (var sentence in sentences)
        {
            var tokens = EstimateTokens(sentence);

            if (currentTokens + tokens > maxTokens && current.Count > 0)
            {
                chunks.Add(string.Join(' ', current).Trim());

                if (overlapSentences > 0)
                {
                    current = current.TakeLast(overlapSentences).ToList();
                    currentTokens = current.Sum(EstimateTokens);
                }
                else
                {
                    current.Clear();
                    currentTokens = 0;
                }
            }

            current.Add(sentence);
            currentTokens += tokens;
        }

        if (current.Count > 0)
        {
            var final = string.Join(' ', current).Trim();
            if (final.Length >= 32) chunks.Add(final);
        }

        return chunks;
    }

    public List<string> ChunkByParagraphs(string text, int maxTokens = 512, int overlapParagraphs = 0)
    {
        if (string.IsNullOrWhiteSpace(text)) return new List<string>();

        var paragraphs = Regex.Split(text, @"\n\s*\n")
            .Select(p => p.Trim())
            .Where(p => !string.IsNullOrEmpty(p))
            .ToArray();

        var chunks = new List<string>();
        var current = new List<string>();
        int currentTokens = 0;

        foreach (var p in paragraphs)
        {
            var tokens = EstimateTokens(p);

            if (currentTokens + tokens > maxTokens && current.Count > 0)
            {
                chunks.Add(string.Join("\n\n", current));
                current = overlapParagraphs > 0
                    ? current.TakeLast(overlapParagraphs).ToList()
                    : new List<string>();
                currentTokens = current.Sum(EstimateTokens);
            }

            current.Add(p);
            currentTokens += tokens;
        }

        if (current.Count > 0) chunks.Add(string.Join("\n\n", current));

        return chunks;
    }

    public List<string> ChunkByLines(string text, int linesPerChunk = 40, int overlapLines = 5)
    {
        if (string.IsNullOrWhiteSpace(text)) return new List<string>();

        var lines = text.Split('\n');
        var chunks = new List<string>();
        int stride = Math.Max(1, linesPerChunk - overlapLines);

        for (int i = 0; i < lines.Length; i += stride)
        {
            var slice = lines.Skip(i).Take(linesPerChunk).ToArray();
            if (slice.Length == 0) break;

            var chunk = string.Join('\n', slice).TrimEnd();
            if (chunk.Length >= 32) chunks.Add(chunk);
        }

        return chunks;
    }

    public List<string> ChunkAuto(string text, int maxTokens = 512)
    {
        if (string.IsNullOrWhiteSpace(text)) return new List<string>();

        bool looksLikeCode = text.Contains("```") ||
                             text.Contains("function ") ||
                             text.Contains("public class ") ||
                             text.Contains(";") && text.Count(c => c == '\n') > 30;

        bool hasParagraphs = Regex.IsMatch(text, @"\n\s*\n");
        bool hasSentences = Regex.IsMatch(text, @"[.!?]\s");

        if (looksLikeCode) return ChunkByLines(text);
        if (hasParagraphs) return ChunkByParagraphs(text, maxTokens);
        if (hasSentences) return ChunkBySentences(text, maxTokens);
        return ChunkByTokens(text, maxTokens);
    }

    private static IEnumerable<string> SplitSentences(string text)
    {
        var pattern = "(?<=[.!?])\\s+(?=[A-Z\"'\\u201C\\u2018])";
        var raw = Regex.Split(text, pattern);

        var result = new List<string>();
        var buffer = "";

        foreach (var piece in raw)
        {
            var p = piece.Trim();
            if (p.Length == 0) continue;

            if (p.Length < 12 && buffer.Length > 0)
                buffer += " " + p;
            else
            {
                if (buffer.Length > 0) result.Add(buffer.Trim());
                buffer = p;
            }
        }

        if (buffer.Length > 0) result.Add(buffer.Trim());
        return result;
    }

    private static int EstimateTokens(string s) => (int)Math.Ceiling(s.Length / 4.0);
}
