using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Wiseravenshare.Server.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddCraftIntelligenceTables : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Create all Craft Intelligence tables using IF NOT EXISTS to be idempotent.
            // These tables were supposed to be created in AddCraftIntelligence but that migration
            // experienced a partial failure due to pre-existing schema objects.
            migrationBuilder.Sql("""
                CREATE TABLE IF NOT EXISTS app_data."CraftDomains" (
                    "Id" uuid NOT NULL,
                    "Key" character varying(100) NOT NULL,
                    "Name" character varying(200) NOT NULL,
                    "Description" text,
                    "IconEmoji" character varying(10),
                    "SortOrder" integer NOT NULL DEFAULT 0,
                    "IsActive" boolean NOT NULL DEFAULT true,
                    "CreatedAt" timestamp with time zone NOT NULL,
                    "UpdatedAt" timestamp with time zone NOT NULL,
                    "IsDeleted" boolean NOT NULL DEFAULT false,
                    "DeletedAt" timestamp with time zone,
                    CONSTRAINT "PK_CraftDomains" PRIMARY KEY ("Id")
                );
                CREATE UNIQUE INDEX IF NOT EXISTS "IX_CraftDomains_Key" ON app_data."CraftDomains" ("Key");

                CREATE TABLE IF NOT EXISTS app_data."CraftSkills" (
                    "Id" uuid NOT NULL,
                    "CraftDomainId" uuid NOT NULL,
                    "Key" character varying(100) NOT NULL,
                    "Name" character varying(200) NOT NULL,
                    "Description" character varying(2000),
                    "Difficulty" integer NOT NULL DEFAULT 0,
                    "MeasurementSignal" text,
                    "Weight" integer NOT NULL DEFAULT 1,
                    "ParentSkillId" uuid,
                    "CreatedAt" timestamp with time zone NOT NULL,
                    "UpdatedAt" timestamp with time zone NOT NULL,
                    "IsDeleted" boolean NOT NULL DEFAULT false,
                    "DeletedAt" timestamp with time zone,
                    CONSTRAINT "PK_CraftSkills" PRIMARY KEY ("Id"),
                    CONSTRAINT "FK_CraftSkills_CraftDomains_CraftDomainId"
                        FOREIGN KEY ("CraftDomainId") REFERENCES app_data."CraftDomains"("Id") ON DELETE CASCADE,
                    CONSTRAINT "FK_CraftSkills_CraftSkills_ParentSkillId"
                        FOREIGN KEY ("ParentSkillId") REFERENCES app_data."CraftSkills"("Id") ON DELETE RESTRICT
                );
                CREATE INDEX IF NOT EXISTS "IX_CraftSkills_CraftDomainId_Key" ON app_data."CraftSkills" ("CraftDomainId", "Key");

                CREATE TABLE IF NOT EXISTS app_data."CraftPrinciples" (
                    "Id" uuid NOT NULL,
                    "CraftDomainId" uuid NOT NULL,
                    "SkillId" uuid,
                    "Title" character varying(300) NOT NULL,
                    "Description" character varying(2000) NOT NULL,
                    "Example" character varying(500),
                    "CounterExample" character varying(500),
                    "Author" character varying(100),
                    "Kind" integer NOT NULL DEFAULT 0,
                    "Importance" integer NOT NULL DEFAULT 5,
                    "CreatedAt" timestamp with time zone NOT NULL,
                    "UpdatedAt" timestamp with time zone NOT NULL,
                    "IsDeleted" boolean NOT NULL DEFAULT false,
                    "DeletedAt" timestamp with time zone,
                    CONSTRAINT "PK_CraftPrinciples" PRIMARY KEY ("Id"),
                    CONSTRAINT "FK_CraftPrinciples_CraftDomains_CraftDomainId"
                        FOREIGN KEY ("CraftDomainId") REFERENCES app_data."CraftDomains"("Id") ON DELETE CASCADE,
                    CONSTRAINT "FK_CraftPrinciples_CraftSkills_SkillId"
                        FOREIGN KEY ("SkillId") REFERENCES app_data."CraftSkills"("Id") ON DELETE SET NULL
                );
                CREATE INDEX IF NOT EXISTS "IX_CraftPrinciples_CraftDomainId_Kind" ON app_data."CraftPrinciples" ("CraftDomainId", "Kind");

                CREATE TABLE IF NOT EXISTS app_data."CraftPrincipleRefinements" (
                    "Id" uuid NOT NULL,
                    "PrincipleId" uuid NOT NULL,
                    "RefinedTitle" character varying(300),
                    "RefinedDescription" character varying(2000),
                    "RefinedExample" character varying(500),
                    "ChangeReason" character varying(500),
                    "Status" integer NOT NULL DEFAULT 0,
                    "ApprovedById" uuid,
                    "ApprovedAt" timestamp with time zone,
                    "CreatedAt" timestamp with time zone NOT NULL,
                    "UpdatedAt" timestamp with time zone NOT NULL,
                    "IsDeleted" boolean NOT NULL DEFAULT false,
                    "DeletedAt" timestamp with time zone,
                    CONSTRAINT "PK_CraftPrincipleRefinements" PRIMARY KEY ("Id"),
                    CONSTRAINT "FK_CraftPrincipleRefinements_CraftPrinciples_PrincipleId"
                        FOREIGN KEY ("PrincipleId") REFERENCES app_data."CraftPrinciples"("Id") ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS "IX_CraftPrincipleRefinements_PrincipleId_Status" ON app_data."CraftPrincipleRefinements" ("PrincipleId", "Status");

                CREATE TABLE IF NOT EXISTS app_data."UserCraftProfiles" (
                    "Id" uuid NOT NULL,
                    "UserId" uuid NOT NULL,
                    "OverallLevel" integer NOT NULL DEFAULT 0,
                    "TotalReviews" integer NOT NULL DEFAULT 0,
                    "TotalFeedbackActedOn" integer NOT NULL DEFAULT 0,
                    "LastActiveAt" timestamp with time zone,
                    "CreatedAt" timestamp with time zone NOT NULL,
                    "UpdatedAt" timestamp with time zone NOT NULL,
                    "IsDeleted" boolean NOT NULL DEFAULT false,
                    "DeletedAt" timestamp with time zone,
                    CONSTRAINT "PK_UserCraftProfiles" PRIMARY KEY ("Id"),
                    CONSTRAINT "FK_UserCraftProfiles_Users_UserId"
                        FOREIGN KEY ("UserId") REFERENCES app_data."Users"("Id") ON DELETE CASCADE
                );
                CREATE UNIQUE INDEX IF NOT EXISTS "IX_UserCraftProfiles_UserId" ON app_data."UserCraftProfiles" ("UserId");

                CREATE TABLE IF NOT EXISTS app_data."UserCraftSkillScores" (
                    "Id" uuid NOT NULL,
                    "UserId" uuid NOT NULL,
                    "SkillId" uuid NOT NULL,
                    "Score" numeric(5,2) NOT NULL DEFAULT 0,
                    "Confidence" numeric(3,2) NOT NULL DEFAULT 0,
                    "ObservationCount" integer NOT NULL DEFAULT 0,
                    "LastObservedAt" timestamp with time zone,
                    "CreatedAt" timestamp with time zone NOT NULL,
                    "UpdatedAt" timestamp with time zone NOT NULL,
                    "IsDeleted" boolean NOT NULL DEFAULT false,
                    "DeletedAt" timestamp with time zone,
                    CONSTRAINT "PK_UserCraftSkillScores" PRIMARY KEY ("Id"),
                    CONSTRAINT "FK_UserCraftSkillScores_CraftSkills_SkillId"
                        FOREIGN KEY ("SkillId") REFERENCES app_data."CraftSkills"("Id") ON DELETE CASCADE
                );
                CREATE UNIQUE INDEX IF NOT EXISTS "IX_UserCraftSkillScores_UserId_SkillId" ON app_data."UserCraftSkillScores" ("UserId", "SkillId");

                CREATE TABLE IF NOT EXISTS app_data."CraftDraftReviews" (
                    "Id" uuid NOT NULL,
                    "UserId" uuid NOT NULL,
                    "CraftDomainId" uuid NOT NULL,
                    "DraftContent" text NOT NULL,
                    "ContentType" character varying(50) NOT NULL DEFAULT 'article',
                    "Context" character varying(500),
                    "OverallScore" numeric(5,2),
                    "Strengths" text,
                    "AiAnalysis" text,
                    "NextSteps" text,
                    "RagContext" text,
                    "ReviewedAt" timestamp with time zone NOT NULL,
                    "CreatedAt" timestamp with time zone NOT NULL,
                    "UpdatedAt" timestamp with time zone NOT NULL,
                    "IsDeleted" boolean NOT NULL DEFAULT false,
                    "DeletedAt" timestamp with time zone,
                    CONSTRAINT "PK_CraftDraftReviews" PRIMARY KEY ("Id"),
                    CONSTRAINT "FK_CraftDraftReviews_CraftDomains_CraftDomainId"
                        FOREIGN KEY ("CraftDomainId") REFERENCES app_data."CraftDomains"("Id") ON DELETE CASCADE,
                    CONSTRAINT "FK_CraftDraftReviews_Users_UserId"
                        FOREIGN KEY ("UserId") REFERENCES app_data."Users"("Id") ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS "IX_CraftDraftReviews_UserId_CraftDomainId_ReviewedAt" ON app_data."CraftDraftReviews" ("UserId", "CraftDomainId", "ReviewedAt");

                CREATE TABLE IF NOT EXISTS app_data."CraftFeedbacks" (
                    "Id" uuid NOT NULL,
                    "ReviewId" uuid NOT NULL,
                    "PrincipleKey" character varying(100) NOT NULL,
                    "PrincipleTitle" character varying(300),
                    "Feedback" character varying(500) NOT NULL,
                    "Example" character varying(500),
                    "Severity" character varying(20) NOT NULL DEFAULT 'medium',
                    "CreatedAt" timestamp with time zone NOT NULL,
                    "UpdatedAt" timestamp with time zone NOT NULL,
                    "IsDeleted" boolean NOT NULL DEFAULT false,
                    "DeletedAt" timestamp with time zone,
                    CONSTRAINT "PK_CraftFeedbacks" PRIMARY KEY ("Id"),
                    CONSTRAINT "FK_CraftFeedbacks_CraftDraftReviews_ReviewId"
                        FOREIGN KEY ("ReviewId") REFERENCES app_data."CraftDraftReviews"("Id") ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS "IX_CraftFeedbacks_ReviewId" ON app_data."CraftFeedbacks" ("ReviewId");

                CREATE TABLE IF NOT EXISTS app_data."CraftObservations" (
                    "Id" uuid NOT NULL,
                    "UserId" uuid NOT NULL,
                    "DomainKey" character varying(100) NOT NULL,
                    "Type" integer NOT NULL DEFAULT 0,
                    "Source" character varying(100),
                    "Content" text,
                    "Metadata" jsonb,
                    "ObservedAt" timestamp with time zone NOT NULL,
                    "CreatedAt" timestamp with time zone NOT NULL,
                    "UpdatedAt" timestamp with time zone NOT NULL,
                    "IsDeleted" boolean NOT NULL DEFAULT false,
                    "DeletedAt" timestamp with time zone,
                    CONSTRAINT "PK_CraftObservations" PRIMARY KEY ("Id"),
                    CONSTRAINT "FK_CraftObservations_Users_UserId"
                        FOREIGN KEY ("UserId") REFERENCES app_data."Users"("Id") ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS "IX_CraftObservations_UserId_DomainKey_CreatedAt" ON app_data."CraftObservations" ("UserId", "DomainKey", "CreatedAt");

                CREATE TABLE IF NOT EXISTS app_data."CraftLessons" (
                    "Id" uuid NOT NULL,
                    "CraftDomainId" uuid NOT NULL,
                    "SkillId" uuid,
                    "Title" character varying(300) NOT NULL,
                    "Summary" character varying(500),
                    "Content" text,
                    "Level" integer NOT NULL DEFAULT 0,
                    "OrderIndex" integer NOT NULL DEFAULT 0,
                    "EstimatedMinutes" integer NOT NULL DEFAULT 5,
                    "IsPublished" boolean NOT NULL DEFAULT false,
                    "CreatedAt" timestamp with time zone NOT NULL,
                    "UpdatedAt" timestamp with time zone NOT NULL,
                    "IsDeleted" boolean NOT NULL DEFAULT false,
                    "DeletedAt" timestamp with time zone,
                    CONSTRAINT "PK_CraftLessons" PRIMARY KEY ("Id"),
                    CONSTRAINT "FK_CraftLessons_CraftDomains_CraftDomainId"
                        FOREIGN KEY ("CraftDomainId") REFERENCES app_data."CraftDomains"("Id") ON DELETE CASCADE,
                    CONSTRAINT "FK_CraftLessons_CraftSkills_SkillId"
                        FOREIGN KEY ("SkillId") REFERENCES app_data."CraftSkills"("Id") ON DELETE SET NULL
                );
                CREATE INDEX IF NOT EXISTS "IX_CraftLessons_CraftDomainId_Level_OrderIndex" ON app_data."CraftLessons" ("CraftDomainId", "Level", "OrderIndex");

                CREATE TABLE IF NOT EXISTS app_data."CraftLessonCompletions" (
                    "Id" uuid NOT NULL,
                    "UserId" uuid NOT NULL,
                    "LessonId" uuid NOT NULL,
                    "CompletedAt" timestamp with time zone NOT NULL,
                    "Score" integer,
                    "CreatedAt" timestamp with time zone NOT NULL,
                    "UpdatedAt" timestamp with time zone NOT NULL,
                    "IsDeleted" boolean NOT NULL DEFAULT false,
                    "DeletedAt" timestamp with time zone,
                    CONSTRAINT "PK_CraftLessonCompletions" PRIMARY KEY ("Id"),
                    CONSTRAINT "FK_CraftLessonCompletions_CraftLessons_LessonId"
                        FOREIGN KEY ("LessonId") REFERENCES app_data."CraftLessons"("Id") ON DELETE CASCADE
                );
                CREATE UNIQUE INDEX IF NOT EXISTS "IX_CraftLessonCompletions_UserId_LessonId" ON app_data."CraftLessonCompletions" ("UserId", "LessonId");

                CREATE TABLE IF NOT EXISTS app_data."CraftPerformanceMetrics" (
                    "Id" uuid NOT NULL,
                    "UserId" uuid NOT NULL,
                    "CraftDomainId" uuid NOT NULL,
                    "DomainKey" character varying(100) NOT NULL,
                    "PublishedContentId" uuid,
                    "ContentTitle" character varying(200),
                    "EngagementRate" numeric(5,2),
                    "ViewCount" numeric,
                    "ShareCount" numeric,
                    "CommentCount" numeric,
                    "TimeOnPageSeconds" numeric,
                    "CompletionRate" numeric(5,2),
                    "Features" jsonb,
                    "MeasuredAt" timestamp with time zone NOT NULL,
                    "CreatedAt" timestamp with time zone NOT NULL,
                    "UpdatedAt" timestamp with time zone NOT NULL,
                    "IsDeleted" boolean NOT NULL DEFAULT false,
                    "DeletedAt" timestamp with time zone,
                    CONSTRAINT "PK_CraftPerformanceMetrics" PRIMARY KEY ("Id"),
                    CONSTRAINT "FK_CraftPerformanceMetrics_CraftDomains_CraftDomainId"
                        FOREIGN KEY ("CraftDomainId") REFERENCES app_data."CraftDomains"("Id") ON DELETE CASCADE,
                    CONSTRAINT "FK_CraftPerformanceMetrics_Users_UserId"
                        FOREIGN KEY ("UserId") REFERENCES app_data."Users"("Id") ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS "IX_CraftPerformanceMetrics_UserId_DomainKey_MeasuredAt" ON app_data."CraftPerformanceMetrics" ("UserId", "DomainKey", "MeasuredAt");

                CREATE TABLE IF NOT EXISTS app_data."CraftPatterns" (
                    "Id" uuid NOT NULL,
                    "CraftDomainId" uuid NOT NULL,
                    "Title" character varying(300) NOT NULL,
                    "Description" character varying(1000) NOT NULL,
                    "Example" character varying(500),
                    "Confidence" numeric(3,2) NOT NULL DEFAULT 0,
                    "SampleSize" integer NOT NULL DEFAULT 0,
                    "AverageImpact" numeric(5,2),
                    "Status" integer NOT NULL DEFAULT 0,
                    "ApprovedById" uuid,
                    "ApprovedAt" timestamp with time zone,
                    "RelatedPrinciples" jsonb,
                    "SupportingEvidence" jsonb,
                    "CreatedAt" timestamp with time zone NOT NULL,
                    "UpdatedAt" timestamp with time zone NOT NULL,
                    "IsDeleted" boolean NOT NULL DEFAULT false,
                    "DeletedAt" timestamp with time zone,
                    CONSTRAINT "PK_CraftPatterns" PRIMARY KEY ("Id"),
                    CONSTRAINT "FK_CraftPatterns_CraftDomains_CraftDomainId"
                        FOREIGN KEY ("CraftDomainId") REFERENCES app_data."CraftDomains"("Id") ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS "IX_CraftPatterns_CraftDomainId_Status_Confidence" ON app_data."CraftPatterns" ("CraftDomainId", "Status", "Confidence");
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DROP TABLE IF EXISTS app_data."CraftPatterns";
                DROP TABLE IF EXISTS app_data."CraftPerformanceMetrics";
                DROP TABLE IF EXISTS app_data."CraftLessonCompletions";
                DROP TABLE IF EXISTS app_data."CraftLessons";
                DROP TABLE IF EXISTS app_data."CraftObservations";
                DROP TABLE IF EXISTS app_data."CraftFeedbacks";
                DROP TABLE IF EXISTS app_data."CraftDraftReviews";
                DROP TABLE IF EXISTS app_data."UserCraftSkillScores";
                DROP TABLE IF EXISTS app_data."UserCraftProfiles";
                DROP TABLE IF EXISTS app_data."CraftPrincipleRefinements";
                DROP TABLE IF EXISTS app_data."CraftPrinciples";
                DROP TABLE IF EXISTS app_data."CraftSkills";
                DROP TABLE IF EXISTS app_data."CraftDomains";
                """);
        }
    }
}
