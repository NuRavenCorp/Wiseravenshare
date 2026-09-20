// Application/Algorithms/ChunkingStrategy.cs
namespace NuRavenCorpLLM.Application.Algtorithms;

public static class ChunkingStrategy
{
    public static List<string> Chunk(string text, int maxTokens, int overlap)
    {
        if (string.IsNullOrWhiteSpace(text)) return new();
        var words = text.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var chunks = new List<string>();
        int stride = Math.Max(1, maxTokens - overlap);
        for (int i = 0; i < words.Length; i += stride)
        {
            var slice = words.Skip(i).Take(maxTokens).ToArray();
            if (slice.Length == 0) break;
            chunks.Add(string.Join(' ', slice));
        }
        return chunks;
    }

    public static int EstimateTokens(string text)
        => (int)Math.Ceiling(text.Length / 4.0);   // rough heuristic
}