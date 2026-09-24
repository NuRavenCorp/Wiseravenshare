using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Wiseravenshare.Server.Entities;

namespace Wiseravenshare.Server.Entities.Stream;

public enum StreamTransferStatus
{
    Pending,
    AutoScreening,
    GatekeeperReview,
    Approved,
    Uploading,
    Ready,
    Failed,
    Rejected,
    AutoBlocked,
    Cancelled
}

public class StreamTransfer : BaseEntity
{
    [Required, MaxLength(200)]
    public string SourceContentId { get; set; } = string.Empty;

    [Required, MaxLength(200)]
    public string SourceCreatorId { get; set; } = string.Empty;

    [Required, MaxLength(2048)]
    public string VideoUrl { get; set; } = string.Empty;

    [Required, MaxLength(500)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(4000)]
    public string? Description { get; set; }

    public long FileSizeBytes { get; set; }

    [MaxLength(100)]
    public string? MimeType { get; set; }

    public StreamTransferStatus Status { get; set; } = StreamTransferStatus.Pending;

    [MaxLength(200)]
    public string? StreamVideoUid { get; set; }

    public DateTime? PublishedAt { get; set; }

    public int RetryCount { get; set; }

    // Rubric results stored as JSON for flexibility
    public string? RubricResultJson { get; set; }

    // Navigation
    public ICollection<StreamGatekeeperDecision> Decisions { get; set; } = new List<StreamGatekeeperDecision>();
}

public class StreamGatekeeperDecision : BaseEntity
{
    public Guid TransferId { get; set; }

    [ForeignKey(nameof(TransferId))]
    public StreamTransfer? Transfer { get; set; }

    [Required, MaxLength(200)]
    public string AdminId { get; set; } = string.Empty;

    [Required, MaxLength(50)]
    public string Action { get; set; } = string.Empty; // Cleared, RequiresEdit, Escalated, Rejected

    [Required, MaxLength(2000)]
    public string Rationale { get; set; } = string.Empty;

    public DateTime DecidedAt { get; set; } = DateTime.UtcNow;
}
