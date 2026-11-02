# Database Schema (PostgreSQL)

```sql
CREATE TABLE "AssistantKnowledge" (
    "Id" uuid NOT NULL,
    "Title" character varying(500) NOT NULL,
    "Content" text NOT NULL,
    "ContentHash" text NOT NULL,
    "Source" character varying(100) NOT NULL,
    "SourceUrl" character varying(2000),
    "SourceId" character varying(500),
    "Category" character varying(100),
    "Tags" text[],
    "IsPublic" boolean NOT NULL,
    "IsApproved" boolean NOT NULL,
    "ApprovedBy" uuid,
    "Metadata" jsonb,
    "Embedding" real[],
    "TokenCount" integer NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "IsDeleted" boolean NOT NULL,
    "DeletedAt" timestamp with time zone,
    CONSTRAINT "PK_AssistantKnowledge" PRIMARY KEY ("Id")
);


CREATE TABLE "AssistantLearningSamples" (
    "Id" uuid NOT NULL,
    "Source" integer NOT NULL,
    "Status" integer NOT NULL,
    "UserPrompt" text NOT NULL,
    "AssistantResponse" text,
    "IdealResponse" text,
    "Context" text,
    "Metadata" jsonb,
    "ContentHash" text,
    "QualityScore" real,
    "ConversationId" uuid,
    "MessageId" uuid,
    "SourceUserId" uuid,
    "UsedInTrainingAt" timestamp with time zone,
    "TrainingBatchId" text,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "IsDeleted" boolean NOT NULL,
    "DeletedAt" timestamp with time zone,
    CONSTRAINT "PK_AssistantLearningSamples" PRIMARY KEY ("Id")
);


CREATE TABLE "CraftDomains" (
    "Id" uuid NOT NULL,
    "Key" character varying(100) NOT NULL,
    "Name" character varying(200) NOT NULL,
    "Description" character varying(2000),
    "IconEmoji" character varying(100),
    "SortOrder" integer NOT NULL,
    "IsActive" boolean NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "IsDeleted" boolean NOT NULL,
    "DeletedAt" timestamp with time zone,
    CONSTRAINT "PK_CraftDomains" PRIMARY KEY ("Id")
);


CREATE TABLE "CraftMasters" (
    "Id" uuid NOT NULL,
    "Name" character varying(200) NOT NULL,
    "Domains" text[],
    "Bio" character varying(500),
    "SignatureStyle" character varying(2000),
    "NotableWorks" text[],
    "Techniques" text[],
    "Analysis" jsonb,
    "StyleEmbedding" real[],
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "IsDeleted" boolean NOT NULL,
    "DeletedAt" timestamp with time zone,
    CONSTRAINT "PK_CraftMasters" PRIMARY KEY ("Id")
);


CREATE TABLE "DataQueries" (
    "Id" uuid NOT NULL,
    "UserId" uuid NOT NULL,
    "ConversationId" uuid,
    "Prompt" text NOT NULL,
    "Intent" text NOT NULL,
    "Sources" text[],
    "Filters" jsonb,
    "Result" jsonb,
    "OutputBlocks" jsonb,
    "LatencyMs" integer NOT NULL,
    "TokenUsage" integer NOT NULL,
    "RowsReturned" integer NOT NULL,
    "Status" integer NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "IsDeleted" boolean NOT NULL,
    "DeletedAt" timestamp with time zone,
    CONSTRAINT "PK_DataQueries" PRIMARY KEY ("Id")
);


CREATE TABLE "DataQueryTemplates" (
    "Id" uuid NOT NULL,
    "Title" character varying(200) NOT NULL,
    "Prompt" text NOT NULL,
    "Description" text,
    "Category" character varying(50) NOT NULL,
    "Sources" text[],
    "SortOrder" integer NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "IsDeleted" boolean NOT NULL,
    "DeletedAt" timestamp with time zone,
    CONSTRAINT "PK_DataQueryTemplates" PRIMARY KEY ("Id")
);


CREATE TABLE "DataSourceRegistries" (
    "Id" uuid NOT NULL,
    "Key" character varying(80) NOT NULL,
    "Name" character varying(200) NOT NULL,
    "Description" character varying(1000),
    "Category" character varying(100) NOT NULL,
    "Capabilities" text[],
    "Metrics" text[],
    "Dimensions" text[],
    "SchemaHint" jsonb,
    "IsEnabled" boolean NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "IsDeleted" boolean NOT NULL,
    "DeletedAt" timestamp with time zone,
    CONSTRAINT "PK_DataSourceRegistries" PRIMARY KEY ("Id")
);


CREATE TABLE "Users" (
    "Id" uuid NOT NULL,
    "DisplayName" text NOT NULL,
    "Email" text,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "IsDeleted" boolean NOT NULL,
    "DeletedAt" timestamp with time zone,
    CONSTRAINT "PK_Users" PRIMARY KEY ("Id")
);


CREATE TABLE "CraftPrinciples" (
    "Id" uuid NOT NULL,
    "CraftDomainId" uuid NOT NULL,
    "SkillId" uuid,
    "Title" character varying(300) NOT NULL,
    "Body" text NOT NULL,
    "Example" text,
    "CounterExample" text,
    "Author" character varying(100),
    "SourceUrl" character varying(500),
    "Kind" integer NOT NULL,
    "Importance" integer NOT NULL,
    "Tags" jsonb,
    "Embedding" real[],
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "IsDeleted" boolean NOT NULL,
    "DeletedAt" timestamp with time zone,
    CONSTRAINT "PK_CraftPrinciples" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_CraftPrinciples_CraftDomains_CraftDomainId" FOREIGN KEY ("CraftDomainId") REFERENCES "CraftDomains" ("Id") ON DELETE CASCADE
);


CREATE TABLE "CraftSkills" (
    "Id" uuid NOT NULL,
    "CraftDomainId" uuid NOT NULL,
    "Key" character varying(100) NOT NULL,
    "Name" character varying(200) NOT NULL,
    "Description" character varying(2000),
    "Difficulty" integer NOT NULL,
    "MeasurementSignal" text,
    "Weight" integer NOT NULL,
    "ParentSkillId" uuid,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "IsDeleted" boolean NOT NULL,
    "DeletedAt" timestamp with time zone,
    CONSTRAINT "PK_CraftSkills" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_CraftSkills_CraftDomains_CraftDomainId" FOREIGN KEY ("CraftDomainId") REFERENCES "CraftDomains" ("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_CraftSkills_CraftSkills_ParentSkillId" FOREIGN KEY ("ParentSkillId") REFERENCES "CraftSkills" ("Id")
);


CREATE TABLE "CraftSources" (
    "Id" uuid NOT NULL,
    "CraftDomainId" uuid NOT NULL,
    "Title" character varying(500) NOT NULL,
    "Author" character varying(200),
    "Kind" integer NOT NULL,
    "Status" integer NOT NULL,
    "Url" character varying(2000),
    "RawContent" text,
    "ContentLength" integer NOT NULL,
    "IngestedAt" timestamp with time zone,
    "ErrorMessage" text,
    "Metadata" jsonb,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "IsDeleted" boolean NOT NULL,
    "DeletedAt" timestamp with time zone,
    CONSTRAINT "PK_CraftSources" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_CraftSources_CraftDomains_CraftDomainId" FOREIGN KEY ("CraftDomainId") REFERENCES "CraftDomains" ("Id") ON DELETE CASCADE
);


CREATE TABLE "AssistantConversations" (
    "Id" uuid NOT NULL,
    "UserId" uuid NOT NULL,
    "Title" character varying(255) NOT NULL,
    "Channel" integer NOT NULL,
    "Persona" integer NOT NULL,
    "IsVoiceEnabled" boolean NOT NULL,
    "IsWebGroundingEnabled" boolean NOT NULL,
    "IsLearningEnabled" boolean NOT NULL,
    "VoiceId" text,
    "SystemPromptOverride" text,
    "MessageCount" integer NOT NULL,
    "TokenUsage" integer NOT NULL,
    "LastMessageAt" timestamp with time zone NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "IsDeleted" boolean NOT NULL,
    "DeletedAt" timestamp with time zone,
    CONSTRAINT "PK_AssistantConversations" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_AssistantConversations_Users_UserId" FOREIGN KEY ("UserId") REFERENCES "Users" ("Id") ON DELETE CASCADE
);


CREATE TABLE "CraftObservations" (
    "Id" uuid NOT NULL,
    "UserId" uuid NOT NULL,
    "ContentId" uuid,
    "DomainKey" character varying(100) NOT NULL,
    "Type" integer NOT NULL,
    "Action" integer NOT NULL,
    "SuccessMetric" numeric,
    "MetricName" text,
    "Signals" jsonb,
    "Features" jsonb,
    "Context" jsonb,
    "DetectedPattern" text,
    "Embedding" real[],
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "IsDeleted" boolean NOT NULL,
    "DeletedAt" timestamp with time zone,
    CONSTRAINT "PK_CraftObservations" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_CraftObservations_Users_UserId" FOREIGN KEY ("UserId") REFERENCES "Users" ("Id") ON DELETE CASCADE
);


CREATE TABLE "UserCraftProfiles" (
    "Id" uuid NOT NULL,
    "UserId" uuid NOT NULL,
    "PrimaryDomain" character varying(100) NOT NULL,
    "FocusDomains" text[],
    "DomainScores" jsonb,
    "CraftLevel" integer NOT NULL,
    "TotalCraftPoints" integer NOT NULL,
    "LearningStreakDays" integer NOT NULL,
    "LastAnalyzedAt" timestamp with time zone,
    "LastCoachedAt" timestamp with time zone,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "IsDeleted" boolean NOT NULL,
    "DeletedAt" timestamp with time zone,
    CONSTRAINT "PK_UserCraftProfiles" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_UserCraftProfiles_Users_UserId" FOREIGN KEY ("UserId") REFERENCES "Users" ("Id") ON DELETE CASCADE
);


CREATE TABLE "CraftLessons" (
    "Id" uuid NOT NULL,
    "CraftDomainId" uuid NOT NULL,
    "SkillId" uuid,
    "Title" character varying(300) NOT NULL,
    "Summary" text NOT NULL,
    "Content" text NOT NULL,
    "Format" integer NOT NULL,
    "Level" integer NOT NULL,
    "EstimatedMinutes" integer NOT NULL,
    "OrderIndex" integer NOT NULL,
    "MasterExamples" text[],
    "MasterPractitioners" text[],
    "Evidence" jsonb,
    "PersonalizedPrompt" text,
    "Prerequisites" text[],
    "RelatedSkills" text[],
    "Embedding" real[],
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "IsDeleted" boolean NOT NULL,
    "DeletedAt" timestamp with time zone,
    CONSTRAINT "PK_CraftLessons" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_CraftLessons_CraftDomains_CraftDomainId" FOREIGN KEY ("CraftDomainId") REFERENCES "CraftDomains" ("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_CraftLessons_CraftSkills_SkillId" FOREIGN KEY ("SkillId") REFERENCES "CraftSkills" ("Id")
);


CREATE TABLE "CraftInsights" (
    "Id" uuid NOT NULL,
    "SourceId" uuid NOT NULL,
    "Title" character varying(300) NOT NULL,
    "Content" text NOT NULL,
    "Quote" text,
    "PageOrTimestamp" integer,
    "Embedding" real[],
    "Quality" integer NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "IsDeleted" boolean NOT NULL,
    "DeletedAt" timestamp with time zone,
    CONSTRAINT "PK_CraftInsights" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_CraftInsights_CraftSources_SourceId" FOREIGN KEY ("SourceId") REFERENCES "CraftSources" ("Id") ON DELETE CASCADE
);


CREATE TABLE "AssistantMessages" (
    "Id" uuid NOT NULL,
    "ConversationId" uuid NOT NULL,
    "UserId" uuid,
    "Role" integer NOT NULL,
    "Content" text NOT NULL,
    "AudioUrl" text,
    "AudioDurationMs" integer,
    "Transcript" text,
    "PromptTokens" integer NOT NULL,
    "CompletionTokens" integer NOT NULL,
    "LatencyMs" integer NOT NULL,
    "Citations" jsonb,
    "ToolCalls" jsonb,
    "Metadata" jsonb,
    "Status" integer NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "IsDeleted" boolean NOT NULL,
    "DeletedAt" timestamp with time zone,
    CONSTRAINT "PK_AssistantMessages" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_AssistantMessages_AssistantConversations_ConversationId" FOREIGN KEY ("ConversationId") REFERENCES "AssistantConversations" ("Id") ON DELETE CASCADE
);


CREATE TABLE "CraftCoachingSessions" (
    "Id" uuid NOT NULL,
    "UserId" uuid NOT NULL,
    "ContentId" uuid,
    "DomainKey" character varying(100) NOT NULL,
    "Trigger" integer NOT NULL,
    "Input" text NOT NULL,
    "Context" text,
    "Output" jsonb,
    "OverallScore" numeric,
    "Summary" text,
    "AppliedAt" timestamp with time zone,
    "AppliedImpact" numeric,
    "UserCraftProfileId" uuid,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "IsDeleted" boolean NOT NULL,
    "DeletedAt" timestamp with time zone,
    CONSTRAINT "PK_CraftCoachingSessions" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_CraftCoachingSessions_UserCraftProfiles_UserCraftProfileId" FOREIGN KEY ("UserCraftProfileId") REFERENCES "UserCraftProfiles" ("Id"),
    CONSTRAINT "FK_CraftCoachingSessions_Users_UserId" FOREIGN KEY ("UserId") REFERENCES "Users" ("Id") ON DELETE CASCADE
);


CREATE TABLE "UserCraftSkillScore" (
    "Id" uuid NOT NULL,
    "UserId" uuid NOT NULL,
    "SkillId" uuid NOT NULL,
    "Score" numeric NOT NULL,
    "SampleSize" integer NOT NULL,
    "Confidence" numeric NOT NULL,
    "LastUpdated" timestamp with time zone NOT NULL,
    "Evidence" jsonb,
    "UserCraftProfileId" uuid,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "IsDeleted" boolean NOT NULL,
    "DeletedAt" timestamp with time zone,
    CONSTRAINT "PK_UserCraftSkillScore" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_UserCraftSkillScore_CraftSkills_SkillId" FOREIGN KEY ("SkillId") REFERENCES "CraftSkills" ("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_UserCraftSkillScore_UserCraftProfiles_UserCraftProfileId" FOREIGN KEY ("UserCraftProfileId") REFERENCES "UserCraftProfiles" ("Id"),
    CONSTRAINT "FK_UserCraftSkillScore_Users_UserId" FOREIGN KEY ("UserId") REFERENCES "Users" ("Id") ON DELETE CASCADE
);


CREATE TABLE "CraftLessonCompletions" (
    "Id" uuid NOT NULL,
    "LessonId" uuid NOT NULL,
    "UserId" uuid NOT NULL,
    "Score" numeric,
    "Applied" boolean NOT NULL,
    "AppliedImpact" numeric,
    "CompletedAt" timestamp with time zone NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "IsDeleted" boolean NOT NULL,
    "DeletedAt" timestamp with time zone,
    CONSTRAINT "PK_CraftLessonCompletions" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_CraftLessonCompletions_CraftLessons_LessonId" FOREIGN KEY ("LessonId") REFERENCES "CraftLessons" ("Id") ON DELETE CASCADE
);


CREATE TABLE "AssistantFeedback" (
    "Id" uuid NOT NULL,
    "MessageId" uuid NOT NULL,
    "UserId" uuid,
    "Vote" integer NOT NULL,
    "Comment" character varying(2000),
    "CorrectedResponse" text,
    "IsProcessed" boolean NOT NULL,
    "Rating" integer,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "IsDeleted" boolean NOT NULL,
    "DeletedAt" timestamp with time zone,
    CONSTRAINT "PK_AssistantFeedback" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_AssistantFeedback_AssistantMessages_MessageId" FOREIGN KEY ("MessageId") REFERENCES "AssistantMessages" ("Id") ON DELETE CASCADE
);


CREATE TABLE "CraftCoachingSuggestions" (
    "Id" uuid NOT NULL,
    "SessionId" uuid NOT NULL,
    "SkillKey" character varying(100) NOT NULL,
    "Kind" integer NOT NULL,
    "Title" character varying(300) NOT NULL,
    "Detail" text NOT NULL,
    "Example" text,
    "Priority" integer NOT NULL,
    "MasterExamples" text[],
    "Citations" text[],
    "Accepted" boolean NOT NULL,
    "Dismissed" boolean NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "IsDeleted" boolean NOT NULL,
    "DeletedAt" timestamp with time zone,
    CONSTRAINT "PK_CraftCoachingSuggestions" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_CraftCoachingSuggestions_CraftCoachingSessions_SessionId" FOREIGN KEY ("SessionId") REFERENCES "CraftCoachingSessions" ("Id") ON DELETE CASCADE
);


CREATE INDEX "IX_AssistantConversations_UserId" ON "AssistantConversations" ("UserId");


CREATE INDEX "IX_AssistantFeedback_MessageId" ON "AssistantFeedback" ("MessageId");


CREATE INDEX "IX_AssistantMessages_ConversationId" ON "AssistantMessages" ("ConversationId");


CREATE INDEX "IX_CraftCoachingSessions_UserCraftProfileId" ON "CraftCoachingSessions" ("UserCraftProfileId");


CREATE INDEX "IX_CraftCoachingSessions_UserId" ON "CraftCoachingSessions" ("UserId");


CREATE INDEX "IX_CraftCoachingSuggestions_SessionId" ON "CraftCoachingSuggestions" ("SessionId");


CREATE INDEX "IX_CraftInsights_SourceId" ON "CraftInsights" ("SourceId");


CREATE INDEX "IX_CraftLessonCompletions_LessonId" ON "CraftLessonCompletions" ("LessonId");


CREATE INDEX "IX_CraftLessons_CraftDomainId" ON "CraftLessons" ("CraftDomainId");


CREATE INDEX "IX_CraftLessons_SkillId" ON "CraftLessons" ("SkillId");


CREATE INDEX "IX_CraftObservations_UserId" ON "CraftObservations" ("UserId");


CREATE INDEX "IX_CraftPrinciples_CraftDomainId" ON "CraftPrinciples" ("CraftDomainId");


CREATE INDEX "IX_CraftSkills_CraftDomainId" ON "CraftSkills" ("CraftDomainId");


CREATE INDEX "IX_CraftSkills_ParentSkillId" ON "CraftSkills" ("ParentSkillId");


CREATE INDEX "IX_CraftSources_CraftDomainId" ON "CraftSources" ("CraftDomainId");


CREATE INDEX "IX_UserCraftProfiles_UserId" ON "UserCraftProfiles" ("UserId");


CREATE INDEX "IX_UserCraftSkillScore_SkillId" ON "UserCraftSkillScore" ("SkillId");


CREATE INDEX "IX_UserCraftSkillScore_UserCraftProfileId" ON "UserCraftSkillScore" ("UserCraftProfileId");


CREATE INDEX "IX_UserCraftSkillScore_UserId" ON "UserCraftSkillScore" ("UserId");



```
