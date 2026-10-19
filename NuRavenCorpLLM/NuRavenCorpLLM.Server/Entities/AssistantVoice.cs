// Core/Entities/Assistant/AssistantVoice.cs
using System.ComponentModel.DataAnnotations;

namespace NuRavenCorpLLM.Entities;

public class AssistantVoice : BaseEntity
{
    [MaxLength(100)]
    public string VoiceId { get; set; } = string.Empty;

    [MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(50)]
    public string Provider { get; set; } = "elevenlabs"; // elevenlabs | azure | openai

    [MaxLength(50)]
    public string Language { get; set; } = "en";

    [MaxLength(50)]
    public string? Accent { get; set; }

    [MaxLength(20)]
    public string Gender { get; set; } = "neutral";

    [MaxLength(500)]
    public string? PreviewUrl { get; set; }

    [MaxLength(100)]
    public string? ModelId { get; set; }

    public bool IsActive { get; set; } = true;
    public bool IsDefault { get; set; }
}