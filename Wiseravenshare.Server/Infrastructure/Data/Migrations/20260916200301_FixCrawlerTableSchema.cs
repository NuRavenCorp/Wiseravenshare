using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Wiseravenshare.Server.Infrastructure.Data.Migrations
{
    /// <summary>
    /// Drops the snake_case crawler tables (auto-created by EnsureCrawlerTablesAsync)
    /// and recreates them with PascalCase column names that match EF Core's default mappings.
    /// </summary>
    public partial class FixCrawlerTableSchema : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Drop old snake_case tables if they exist (no production data yet)
            migrationBuilder.Sql("""
                DROP TABLE IF EXISTS app_data.crawl_issues;
                DROP TABLE IF EXISTS app_data.crawl_links;
                DROP TABLE IF EXISTS app_data.crawl_metrics;
                DROP TABLE IF EXISTS app_data.crawl_reports;
                DROP TABLE IF EXISTS app_data.crawled_pages;
                DROP TABLE IF EXISTS app_data.crawl_jobs;
                """);

            // Recreate with PascalCase columns to match EF Core expectations
            migrationBuilder.Sql("""
                CREATE TABLE IF NOT EXISTS app_data.crawl_jobs (
                    "Id" uuid NOT NULL,
                    "StartUrl" character varying(500) NOT NULL,
                    "JobName" character varying(100) NOT NULL,
                    "Status" integer NOT NULL,
                    "Scope" integer NOT NULL,
                    "MaxPages" integer NOT NULL,
                    "MaxDepth" integer NOT NULL,
                    "RequestsPerSecond" integer NOT NULL,
                    "RespectRobotsTxt" boolean NOT NULL,
                    "RenderJavaScript" boolean NOT NULL,
                    "CaptureScreenshots" boolean NOT NULL,
                    "FollowExternalLinks" boolean NOT NULL,
                    "IncludePatterns" text[] NULL,
                    "ExcludePatterns" text[] NULL,
                    "CustomUserAgents" text[] NULL,
                    "PagesDiscovered" integer NOT NULL DEFAULT 0,
                    "PagesCrawled" integer NOT NULL DEFAULT 0,
                    "PagesFailed" integer NOT NULL DEFAULT 0,
                    "PagesSkipped" integer NOT NULL DEFAULT 0,
                    "IssuesFound" integer NOT NULL DEFAULT 0,
                    "StartedAt" timestamp with time zone NULL,
                    "CompletedAt" timestamp with time zone NULL,
                    "ElapsedMilliseconds" bigint NOT NULL DEFAULT 0,
                    "OverallHealthScore" numeric NOT NULL DEFAULT 0,
                    "SeoScore" numeric NOT NULL DEFAULT 0,
                    "PerformanceScore" numeric NOT NULL DEFAULT 0,
                    "AccessibilityScore" numeric NOT NULL DEFAULT 0,
                    "SecurityScore" numeric NOT NULL DEFAULT 0,
                    "ContentScore" numeric NOT NULL DEFAULT 0,
                    "Configuration" jsonb NULL,
                    "Summary" jsonb NULL,
                    "CreatedById" uuid NOT NULL,
                    "CreatedAt" timestamp with time zone NOT NULL,
                    "UpdatedAt" timestamp with time zone NOT NULL,
                    "IsDeleted" boolean NOT NULL DEFAULT false,
                    "DeletedAt" timestamp with time zone NULL,
                    CONSTRAINT "PK_crawl_jobs" PRIMARY KEY ("Id")
                );
                CREATE INDEX IF NOT EXISTS "IX_crawl_jobs_CreatedById_CreatedAt" ON app_data.crawl_jobs ("CreatedById", "CreatedAt");

                CREATE TABLE IF NOT EXISTS app_data.crawled_pages (
                    "Id" uuid NOT NULL,
                    "CrawlJobId" uuid NOT NULL,
                    "Url" character varying(2000) NOT NULL,
                    "CanonicalUrl" character varying(500) NULL,
                    "Title" character varying(200) NULL,
                    "MetaDescription" character varying(500) NULL,
                    "StatusCode" integer NOT NULL,
                    "ResponseTimeMs" integer NOT NULL DEFAULT 0,
                    "ContentSizeBytes" bigint NOT NULL DEFAULT 0,
                    "ContentType" character varying(50) NULL,
                    "Depth" integer NOT NULL DEFAULT 0,
                    "WordCount" integer NOT NULL DEFAULT 0,
                    "ImageCount" integer NOT NULL DEFAULT 0,
                    "InternalLinkCount" integer NOT NULL DEFAULT 0,
                    "ExternalLinkCount" integer NOT NULL DEFAULT 0,
                    "ScriptCount" integer NOT NULL DEFAULT 0,
                    "StyleSheetCount" integer NOT NULL DEFAULT 0,
                    "HasH1" boolean NOT NULL DEFAULT false,
                    "H1Count" integer NOT NULL DEFAULT 0,
                    "H2Count" integer NOT NULL DEFAULT 0,
                    "H3Count" integer NOT NULL DEFAULT 0,
                    "HasMetaRobots" boolean NOT NULL DEFAULT false,
                    "MetaRobots" text NULL,
                    "HasCanonical" boolean NOT NULL DEFAULT false,
                    "HasViewportMeta" boolean NOT NULL DEFAULT false,
                    "HasOpenGraph" boolean NOT NULL DEFAULT false,
                    "HasTwitterCard" boolean NOT NULL DEFAULT false,
                    "FirstContentfulPaintMs" integer NULL,
                    "LargestContentfulPaintMs" integer NULL,
                    "TimeToInteractiveMs" integer NULL,
                    "TotalBlockingTimeMs" integer NULL,
                    "CumulativeLayoutShift" numeric(18,4) NULL,
                    "PageSpeedScore" integer NULL,
                    "AccessibilityScore" integer NULL,
                    "AxeViolations" integer NOT NULL DEFAULT 0,
                    "ContentHash" character varying(128) NULL,
                    "IsIndexable" boolean NOT NULL DEFAULT true,
                    "IsDuplicate" boolean NOT NULL DEFAULT false,
                    "DuplicateOfPageId" uuid NULL,
                    "SchemaTypes" text[] NULL,
                    "ScreenshotUrl" text NULL,
                    "MobileScreenshotUrl" text NULL,
                    "HtmlSnapshot" text NULL,
                    "Headers" jsonb NULL,
                    "SeoData" jsonb NULL,
                    "PerformanceData" jsonb NULL,
                    "AccessibilityData" jsonb NULL,
                    "CreatedAt" timestamp with time zone NOT NULL,
                    "UpdatedAt" timestamp with time zone NOT NULL,
                    "IsDeleted" boolean NOT NULL DEFAULT false,
                    "DeletedAt" timestamp with time zone NULL,
                    CONSTRAINT "PK_crawled_pages" PRIMARY KEY ("Id"),
                    CONSTRAINT "FK_crawled_pages_crawl_jobs_CrawlJobId"
                        FOREIGN KEY ("CrawlJobId") REFERENCES app_data.crawl_jobs("Id") ON DELETE CASCADE
                );
                CREATE UNIQUE INDEX IF NOT EXISTS "IX_crawled_pages_CrawlJobId_Url" ON app_data.crawled_pages ("CrawlJobId", "Url");

                CREATE TABLE IF NOT EXISTS app_data.crawl_issues (
                    "Id" uuid NOT NULL,
                    "CrawlJobId" uuid NOT NULL,
                    "PageId" uuid NULL,
                    "Category" integer NOT NULL,
                    "Severity" integer NOT NULL,
                    "Type" integer NOT NULL DEFAULT 0,
                    "Code" character varying(200) NOT NULL,
                    "Title" character varying(500) NOT NULL,
                    "Description" character varying(2000) NOT NULL,
                    "Recommendation" character varying(2000) NULL,
                    "Evidence" character varying(2000) NULL,
                    "Tags" text[] NULL,
                    "Context" jsonb NULL,
                    "IsFixed" boolean NOT NULL DEFAULT false,
                    "FixedAt" timestamp with time zone NULL,
                    "FixedById" uuid NULL,
                    "Priority" integer NOT NULL DEFAULT 0,
                    "CreatedAt" timestamp with time zone NOT NULL,
                    "UpdatedAt" timestamp with time zone NOT NULL,
                    "IsDeleted" boolean NOT NULL DEFAULT false,
                    "DeletedAt" timestamp with time zone NULL,
                    CONSTRAINT "PK_crawl_issues" PRIMARY KEY ("Id"),
                    CONSTRAINT "FK_crawl_issues_crawl_jobs_CrawlJobId"
                        FOREIGN KEY ("CrawlJobId") REFERENCES app_data.crawl_jobs("Id") ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS "IX_crawl_issues_CrawlJobId_Category_Severity" ON app_data.crawl_issues ("CrawlJobId", "Category", "Severity");

                CREATE TABLE IF NOT EXISTS app_data.crawl_links (
                    "Id" uuid NOT NULL,
                    "CrawlJobId" uuid NOT NULL,
                    "SourceUrl" character varying(2000) NOT NULL,
                    "TargetUrl" character varying(2000) NOT NULL,
                    "AnchorText" character varying(500) NULL,
                    "IsInternal" boolean NOT NULL DEFAULT false,
                    "IsBroken" boolean NOT NULL DEFAULT false,
                    "StatusCode" integer NOT NULL DEFAULT 0,
                    "Rel" character varying(100) NULL,
                    "SourcePageId" uuid NULL,
                    "CreatedAt" timestamp with time zone NOT NULL,
                    "UpdatedAt" timestamp with time zone NOT NULL,
                    "IsDeleted" boolean NOT NULL DEFAULT false,
                    "DeletedAt" timestamp with time zone NULL,
                    CONSTRAINT "PK_crawl_links" PRIMARY KEY ("Id"),
                    CONSTRAINT "FK_crawl_links_crawl_jobs_CrawlJobId"
                        FOREIGN KEY ("CrawlJobId") REFERENCES app_data.crawl_jobs("Id") ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS "IX_crawl_links_CrawlJobId_SourceUrl" ON app_data.crawl_links ("CrawlJobId", "SourceUrl");
                CREATE INDEX IF NOT EXISTS "IX_crawl_links_CrawlJobId_TargetUrl" ON app_data.crawl_links ("CrawlJobId", "TargetUrl");

                CREATE TABLE IF NOT EXISTS app_data.crawl_metrics (
                    "Id" uuid NOT NULL,
                    "CrawlJobId" uuid NOT NULL,
                    "MetricKey" character varying(100) NOT NULL,
                    "Value" numeric NOT NULL,
                    "Unit" character varying(50) NULL,
                    "RecordedAt" timestamp with time zone NOT NULL,
                    "CreatedAt" timestamp with time zone NOT NULL,
                    "UpdatedAt" timestamp with time zone NOT NULL,
                    "IsDeleted" boolean NOT NULL DEFAULT false,
                    "DeletedAt" timestamp with time zone NULL,
                    CONSTRAINT "PK_crawl_metrics" PRIMARY KEY ("Id"),
                    CONSTRAINT "FK_crawl_metrics_crawl_jobs_CrawlJobId"
                        FOREIGN KEY ("CrawlJobId") REFERENCES app_data.crawl_jobs("Id") ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS "IX_crawl_metrics_CrawlJobId_MetricKey_RecordedAt" ON app_data.crawl_metrics ("CrawlJobId", "MetricKey", "RecordedAt");

                CREATE TABLE IF NOT EXISTS app_data.crawl_reports (
                    "Id" uuid NOT NULL,
                    "CrawlJobId" uuid NOT NULL,
                    "Format" integer NOT NULL,
                    "ContentType" character varying(100) NULL,
                    "ReportData" jsonb NULL,
                    "RawData" bytea NULL,
                    "GeneratedAt" timestamp with time zone NOT NULL,
                    "CreatedAt" timestamp with time zone NOT NULL,
                    "UpdatedAt" timestamp with time zone NOT NULL,
                    "IsDeleted" boolean NOT NULL DEFAULT false,
                    "DeletedAt" timestamp with time zone NULL,
                    CONSTRAINT "PK_crawl_reports" PRIMARY KEY ("Id"),
                    CONSTRAINT "FK_crawl_reports_crawl_jobs_CrawlJobId"
                        FOREIGN KEY ("CrawlJobId") REFERENCES app_data.crawl_jobs("Id") ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS "IX_crawl_reports_CrawlJobId_GeneratedAt" ON app_data.crawl_reports ("CrawlJobId", "GeneratedAt");
                """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DROP TABLE IF EXISTS app_data.crawl_issues;
                DROP TABLE IF EXISTS app_data.crawl_links;
                DROP TABLE IF EXISTS app_data.crawl_metrics;
                DROP TABLE IF EXISTS app_data.crawl_reports;
                DROP TABLE IF EXISTS app_data.crawled_pages;
                DROP TABLE IF EXISTS app_data.crawl_jobs;
                """);
        }
    }
}
