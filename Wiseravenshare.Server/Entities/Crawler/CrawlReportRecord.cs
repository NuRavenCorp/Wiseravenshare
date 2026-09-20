using System.ComponentModel.DataAnnotations.Schema;

namespace Wiseravenshare.Server.Entities.Crawler;

[Table("crawl_reports")]
public class CrawlReportRecord : BaseEntity
{
    public Guid CrawlJobId { get; set; }
    public ReportFormat Format { get; set; }
    public string ContentType { get; set; } = "application/octet-stream";
    public byte[] RawData { get; set; } = [];
    public DateTime GeneratedAt { get; set; } = DateTime.UtcNow;

    public virtual CrawlJob CrawlJob { get; set; } = null!;
}
