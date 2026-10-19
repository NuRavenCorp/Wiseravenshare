// Core/Entities/Assistant/AssistantKnowledge.cs
using System.ComponentModel.DataAnnotations;
using System.Text.Json;

namespace NuRavenCorpLLM.Entities;

public class AssistantKnowledge : BaseEntity
{
    [MaxLength(500)]
    public string Title { get; set; } = string.Empty;

    public string Content { get; set; } = string.Empty;
    public string ContentHash { get; set; } = string.Empty;

    [MaxLength(100)]
    public string Source { get; set; } = "wiseravenshare";   // post | comment | doc | url

    [MaxLength(2000)]
    public string? SourceUrl { get; set; }

    [MaxLength(500)]
    public string? SourceId { get; set; }

    [MaxLength(100)]
    public string? Category { get; set; }

    public string[]? Tags { get; set; }

    public bool IsPublic { get; set; } = true;
    public bool IsApproved { get; set; }
    public Guid? ApprovedBy { get; set; }

    public JsonDocument? Metadata { get; set; }

    // Vector embedding stored as pgvector via raw column
    public float[]? Embedding { get; set; }

    public int TokenCount { get; set; }
}