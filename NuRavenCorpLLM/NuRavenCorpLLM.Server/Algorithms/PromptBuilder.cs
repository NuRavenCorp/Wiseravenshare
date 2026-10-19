using System.Text;
using NuRavenCorpLLM.Server.Entities.Clients;
using NuRavenCorpLLM.Server.Entities.Craft;
using NuRavenCorpLLM.Server.Entities.Knowledge;

namespace NuRavenCorpLLM.Server.Algorithms;

public class PromptBuilder
{
    private readonly ILogger<PromptBuilder> _logger;

    public PromptBuilder(ILogger<PromptBuilder> logger)
    {
        _logger = logger;
    }

    public string BuildBaseSystemPrompt(ClientSystem? client, string? persona)
    {
        var sb = new StringBuilder();
        sb.AppendLine("You are NuRaven, an advanced language model operating inside the NuRavenCorp LLM platform.");
        sb.AppendLine("You serve multiple independent client systems. You do not assume any single platform's context.");
        sb.AppendLine();

        if (client != null)
        {
            sb.AppendLine($"CURRENT CLIENT: {client.DisplayName} (key: {client.Key})");
            if (!string.IsNullOrEmpty(client.SystemPromptOverride))
            {
                sb.AppendLine("CLIENT DIRECTIVES:");
                sb.AppendLine(client.SystemPromptOverride.Trim());
            }
            sb.AppendLine();
        }

        sb.AppendLine("CORE BEHAVIOR:");
        sb.AppendLine("- Be accurate. Do not fabricate facts, figures, or citations.");
        sb.AppendLine("- When grounded context is provided, prefer it over your priors.");
        sb.AppendLine("- When you use retrieved knowledge, cite the source by title.");
        sb.AppendLine("- If you are uncertain, say so explicitly and suggest the next verification step.");
        sb.AppendLine("- Respect the client's scope boundaries. Never expose one client's data to another.");
        sb.AppendLine("- Never reveal API keys, internal IDs, or infrastructure details.");
        sb.AppendLine();

        if (!string.IsNullOrWhiteSpace(persona))
        {
            sb.AppendLine("PERSONA STYLE:");
            sb.AppendLine(persona.Trim());
        }

        return sb.ToString();
    }

    public string BuildKnowledgeContext(IReadOnlyList<KnowledgeChunk> chunks)
    {
        if (chunks.Count == 0) return string.Empty;

        var sb = new StringBuilder();
        sb.AppendLine("RETRIEVED KNOWLEDGE (cite by title when used):");
        sb.AppendLine();

        foreach (var c in chunks)
        {
            sb.AppendLine($"### {c.Document?.Title ?? "Untitled"}");
            if (!string.IsNullOrEmpty(c.Document?.SourceUrl))
                sb.AppendLine($"Source URL: {c.Document.SourceUrl}");
            if (!string.IsNullOrEmpty(c.Document?.SourceKind))
                sb.AppendLine($"Source kind: {c.Document.SourceKind}");
            sb.AppendLine();
            sb.AppendLine(c.Content);
            sb.AppendLine();
        }

        return sb.ToString();
    }

    public string BuildCraftContext(IReadOnlyList<CraftPrinciple> principles, IReadOnlyList<CraftInsight> insights)
    {
        if (principles.Count == 0 && insights.Count == 0) return string.Empty;

        var sb = new StringBuilder();
        sb.AppendLine("CRAFT CONTEXT (apply when relevant):");
        sb.AppendLine();

        if (principles.Count > 0)
        {
            sb.AppendLine("PRINCIPLES:");
            foreach (var p in principles)
                sb.AppendLine($"- [{p.Kind}] {p.Title}: {p.Body}");
            sb.AppendLine();
        }

        if (insights.Count > 0)
        {
            sb.AppendLine("INSIGHTS:");
            foreach (var i in insights)
                sb.AppendLine($"- {i.Title}: {i.Content}");
        }

        return sb.ToString();
    }

    public string CombineContexts(params string[] contexts)
    {
        var nonEmpty = contexts.Where(c => !string.IsNullOrWhiteSpace(c)).ToArray();
        if (nonEmpty.Length == 0) return string.Empty;

        var sb = new StringBuilder();
        sb.AppendLine("=== GROUNDED CONTEXT ===");
        sb.AppendLine();
        foreach (var c in nonEmpty)
        {
            sb.AppendLine(c.Trim());
            sb.AppendLine();
        }
        sb.AppendLine("=== END CONTEXT ===");
        return sb.ToString();
    }

    public string BuildConversationSummaryPrompt(string fullTranscript, int maxWords = 250)
    {
        return $"""
            Summarize the following conversation in at most {maxWords} words.
            Preserve: user goals, decisions, open questions, and any factual claims introduced.
            Do not invent details.

            CONVERSATION:
            {fullTranscript}
            """;
    }

    public string BuildStructuredExtractionPrompt(string schemaDescription, string rawInput)
    {
        return $"""
            Extract structured data from the input below. Return strict JSON that matches:
            {schemaDescription}

            Rules:
            - Output only valid JSON. No commentary.
            - If a value is unknown, use null.
            - Never invent values that are not present in the input.

            INPUT:
            {rawInput}
            """;
    }
}
