namespace NuRavenCorpLLM.Entities;

public class Assistants : BaseEntity
{
    public Guid UserId { get; set; }

    public string Name { get; set; } = string.Empty;
    public AssistantPersona Persona { get; set; } = AssistantPersona.Default;
    public string? SystemPrompt { get; set; }
    public string? Model { get; set; }
    public bool IsEnabled { get; set; } = true;
    public DateTime? LastUsedAt { get; set; }
}
