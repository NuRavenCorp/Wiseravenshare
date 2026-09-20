using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using NuRavenCorpLLM.Server.Entities;

namespace NuRavenCorpLLM.Server.Entities.Knowledge;

public class KnowledgeDocument : BaseEntity
{
    public Guid? ClientSystemId { get; set; }

    [MaxLength(500)]
    public string Title { get; set; } = string.Empty;

    public string Content { get; set; } = string.Empty;

    [MaxLength(128)]
    public string ContentHash { get; set; } = string.Empty;

    [MaxLength(50)]
    public string SourceKind { get; set; } = "text";

    [MaxLength(2000)]
    public string? SourceUrl { get; set; }

    [MaxLength(200)]
    public string? Author { get; set; }

    [MaxLength(100)]
    public string? Language { get; set; } = "en";

    [MaxLength(100)]
    public string? Category { get; set; }

    public string[]? Tags { get; set; }
    public bool IsPublic { get; set; }
    public bool IsApproved { get; set; }
    public Guid? ApprovedBy { get; set; }
    public DateTime? ApprovedAt { get; set; }
    public int ChunkCount { get; set; }
    public int TotalTokens { get; set; }
    public JsonDocument? Metadata { get; set; }
    public DateTime? LastIndexedAt { get; set; }

    public virtual ICollection<KnowledgeChunk> Chunks { get; set; } = new List<KnowledgeChunk>();
    public virtual ICollection<KnowledgeVersion> Versions { get; set; } = new List<KnowledgeVersion>();
    public virtual ICollection<KnowledgeCollectionItem> CollectionItems { get; set; } = new List<KnowledgeCollectionItem>();
}

public class KnowledgeChunk : BaseEntity
{
    public Guid DocumentId { get; set; }
    public int ChunkIndex { get; set; }
    public string Content { get; set; } = string.Empty;

    [MaxLength(128)]
    public string ContentHash { get; set; } = string.Empty;

    public int TokenCount { get; set; }
    public float[]? Embedding { get; set; }

    [MaxLength(100)]
    public string? EmbeddingModel { get; set; }

    public int? EmbeddingDimensions { get; set; }
    public JsonDocument? Metadata { get; set; }
    public virtual KnowledgeDocument Document { get; set; } = null!;
}

public class KnowledgeCollection : BaseEntity
{
    public Guid? ClientSystemId { get; set; }

    [MaxLength(100)]
    public string Key { get; set; } = string.Empty;

    [MaxLength(255)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(1000)]
    public string? Description { get; set; }

    public bool IsActive { get; set; } = true;
    public bool IsPublic { get; set; }
    public int DocumentCount { get; set; }

    public virtual ICollection<KnowledgeCollectionItem> Items { get; set; } = new List<KnowledgeCollectionItem>();
}

public class KnowledgeCollectionItem : BaseEntity
{
    public Guid CollectionId { get; set; }
    public Guid DocumentId { get; set; }
    public int OrderIndex { get; set; }
    public virtual KnowledgeCollection Collection { get; set; } = null!;
    public virtual KnowledgeDocument Document { get; set; } = null!;
}

public class KnowledgeVersion : BaseEntity
{
    public Guid DocumentId { get; set; }
    public int VersionNumber { get; set; }
    public string Content { get; set; } = string.Empty;

    [MaxLength(128)]
    public string ContentHash { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? ChangeNotes { get; set; }

    public Guid? CreatedBy { get; set; }
    public JsonDocument? Delta { get; set; }
    public virtual KnowledgeDocument Document { get; set; } = null!;
}
