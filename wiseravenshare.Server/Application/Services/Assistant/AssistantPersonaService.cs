using WiseRavenShare.Server.Entities.Assistant;

namespace WiseRavenShare.Server.Application.Services.Assistant;

public interface IAssistantPersonaService
{
    string BuildSystemPrompt(AssistantPersona persona, string basePrompt);
    double GetTemperature(AssistantPersona persona);
    bool RequiresWebGrounding(AssistantPersona persona, string userText);
}

public class AssistantPersonaService : IAssistantPersonaService
{
    private static readonly HashSet<string> WebTriggers = new(StringComparer.OrdinalIgnoreCase)
    {
        "today", "now", "current", "latest", "recent", "news", "weather",
        "price", "stock", "who won", "what happened", "2024", "2025", "2026"
    };

    public string BuildSystemPrompt(AssistantPersona persona, string basePrompt)
    {
        var style = persona switch
        {
            AssistantPersona.Professional => "Respond in a professional, business-appropriate tone.",
            AssistantPersona.Friendly => "Respond in a warm, friendly, conversational tone.",
            AssistantPersona.Concise => "Be extremely concise. Prefer bullet points. No filler.",
            AssistantPersona.Creative => "Be creative and imaginative; suggest novel ideas.",
            AssistantPersona.Technical => "Use precise technical language; include code when appropriate.",
            AssistantPersona.Educator => "Explain step by step; assume the user is learning.",
            _ => "Be helpful, accurate, and clear."
        };
        return basePrompt.Trim() + "\n\n" + style;
    }

    public double GetTemperature(AssistantPersona persona) => persona switch
    {
        AssistantPersona.Technical => 0.2,
        AssistantPersona.Professional => 0.4,
        AssistantPersona.Educator => 0.5,
        AssistantPersona.Concise => 0.3,
        AssistantPersona.Creative => 1.0,
        _ => 0.7
    };

    public bool RequiresWebGrounding(AssistantPersona persona, string userText)
        => WebTriggers.Any(t => userText.Contains(t, StringComparison.OrdinalIgnoreCase))
           || userText.EndsWith("?");
}
