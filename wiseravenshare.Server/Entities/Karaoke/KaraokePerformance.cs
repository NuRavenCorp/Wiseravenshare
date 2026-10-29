namespace Wiseravenshare.Server.Entities.Karaoke;

public enum PerformanceStatus
{
    Recording,
    Processing,
    Completed,
    Failed
}

public sealed class Performance
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid SongId { get; set; }
    public PerformanceStatus Status { get; set; } = PerformanceStatus.Recording;
    public DateTimeOffset StartedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public decimal? LyricScore { get; set; }
    public int? Matches { get; set; }
    public int? Substitutions { get; set; }
    public int? Missing { get; set; }
    public int? Extras { get; set; }
    public string? AlignmentBlobName { get; set; }
    public string? RecordingBlobName { get; set; }
    public DateTimeOffset? RecordingUploadExpiresAt { get; set; }
    public string? FailureReason { get; set; }
    public List<PerformanceTurn> Turns { get; set; } = [];
}

public sealed class PerformanceTurn
{
    public long Id { get; set; }
    public Guid PerformanceId { get; set; }
    public int TurnOrder { get; set; }
    public string Transcript { get; set; } = string.Empty;
    public long? StartMilliseconds { get; set; }
    public long? EndMilliseconds { get; set; }
    public Performance Performance { get; set; } = null!;
}
