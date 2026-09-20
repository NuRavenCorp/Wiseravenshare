namespace Wiseravenshare.Server.Entities.Crawler;

public enum CrawlJobStatus
{
    Pending,
    Running,
    Paused,
    Completed,
    Failed,
    Cancelled
}

public enum CrawlScope
{
    SinglePage,
    Section,
    FullSite,
    SitemapOnly,
    CustomList
}

public enum IssueCategory
{
    Seo,
    Performance,
    Accessibility,
    Security,
    Content,
    Links,
    Mobile,
    StructuredData,
    ServerConfiguration,
    Ux,
    BestPractices,
    Legal
}

public enum IssueSeverity
{
    Info,
    Low,
    Medium,
    High,
    Critical
}

public enum IssueType
{
    MissingTitle,
    TitleTooLong,
    TitleTooShort,
    MissingMetaDescription,
    MetaDescriptionTooLong,
    MultipleH1,
    MissingH1,
    SkippedHeadingLevels,
    MissingCanonical,
    MissingViewport,
    MissingOpenGraph,
    MissingTwitterCard,
    SlowResponseTime,
    LargePageSize,
    UncompressedImages,
    RenderBlockingResources,
    ExcessiveDomSize,
    NoCaching,
    MissingCompression,
    MissingAltText,
    MissingFormLabels,
    EmptyButtons,
    MissingLangAttribute,
    MissingHttps,
    MixedContent,
    MissingSecurityHeaders,
    ExposedServerInfo,
    ThinContent,
    DuplicateContent,
    BrokenImage,
    PlaceholderContent,
    BrokenInternalLink,
    BrokenExternalLink,
    OrphanPage,
    NotMobileFriendly,
    HorizontalScroll,
    MissingSchema,
    MissingFavicon,
    DeprecatedHtml
}

public enum ReportFormat
{
    Json,
    Csv,
    Html,
    Pdf
}
