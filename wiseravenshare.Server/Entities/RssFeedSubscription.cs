using System.ComponentModel.DataAnnotations;

namespace Wiseravenshare.Server.Entities;

/// <summary>
/// A user's subscription to an RSS/Atom feed (or Facebook Graph feed).
/// Each record stores the feed URL, the platform hint, and the last
/// successful ingest timestamp so the background worker can avoid
/// redundant fetches.
/// </summary>
public class RssFeedSubscription : BaseEntity
{
    /// <summary>Owner.</summary>
    public Guid UserId { get; set; }

    /// <summary>
    /// The URL that is polled. For Facebook Graph feeds this is the
    /// pre-constructed Graph API URL; for RSS/Atom bridges it is the .xml URL.
    /// </summary>
    [MaxLength(2048)]
    public string FeedUrl { get; set; } = string.Empty;

    /// <summary>Display name shown in the UI (auto-derived from the first fetch).</summary>
    [MaxLength(200)]
    public string DisplayName { get; set; } = string.Empty;

    /// <summary>
    /// Platform hint: "rss", "atom", "facebook", "tiktok", "bluesky", "youtube".
    /// Defaults to "rss".
    /// </summary>
    [MaxLength(30)]
    public string Platform { get; set; } = "rss";

    /// <summary>Optional thumbnail / favicon URL shown in the UI.</summary>
    [MaxLength(500)]
    public string? FaviconUrl { get; set; }

    /// <summary>When the feed was last successfully polled.</summary>
    public DateTimeOffset? LastFetchedAt { get; set; }

    /// <summary>When the most recent item was published (for dedup).</summary>
    public DateTimeOffset? LastItemAt { get; set; }

    /// <summary>Consecutive fetch-failure counter. Paused after 5 failures.</summary>
    public int ConsecutiveErrors { get; set; }

    /// <summary>Whether the feed is active (user can pause without deleting).</summary>
    public bool IsActive { get; set; } = true;

    /// <summary>
    /// True for feeds seeded by server configuration (Social:SystemFeeds).
    /// System feeds are shared across all users; UserId is Guid.Empty for them.
    /// </summary>
    public bool IsSystemFeed { get; set; }

    public virtual User User { get; set; } = null!;
}

/// <summary>
/// A single item ingested from an RSS/social feed, stored so the UI can render
/// a beautified read-only card without hitting external APIs on every page load.
/// </summary>
public class RssFeedItem : BaseEntity
{
    public Guid SubscriptionId { get; set; }
    public Guid UserId { get; set; }

    /// <summary>
    /// Unique key used for deduplication: the item's &lt;guid&gt;, &lt;link&gt;, or
    /// the Graph API post id. SHA-256 hex of FeedUrl+ExternalId when no clean id exists.
    /// </summary>
    [MaxLength(512)]
    public string ExternalId { get; set; } = string.Empty;

    [MaxLength(30)]
    public string Platform { get; set; } = "rss";

    [MaxLength(500)]
    public string? Title { get; set; }

    public string? BodyText { get; set; }

    [MaxLength(2048)]
    public string? ImageUrl { get; set; }

    [MaxLength(2048)]
    public string? PermalinkUrl { get; set; }

    [MaxLength(200)]
    public string? SourceName { get; set; }

    [MaxLength(500)]
    public string? FaviconUrl { get; set; }

    public DateTimeOffset? PublishedAt { get; set; }

    public bool IsRead { get; set; }

    /// <summary>Copied from the subscription — true for server-configured feeds.</summary>
    public bool IsSystemFeed { get; set; }

    public virtual RssFeedSubscription Subscription { get; set; } = null!;
}
