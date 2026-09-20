using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Wiseravenshare.Server.Entities.Crawler;

[Table("crawl_links")]
public class CrawlLink : BaseEntity
{
    public Guid CrawlJobId { get; set; }
    public Guid? SourcePageId { get; set; }
    public Guid? TargetPageId { get; set; }

    [MaxLength(2000)]
    public string SourceUrl { get; set; } = string.Empty;

    [MaxLength(2000)]
    public string TargetUrl { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? AnchorText { get; set; }

    public bool IsInternal { get; set; }
    public bool IsNofollow { get; set; }
    public bool IsSponsored { get; set; }
    public bool IsUgc { get; set; }
    public int? HttpStatus { get; set; }
    public bool IsBroken { get; set; }
    public int RedirectCount { get; set; }

    public virtual CrawlJob CrawlJob { get; set; } = null!;
    public virtual CrawledPage? SourcePage { get; set; }
    public virtual CrawledPage? TargetPage { get; set; }
}
