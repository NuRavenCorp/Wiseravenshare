using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Wiseravenshare.Server.Entities.Crawler;

[Table("crawl_metrics")]
public class CrawlMetric : BaseEntity
{
    public Guid CrawlJobId { get; set; }

    [MaxLength(100)]
    public string MetricKey { get; set; } = string.Empty;

    public decimal Value { get; set; }

    [MaxLength(50)]
    public string? Unit { get; set; }

    [MaxLength(20)]
    public string Category { get; set; } = string.Empty;

    public DateTime RecordedAt { get; set; }

    public virtual CrawlJob CrawlJob { get; set; } = null!;
}
