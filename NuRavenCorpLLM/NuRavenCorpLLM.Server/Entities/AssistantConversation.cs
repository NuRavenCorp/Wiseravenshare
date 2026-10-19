using System.ComponentModel.DataAnnotations;

namespace NuRavenCorpLLM.Entities;

public class AssistantConversation : BaseEntity
{
    public Guid UserId { get; set; }

    [MaxLength(255)]
    public string Title { get; set; } = string.Empty;

    public AssistantChannel Channel { get; set; } = AssistantChannel.Web;
    public AssistantPersona Persona { get; set; } = AssistantPersona.Default;

    public bool IsVoiceEnabled { get; set; } = true;
    public bool IsWebGroundingEnabled { get; set; } = true;
    public bool IsLearningEnabled { get; set; } = true;

    public string? VoiceId { get; set; }
    public string? SystemPromptOverride { get; set; }

    public int MessageCount { get; set; }
    public int TokenUsage { get; set; }
    public DateTime LastMessageAt { get; set; }

    // Navigation
    public virtual User User { get; set; } = null!;
    public virtual ICollection<AssistantMessage> Messages { get; set; } = new List<AssistantMessage>();
}

public enum AssistantChannel { Web, Mobile, Voice, Widget, Extension }

public enum AssistantPersona
{
    Default,
    Professional,
    Friendly,
    Concise,
    Creative,
    Technical,
    Educator
}
