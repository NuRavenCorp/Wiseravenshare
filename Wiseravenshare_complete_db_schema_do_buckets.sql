DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname = 'app_data') THEN
        CREATE SCHEMA app_data;
    END IF;
END $EF$;
CREATE TABLE IF NOT EXISTS app_data."__EFMigrationsHistory" (
    "MigrationId" character varying(150) NOT NULL,
    "ProductVersion" character varying(32) NOT NULL,
    CONSTRAINT "PK___EFMigrationsHistory" PRIMARY KEY ("MigrationId")
);

START TRANSACTION;
DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname = 'app_data') THEN
        CREATE SCHEMA app_data;
    END IF;
END $EF$;

CREATE TABLE app_data."Agents" (
    "Id" uuid NOT NULL,
    "Name" character varying(100) NOT NULL,
    "Description" character varying(500) NOT NULL,
    "Type" integer NOT NULL,
    "SystemPrompt" character varying(2000) NOT NULL,
    "CoreDirectives" jsonb,
    "KnowledgeGraph" jsonb,
    "SocialPreferences" jsonb,
    "State" jsonb,
    "PerformanceScore" numeric NOT NULL,
    "PostCount" integer NOT NULL,
    "InteractionCount" integer NOT NULL,
    "EvolutionCount" integer NOT NULL,
    "IsActive" boolean NOT NULL,
    "LastActiveAt" timestamp with time zone,
    "EvolvedAt" timestamp with time zone,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "IsDeleted" boolean NOT NULL,
    "DeletedAt" timestamp with time zone,
    CONSTRAINT "PK_Agents" PRIMARY KEY ("Id")
);

CREATE TABLE app_data."PostBookmarks" (
    "Id" uuid NOT NULL,
    "PostId" uuid NOT NULL,
    "UserId" uuid NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "IsDeleted" boolean NOT NULL,
    "DeletedAt" timestamp with time zone,
    CONSTRAINT "PK_PostBookmarks" PRIMARY KEY ("Id")
);

CREATE TABLE app_data."Users" (
    "Id" uuid NOT NULL,
    "Email" text NOT NULL,
    "Username" text NOT NULL,
    "DisplayName" text NOT NULL,
    "PasswordHash" text NOT NULL,
    "Bio" text,
    "AvatarUrl" text,
    "CoverPhotoUrl" text,
    "Location" text,
    "Website" text,
    "IsVerified" boolean NOT NULL,
    "IsActive" boolean NOT NULL,
    "IsPrivate" boolean NOT NULL,
    "Role" integer NOT NULL,
    "TruthScore" numeric NOT NULL,
    "ReputationPoints" integer NOT NULL,
    "LastLoginAt" timestamp with time zone,
    "LastActiveAt" timestamp with time zone,
    "DeletedAt" timestamp with time zone,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "IsDeleted" boolean NOT NULL,
    CONSTRAINT "PK_Users" PRIMARY KEY ("Id")
);

CREATE TABLE app_data."AgentEvolutions" (
    "Id" uuid NOT NULL,
    "AgentId" uuid NOT NULL,
    "EvolutionType" character varying(100) NOT NULL,
    "PreviousState" jsonb,
    "NewState" jsonb,
    "MutationDescription" character varying(2000) NOT NULL,
    "FitnessBefore" numeric NOT NULL,
    "FitnessAfter" numeric NOT NULL,
    "IsSuccessful" boolean NOT NULL,
    "AppliedAt" timestamp with time zone NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "IsDeleted" boolean NOT NULL,
    "DeletedAt" timestamp with time zone,
    CONSTRAINT "PK_AgentEvolutions" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_AgentEvolutions_Agents_AgentId" FOREIGN KEY ("AgentId") REFERENCES app_data."Agents" ("Id") ON DELETE CASCADE
);

CREATE TABLE app_data."AgentInteractions" (
    "Id" uuid NOT NULL,
    "AgentId" uuid NOT NULL,
    "TargetAgentId" uuid,
    "TargetUserId" uuid,
    "Type" integer NOT NULL,
    "Content" character varying(2000) NOT NULL,
    "Response" jsonb,
    "Confidence" numeric,
    "IsSuccessful" boolean NOT NULL,
    "CompletedAt" timestamp with time zone NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "IsDeleted" boolean NOT NULL,
    "DeletedAt" timestamp with time zone,
    CONSTRAINT "PK_AgentInteractions" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_AgentInteractions_Agents_AgentId" FOREIGN KEY ("AgentId") REFERENCES app_data."Agents" ("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_AgentInteractions_Agents_TargetAgentId" FOREIGN KEY ("TargetAgentId") REFERENCES app_data."Agents" ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_AgentInteractions_Users_TargetUserId" FOREIGN KEY ("TargetUserId") REFERENCES app_data."Users" ("Id") ON DELETE RESTRICT
);

CREATE TABLE app_data."Conversation" (
    "Id" uuid NOT NULL,
    "IsGroup" boolean NOT NULL,
    "GroupName" text,
    "GroupAvatar" text,
    "CreatedBy" uuid NOT NULL,
    "LastMessageAt" timestamp with time zone,
    "CreatorId" uuid NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "IsDeleted" boolean NOT NULL,
    "DeletedAt" timestamp with time zone,
    CONSTRAINT "PK_Conversation" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_Conversation_Users_CreatorId" FOREIGN KEY ("CreatorId") REFERENCES app_data."Users" ("Id") ON DELETE CASCADE
);

CREATE TABLE app_data."Posts" (
    "Id" uuid NOT NULL,
    "UserId" uuid NOT NULL,
    "Content" text NOT NULL,
    "Type" integer NOT NULL,
    "MediaUrls" text[],
    "MediaMetadata" jsonb,
    "TruthScore" numeric,
    "TruthCorrection" text,
    "TruthSources" jsonb,
    "LocationName" text,
    "Latitude" numeric,
    "Longitude" numeric,
    "IsSensitive" boolean NOT NULL,
    "IsPinned" boolean NOT NULL,
    "IsDeleted" boolean NOT NULL,
    "ReplyToId" uuid,
    "RepostOfId" uuid,
    "QuoteOfId" uuid,
    "LikesCount" integer NOT NULL,
    "RepostsCount" integer NOT NULL,
    "CommentsCount" integer NOT NULL,
    "SharesCount" integer NOT NULL,
    "BookmarksCount" integer NOT NULL,
    "ViewsCount" integer NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "DeletedAt" timestamp with time zone,
    CONSTRAINT "PK_Posts" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_Posts_Posts_QuoteOfId" FOREIGN KEY ("QuoteOfId") REFERENCES app_data."Posts" ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_Posts_Posts_ReplyToId" FOREIGN KEY ("ReplyToId") REFERENCES app_data."Posts" ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_Posts_Posts_RepostOfId" FOREIGN KEY ("RepostOfId") REFERENCES app_data."Posts" ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_Posts_Users_UserId" FOREIGN KEY ("UserId") REFERENCES app_data."Users" ("Id") ON DELETE CASCADE
);

CREATE TABLE app_data."TruthClaims" (
    "Id" uuid NOT NULL,
    "ClaimText" text NOT NULL,
    "NormalizedClaim" text NOT NULL,
    "IsTrue" boolean NOT NULL,
    "Correction" text,
    "Explanation" text,
    "Sources" jsonb,
    "Confidence" numeric NOT NULL,
    "Category" text NOT NULL,
    "VerificationCount" integer NOT NULL,
    "CreatedBy" uuid,
    "ExpiresAt" timestamp with time zone,
    "CreatorId" uuid,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "IsDeleted" boolean NOT NULL,
    "DeletedAt" timestamp with time zone,
    CONSTRAINT "PK_TruthClaims" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_TruthClaims_Users_CreatorId" FOREIGN KEY ("CreatorId") REFERENCES app_data."Users" ("Id")
);

CREATE TABLE app_data."UserFollows" (
    "Id" uuid NOT NULL,
    "FollowerId" uuid NOT NULL,
    "FollowingId" uuid NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "IsDeleted" boolean NOT NULL,
    "DeletedAt" timestamp with time zone,
    CONSTRAINT "PK_UserFollows" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_UserFollows_Users_FollowerId" FOREIGN KEY ("FollowerId") REFERENCES app_data."Users" ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_UserFollows_Users_FollowingId" FOREIGN KEY ("FollowingId") REFERENCES app_data."Users" ("Id") ON DELETE RESTRICT
);

CREATE TABLE app_data."UserSettings" (
    "Id" uuid NOT NULL,
    "UserId" uuid NOT NULL,
    "Theme" text NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "IsDeleted" boolean NOT NULL,
    "DeletedAt" timestamp with time zone,
    CONSTRAINT "PK_UserSettings" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_UserSettings_Users_UserId" FOREIGN KEY ("UserId") REFERENCES app_data."Users" ("Id") ON DELETE CASCADE
);

CREATE TABLE app_data."UserSubscriptions" (
    "Id" uuid NOT NULL,
    "UserId" uuid NOT NULL,
    "StripeCustomerId" character varying(100) NOT NULL,
    "StripeSubscriptionId" character varying(100),
    "StripePriceId" character varying(100),
    "Status" character varying(50) NOT NULL,
    "CurrentPeriodEnd" timestamp with time zone,
    "CancelAtPeriodEnd" boolean NOT NULL,
    "LastWebhookEventId" character varying(100),
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "IsDeleted" boolean NOT NULL,
    "DeletedAt" timestamp with time zone,
    CONSTRAINT "PK_UserSubscriptions" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_UserSubscriptions_Users_UserId" FOREIGN KEY ("UserId") REFERENCES app_data."Users" ("Id") ON DELETE CASCADE
);

CREATE TABLE app_data."Videos" (
    "Id" uuid NOT NULL,
    "UserId" uuid NOT NULL,
    "Title" character varying(255) NOT NULL,
    "Description" character varying(2000),
    "VideoUrl" character varying(500) NOT NULL,
    "ThumbnailUrl" character varying(500),
    "Duration" integer,
    "YoutubeVideoId" character varying(50),
    "YoutubeUrl" character varying(500),
    "YoutubePublishStatus" integer NOT NULL,
    "YoutubePublishError" text,
    "YoutubeMetadata" jsonb,
    "ViewsCount" integer NOT NULL,
    "LikesCount" integer NOT NULL,
    "CommentsCount" integer NOT NULL,
    "SharesCount" integer NOT NULL,
    "Tags" text[],
    "Privacy" integer NOT NULL,
    "Status" integer NOT NULL,
    "PublishedAt" timestamp with time zone,
    "DeletedAt" timestamp with time zone,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "IsDeleted" boolean NOT NULL,
    CONSTRAINT "PK_Videos" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_Videos_Users_UserId" FOREIGN KEY ("UserId") REFERENCES app_data."Users" ("Id") ON DELETE CASCADE
);

CREATE TABLE app_data."ConversationParticipant" (
    "Id" uuid NOT NULL,
    "ConversationId" uuid NOT NULL,
    "UserId" uuid NOT NULL,
    "JoinedAt" timestamp with time zone NOT NULL,
    "LastReadAt" timestamp with time zone,
    "IsMuted" boolean NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "IsDeleted" boolean NOT NULL,
    "DeletedAt" timestamp with time zone,
    CONSTRAINT "PK_ConversationParticipant" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_ConversationParticipant_Conversation_ConversationId" FOREIGN KEY ("ConversationId") REFERENCES app_data."Conversation" ("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_ConversationParticipant_Users_UserId" FOREIGN KEY ("UserId") REFERENCES app_data."Users" ("Id") ON DELETE CASCADE
);

CREATE TABLE app_data."Message" (
    "Id" uuid NOT NULL,
    "ConversationId" uuid NOT NULL,
    "SenderId" uuid NOT NULL,
    "Content" character varying(2000) NOT NULL,
    "Type" integer NOT NULL,
    "MediaUrls" text[],
    "IsRead" boolean NOT NULL,
    "IsDeleted" boolean NOT NULL,
    "ReplyToId" uuid,
    "ReadAt" timestamp with time zone,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "DeletedAt" timestamp with time zone,
    CONSTRAINT "PK_Message" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_Message_Conversation_ConversationId" FOREIGN KEY ("ConversationId") REFERENCES app_data."Conversation" ("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_Message_Message_ReplyToId" FOREIGN KEY ("ReplyToId") REFERENCES app_data."Message" ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_Message_Users_SenderId" FOREIGN KEY ("SenderId") REFERENCES app_data."Users" ("Id") ON DELETE CASCADE
);

CREATE TABLE app_data."Comment" (
    "Id" uuid NOT NULL,
    "PostId" uuid NOT NULL,
    "UserId" uuid NOT NULL,
    "ParentCommentId" uuid,
    "Content" character varying(500) NOT NULL,
    "LikesCount" integer NOT NULL,
    "RepliesCount" integer NOT NULL,
    "IsDeleted" boolean NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "DeletedAt" timestamp with time zone,
    CONSTRAINT "PK_Comment" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_Comment_Comment_ParentCommentId" FOREIGN KEY ("ParentCommentId") REFERENCES app_data."Comment" ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_Comment_Posts_PostId" FOREIGN KEY ("PostId") REFERENCES app_data."Posts" ("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_Comment_Users_UserId" FOREIGN KEY ("UserId") REFERENCES app_data."Users" ("Id") ON DELETE CASCADE
);

CREATE TABLE app_data."PostLikes" (
    "Id" uuid NOT NULL,
    "PostId" uuid NOT NULL,
    "UserId" uuid NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "IsDeleted" boolean NOT NULL,
    "DeletedAt" timestamp with time zone,
    CONSTRAINT "PK_PostLikes" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_PostLikes_Posts_PostId" FOREIGN KEY ("PostId") REFERENCES app_data."Posts" ("Id") ON DELETE CASCADE
);

CREATE TABLE app_data."PostReposts" (
    "Id" uuid NOT NULL,
    "PostId" uuid NOT NULL,
    "UserId" uuid NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "IsDeleted" boolean NOT NULL,
    "DeletedAt" timestamp with time zone,
    CONSTRAINT "PK_PostReposts" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_PostReposts_Posts_PostId" FOREIGN KEY ("PostId") REFERENCES app_data."Posts" ("Id") ON DELETE CASCADE
);

CREATE TABLE app_data."TruthDisputes" (
    "Id" uuid NOT NULL,
    "PostId" uuid NOT NULL,
    "UserId" uuid NOT NULL,
    "Reason" character varying(1000) NOT NULL,
    "Evidence" character varying(2000),
    "Status" integer NOT NULL,
    "ResolutionNotes" text,
    "ResolvedBy" uuid,
    "ResolvedAt" timestamp with time zone,
    "TruthClaimId" uuid,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "IsDeleted" boolean NOT NULL,
    "DeletedAt" timestamp with time zone,
    CONSTRAINT "PK_TruthDisputes" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_TruthDisputes_Posts_PostId" FOREIGN KEY ("PostId") REFERENCES app_data."Posts" ("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_TruthDisputes_TruthClaims_TruthClaimId" FOREIGN KEY ("TruthClaimId") REFERENCES app_data."TruthClaims" ("Id"),
    CONSTRAINT "FK_TruthDisputes_Users_ResolvedBy" FOREIGN KEY ("ResolvedBy") REFERENCES app_data."Users" ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_TruthDisputes_Users_UserId" FOREIGN KEY ("UserId") REFERENCES app_data."Users" ("Id") ON DELETE CASCADE
);

CREATE TABLE app_data."TruthVerificationVotes" (
    "Id" uuid NOT NULL,
    "ClaimId" uuid NOT NULL,
    "UserId" uuid NOT NULL,
    "VoteType" boolean,
    "ConfidenceScore" integer NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "IsDeleted" boolean NOT NULL,
    "DeletedAt" timestamp with time zone,
    CONSTRAINT "PK_TruthVerificationVotes" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_TruthVerificationVotes_TruthClaims_ClaimId" FOREIGN KEY ("ClaimId") REFERENCES app_data."TruthClaims" ("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_TruthVerificationVotes_Users_UserId" FOREIGN KEY ("UserId") REFERENCES app_data."Users" ("Id") ON DELETE CASCADE
);

CREATE TABLE app_data."VideoComment" (
    "Id" uuid NOT NULL,
    "VideoId" uuid NOT NULL,
    "UserId" uuid NOT NULL,
    "ParentCommentId" uuid,
    "Content" character varying(500) NOT NULL,
    "LikesCount" integer NOT NULL,
    "IsDeleted" boolean NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "DeletedAt" timestamp with time zone,
    CONSTRAINT "PK_VideoComment" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_VideoComment_Users_UserId" FOREIGN KEY ("UserId") REFERENCES app_data."Users" ("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_VideoComment_VideoComment_ParentCommentId" FOREIGN KEY ("ParentCommentId") REFERENCES app_data."VideoComment" ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_VideoComment_Videos_VideoId" FOREIGN KEY ("VideoId") REFERENCES app_data."Videos" ("Id") ON DELETE CASCADE
);

CREATE TABLE app_data."VideoLike" (
    "Id" uuid NOT NULL,
    "VideoId" uuid NOT NULL,
    "UserId" uuid NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "IsDeleted" boolean NOT NULL,
    "DeletedAt" timestamp with time zone,
    CONSTRAINT "PK_VideoLike" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_VideoLike_Users_UserId" FOREIGN KEY ("UserId") REFERENCES app_data."Users" ("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_VideoLike_Videos_VideoId" FOREIGN KEY ("VideoId") REFERENCES app_data."Videos" ("Id") ON DELETE CASCADE
);

CREATE TABLE app_data."CommentLike" (
    "Id" uuid NOT NULL,
    "CommentId" uuid NOT NULL,
    "UserId" uuid NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "IsDeleted" boolean NOT NULL,
    "DeletedAt" timestamp with time zone,
    CONSTRAINT "PK_CommentLike" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_CommentLike_Comment_CommentId" FOREIGN KEY ("CommentId") REFERENCES app_data."Comment" ("Id") ON DELETE CASCADE
);

CREATE INDEX "IX_AgentEvolutions_AgentId" ON app_data."AgentEvolutions" ("AgentId");

CREATE INDEX "IX_AgentInteractions_AgentId" ON app_data."AgentInteractions" ("AgentId");

CREATE INDEX "IX_AgentInteractions_TargetAgentId" ON app_data."AgentInteractions" ("TargetAgentId");

CREATE INDEX "IX_AgentInteractions_TargetUserId" ON app_data."AgentInteractions" ("TargetUserId");

CREATE INDEX "IX_Comment_ParentCommentId" ON app_data."Comment" ("ParentCommentId");

CREATE INDEX "IX_Comment_PostId" ON app_data."Comment" ("PostId");

CREATE INDEX "IX_Comment_UserId" ON app_data."Comment" ("UserId");

CREATE INDEX "IX_CommentLike_CommentId" ON app_data."CommentLike" ("CommentId");

CREATE INDEX "IX_Conversation_CreatorId" ON app_data."Conversation" ("CreatorId");

CREATE INDEX "IX_ConversationParticipant_ConversationId" ON app_data."ConversationParticipant" ("ConversationId");

CREATE INDEX "IX_ConversationParticipant_UserId" ON app_data."ConversationParticipant" ("UserId");

CREATE INDEX "IX_Message_ConversationId" ON app_data."Message" ("ConversationId");

CREATE INDEX "IX_Message_ReplyToId" ON app_data."Message" ("ReplyToId");

CREATE INDEX "IX_Message_SenderId" ON app_data."Message" ("SenderId");

CREATE INDEX "IX_PostLikes_PostId" ON app_data."PostLikes" ("PostId");

CREATE INDEX "IX_PostReposts_PostId" ON app_data."PostReposts" ("PostId");

CREATE INDEX "IX_Posts_QuoteOfId" ON app_data."Posts" ("QuoteOfId");

CREATE INDEX "IX_Posts_ReplyToId" ON app_data."Posts" ("ReplyToId");

CREATE INDEX "IX_Posts_RepostOfId" ON app_data."Posts" ("RepostOfId");

CREATE INDEX "IX_Posts_UserId" ON app_data."Posts" ("UserId");

CREATE INDEX "IX_TruthClaims_CreatorId" ON app_data."TruthClaims" ("CreatorId");

CREATE INDEX "IX_TruthDisputes_PostId" ON app_data."TruthDisputes" ("PostId");

CREATE INDEX "IX_TruthDisputes_ResolvedBy" ON app_data."TruthDisputes" ("ResolvedBy");

CREATE INDEX "IX_TruthDisputes_TruthClaimId" ON app_data."TruthDisputes" ("TruthClaimId");

CREATE INDEX "IX_TruthDisputes_UserId" ON app_data."TruthDisputes" ("UserId");

CREATE INDEX "IX_TruthVerificationVotes_ClaimId" ON app_data."TruthVerificationVotes" ("ClaimId");

CREATE INDEX "IX_TruthVerificationVotes_UserId" ON app_data."TruthVerificationVotes" ("UserId");

CREATE UNIQUE INDEX "IX_UserFollows_FollowerId_FollowingId" ON app_data."UserFollows" ("FollowerId", "FollowingId");

CREATE INDEX "IX_UserFollows_FollowingId" ON app_data."UserFollows" ("FollowingId");

CREATE UNIQUE INDEX "IX_UserSettings_UserId" ON app_data."UserSettings" ("UserId");

CREATE UNIQUE INDEX "IX_UserSubscriptions_StripeCustomerId" ON app_data."UserSubscriptions" ("StripeCustomerId");

CREATE UNIQUE INDEX "IX_UserSubscriptions_StripeSubscriptionId" ON app_data."UserSubscriptions" ("StripeSubscriptionId") WHERE "StripeSubscriptionId" IS NOT NULL;

CREATE UNIQUE INDEX "IX_UserSubscriptions_UserId" ON app_data."UserSubscriptions" ("UserId");

CREATE INDEX "IX_VideoComment_ParentCommentId" ON app_data."VideoComment" ("ParentCommentId");

CREATE INDEX "IX_VideoComment_UserId" ON app_data."VideoComment" ("UserId");

CREATE INDEX "IX_VideoComment_VideoId" ON app_data."VideoComment" ("VideoId");

CREATE INDEX "IX_VideoLike_UserId" ON app_data."VideoLike" ("UserId");

CREATE INDEX "IX_VideoLike_VideoId" ON app_data."VideoLike" ("VideoId");

CREATE INDEX "IX_Videos_UserId" ON app_data."Videos" ("UserId");

INSERT INTO app_data."__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20260801231625_InitialFullSchemaAppData', '10.0.10');

COMMIT;

-- ============================================================================
-- Additional runtime tables (non-EF) used by Wiseravenshare services
-- and DigitalOcean Buckets/Spaces upload metadata.
-- Compatible with PostgreSQL (DigitalOcean Managed Postgres).
-- ============================================================================

DO $WS$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'app_data') THEN
        CREATE SCHEMA app_data;
    END IF;
END $WS$;

-- UserStore durable auth/profile persistence table.
CREATE TABLE IF NOT EXISTS app_data.app_users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    handle TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    bio TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    website TEXT NOT NULL DEFAULT '',
    avatar TEXT NOT NULL DEFAULT '',
    social_feeds JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at_utc TIMESTAMPTZ NOT NULL,
    updated_at_utc TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_app_users_handle
    ON app_data.app_users(handle);

-- Video library runtime table used by VideoLibraryStore.
CREATE TABLE IF NOT EXISTS app_data.ravensight_videos (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    video_url TEXT NOT NULL,
    thumbnail_url TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'published',
    privacy_status TEXT NOT NULL DEFAULT 'unlisted',
    youtube_url TEXT NULL,
    tiktok_url TEXT NULL,
    facebook_url TEXT NULL,
    views INTEGER NOT NULL DEFAULT 0,
    likes INTEGER NOT NULL DEFAULT 0,
    comments INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ravensight_videos_user_id_created_at
    ON app_data.ravensight_videos (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ravensight_videos_created_at
    ON app_data.ravensight_videos (created_at DESC);

CREATE TABLE IF NOT EXISTS app_data.ravensight_video_comments (
    id TEXT PRIMARY KEY,
    video_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    comment TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT fk_ravensight_video_comments_video
        FOREIGN KEY (video_id) REFERENCES app_data.ravensight_videos (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ravensight_video_comments_video_id_created_at
    ON app_data.ravensight_video_comments (video_id, created_at DESC);

-- DigitalOcean Buckets/Spaces object registry.
-- Store each uploaded object key + metadata for retrieval/auditing/CDN mapping.
-- Hardcoded location requested by owner:
-- bucket: allbuckets1786108292029
-- folder: wiseravensharefolder/
CREATE TABLE IF NOT EXISTS app_data.bucket_objects (
    id TEXT PRIMARY KEY,
    owner_user_id UUID NULL,
    provider TEXT NOT NULL DEFAULT 'digitalocean_spaces',
    bucket_name TEXT NOT NULL DEFAULT 'allbuckets1786108292029',
    region TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    folder_path TEXT NOT NULL DEFAULT 'wiseravensharefolder/',
    object_key TEXT NOT NULL,
    original_file_name TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
    etag TEXT NULL,
    acl TEXT NOT NULL DEFAULT 'private',
    cdn_base_url TEXT NULL,
    public_url TEXT NULL,
    upload_status TEXT NOT NULL DEFAULT 'uploaded',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ NULL,
    CONSTRAINT fk_bucket_objects_owner
        FOREIGN KEY (owner_user_id) REFERENCES app_data."Users" ("Id") ON DELETE SET NULL,
    CONSTRAINT ck_bucket_objects_bucket_hardcoded
        CHECK (bucket_name = 'allbuckets1786108292029'),
    CONSTRAINT ck_bucket_objects_folder_hardcoded
        CHECK (folder_path = 'wiseravensharefolder/'),
    CONSTRAINT uq_bucket_objects_bucket_key UNIQUE (bucket_name, object_key)
);

CREATE INDEX IF NOT EXISTS idx_bucket_objects_owner_created
    ON app_data.bucket_objects (owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bucket_objects_folder_created
    ON app_data.bucket_objects (folder_path, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bucket_objects_status_created
    ON app_data.bucket_objects (upload_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bucket_objects_metadata_gin
    ON app_data.bucket_objects USING GIN (metadata);

-- Keep updated_at current for object metadata updates.
CREATE OR REPLACE FUNCTION app_data.set_updated_at_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bucket_objects_updated_at ON app_data.bucket_objects;
CREATE TRIGGER trg_bucket_objects_updated_at
BEFORE UPDATE ON app_data.bucket_objects
FOR EACH ROW EXECUTE FUNCTION app_data.set_updated_at_timestamp();
