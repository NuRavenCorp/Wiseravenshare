DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname = 'public') THEN
        CREATE SCHEMA public;
    END IF;
END $EF$;
CREATE TABLE IF NOT EXISTS public."__EFMigrationsHistory" (
    "MigrationId" character varying(150) NOT NULL,
    "ProductVersion" character varying(32) NOT NULL,
    CONSTRAINT "PK___EFMigrationsHistory" PRIMARY KEY ("MigrationId")
);

START TRANSACTION;
DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname = 'public') THEN
        CREATE SCHEMA public;
    END IF;
END $EF$;

CREATE TABLE public."Agents" (
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

CREATE TABLE public."PostBookmarks" (
    "Id" uuid NOT NULL,
    "PostId" uuid NOT NULL,
    "UserId" uuid NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "IsDeleted" boolean NOT NULL,
    "DeletedAt" timestamp with time zone,
    CONSTRAINT "PK_PostBookmarks" PRIMARY KEY ("Id")
);

CREATE TABLE public."Users" (
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

CREATE TABLE public."AgentEvolutions" (
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
    CONSTRAINT "FK_AgentEvolutions_Agents_AgentId" FOREIGN KEY ("AgentId") REFERENCES public."Agents" ("Id") ON DELETE CASCADE
);

CREATE TABLE public."AgentInteractions" (
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
    CONSTRAINT "FK_AgentInteractions_Agents_AgentId" FOREIGN KEY ("AgentId") REFERENCES public."Agents" ("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_AgentInteractions_Agents_TargetAgentId" FOREIGN KEY ("TargetAgentId") REFERENCES public."Agents" ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_AgentInteractions_Users_TargetUserId" FOREIGN KEY ("TargetUserId") REFERENCES public."Users" ("Id") ON DELETE RESTRICT
);

CREATE TABLE public."Conversation" (
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
    CONSTRAINT "FK_Conversation_Users_CreatorId" FOREIGN KEY ("CreatorId") REFERENCES public."Users" ("Id") ON DELETE CASCADE
);

CREATE TABLE public."Posts" (
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
    "IsTruthDispatch" boolean NOT NULL DEFAULT false,
    "TruthDeclarationAccepted" boolean NOT NULL DEFAULT false,
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
    CONSTRAINT "FK_Posts_Posts_QuoteOfId" FOREIGN KEY ("QuoteOfId") REFERENCES public."Posts" ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_Posts_Posts_ReplyToId" FOREIGN KEY ("ReplyToId") REFERENCES public."Posts" ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_Posts_Posts_RepostOfId" FOREIGN KEY ("RepostOfId") REFERENCES public."Posts" ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_Posts_Users_UserId" FOREIGN KEY ("UserId") REFERENCES public."Users" ("Id") ON DELETE CASCADE
);

CREATE TABLE public."TruthClaims" (
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
    CONSTRAINT "FK_TruthClaims_Users_CreatorId" FOREIGN KEY ("CreatorId") REFERENCES public."Users" ("Id")
);

CREATE TABLE public."UserFollows" (
    "Id" uuid NOT NULL,
    "FollowerId" uuid NOT NULL,
    "FollowingId" uuid NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "IsDeleted" boolean NOT NULL,
    "DeletedAt" timestamp with time zone,
    CONSTRAINT "PK_UserFollows" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_UserFollows_Users_FollowerId" FOREIGN KEY ("FollowerId") REFERENCES public."Users" ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_UserFollows_Users_FollowingId" FOREIGN KEY ("FollowingId") REFERENCES public."Users" ("Id") ON DELETE RESTRICT
);

CREATE TABLE public."UserSettings" (
    "Id" uuid NOT NULL,
    "UserId" uuid NOT NULL,
    "Theme" text NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "IsDeleted" boolean NOT NULL,
    "DeletedAt" timestamp with time zone,
    CONSTRAINT "PK_UserSettings" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_UserSettings_Users_UserId" FOREIGN KEY ("UserId") REFERENCES public."Users" ("Id") ON DELETE CASCADE
);

CREATE TABLE public."UserSubscriptions" (
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
    CONSTRAINT "FK_UserSubscriptions_Users_UserId" FOREIGN KEY ("UserId") REFERENCES public."Users" ("Id") ON DELETE CASCADE
);

CREATE TABLE public."Videos" (
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
    CONSTRAINT "FK_Videos_Users_UserId" FOREIGN KEY ("UserId") REFERENCES public."Users" ("Id") ON DELETE CASCADE
);

CREATE TABLE public."ConversationParticipant" (
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
    CONSTRAINT "FK_ConversationParticipant_Conversation_ConversationId" FOREIGN KEY ("ConversationId") REFERENCES public."Conversation" ("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_ConversationParticipant_Users_UserId" FOREIGN KEY ("UserId") REFERENCES public."Users" ("Id") ON DELETE CASCADE
);

CREATE TABLE public."Message" (
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
    CONSTRAINT "FK_Message_Conversation_ConversationId" FOREIGN KEY ("ConversationId") REFERENCES public."Conversation" ("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_Message_Message_ReplyToId" FOREIGN KEY ("ReplyToId") REFERENCES public."Message" ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_Message_Users_SenderId" FOREIGN KEY ("SenderId") REFERENCES public."Users" ("Id") ON DELETE CASCADE
);

CREATE TABLE public."Comment" (
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
    CONSTRAINT "FK_Comment_Comment_ParentCommentId" FOREIGN KEY ("ParentCommentId") REFERENCES public."Comment" ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_Comment_Posts_PostId" FOREIGN KEY ("PostId") REFERENCES public."Posts" ("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_Comment_Users_UserId" FOREIGN KEY ("UserId") REFERENCES public."Users" ("Id") ON DELETE CASCADE
);

CREATE TABLE public."PostLikes" (
    "Id" uuid NOT NULL,
    "PostId" uuid NOT NULL,
    "UserId" uuid NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "IsDeleted" boolean NOT NULL,
    "DeletedAt" timestamp with time zone,
    CONSTRAINT "PK_PostLikes" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_PostLikes_Posts_PostId" FOREIGN KEY ("PostId") REFERENCES public."Posts" ("Id") ON DELETE CASCADE
);

CREATE TABLE public."PostReposts" (
    "Id" uuid NOT NULL,
    "PostId" uuid NOT NULL,
    "UserId" uuid NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "IsDeleted" boolean NOT NULL,
    "DeletedAt" timestamp with time zone,
    CONSTRAINT "PK_PostReposts" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_PostReposts_Posts_PostId" FOREIGN KEY ("PostId") REFERENCES public."Posts" ("Id") ON DELETE CASCADE
);

CREATE TABLE public."TruthDisputes" (
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
    CONSTRAINT "FK_TruthDisputes_Posts_PostId" FOREIGN KEY ("PostId") REFERENCES public."Posts" ("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_TruthDisputes_TruthClaims_TruthClaimId" FOREIGN KEY ("TruthClaimId") REFERENCES public."TruthClaims" ("Id"),
    CONSTRAINT "FK_TruthDisputes_Users_ResolvedBy" FOREIGN KEY ("ResolvedBy") REFERENCES public."Users" ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_TruthDisputes_Users_UserId" FOREIGN KEY ("UserId") REFERENCES public."Users" ("Id") ON DELETE CASCADE
);

CREATE TABLE public."TruthVerificationVotes" (
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
    CONSTRAINT "FK_TruthVerificationVotes_TruthClaims_ClaimId" FOREIGN KEY ("ClaimId") REFERENCES public."TruthClaims" ("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_TruthVerificationVotes_Users_UserId" FOREIGN KEY ("UserId") REFERENCES public."Users" ("Id") ON DELETE CASCADE
);

CREATE TABLE public."VideoComment" (
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
    CONSTRAINT "FK_VideoComment_Users_UserId" FOREIGN KEY ("UserId") REFERENCES public."Users" ("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_VideoComment_VideoComment_ParentCommentId" FOREIGN KEY ("ParentCommentId") REFERENCES public."VideoComment" ("Id") ON DELETE RESTRICT,
    CONSTRAINT "FK_VideoComment_Videos_VideoId" FOREIGN KEY ("VideoId") REFERENCES public."Videos" ("Id") ON DELETE CASCADE
);

CREATE TABLE public."VideoLike" (
    "Id" uuid NOT NULL,
    "VideoId" uuid NOT NULL,
    "UserId" uuid NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "IsDeleted" boolean NOT NULL,
    "DeletedAt" timestamp with time zone,
    CONSTRAINT "PK_VideoLike" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_VideoLike_Users_UserId" FOREIGN KEY ("UserId") REFERENCES public."Users" ("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_VideoLike_Videos_VideoId" FOREIGN KEY ("VideoId") REFERENCES public."Videos" ("Id") ON DELETE CASCADE
);

CREATE TABLE public."CommentLike" (
    "Id" uuid NOT NULL,
    "CommentId" uuid NOT NULL,
    "UserId" uuid NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "IsDeleted" boolean NOT NULL,
    "DeletedAt" timestamp with time zone,
    CONSTRAINT "PK_CommentLike" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_CommentLike_Comment_CommentId" FOREIGN KEY ("CommentId") REFERENCES public."Comment" ("Id") ON DELETE CASCADE
);

CREATE INDEX "IX_AgentEvolutions_AgentId" ON public."AgentEvolutions" ("AgentId");

CREATE INDEX "IX_AgentInteractions_AgentId" ON public."AgentInteractions" ("AgentId");

CREATE INDEX "IX_AgentInteractions_TargetAgentId" ON public."AgentInteractions" ("TargetAgentId");

CREATE INDEX "IX_AgentInteractions_TargetUserId" ON public."AgentInteractions" ("TargetUserId");

CREATE INDEX "IX_Comment_ParentCommentId" ON public."Comment" ("ParentCommentId");

CREATE INDEX "IX_Comment_PostId" ON public."Comment" ("PostId");

CREATE INDEX "IX_Comment_UserId" ON public."Comment" ("UserId");

CREATE INDEX "IX_CommentLike_CommentId" ON public."CommentLike" ("CommentId");

CREATE INDEX "IX_Conversation_CreatorId" ON public."Conversation" ("CreatorId");

CREATE INDEX "IX_ConversationParticipant_ConversationId" ON public."ConversationParticipant" ("ConversationId");

CREATE INDEX "IX_ConversationParticipant_UserId" ON public."ConversationParticipant" ("UserId");

CREATE INDEX "IX_Message_ConversationId" ON public."Message" ("ConversationId");

CREATE INDEX "IX_Message_ReplyToId" ON public."Message" ("ReplyToId");

CREATE INDEX "IX_Message_SenderId" ON public."Message" ("SenderId");

CREATE INDEX "IX_PostLikes_PostId" ON public."PostLikes" ("PostId");

CREATE INDEX "IX_PostReposts_PostId" ON public."PostReposts" ("PostId");

CREATE INDEX "IX_Posts_QuoteOfId" ON public."Posts" ("QuoteOfId");

CREATE INDEX "IX_Posts_ReplyToId" ON public."Posts" ("ReplyToId");

CREATE INDEX "IX_Posts_RepostOfId" ON public."Posts" ("RepostOfId");

CREATE INDEX "IX_Posts_UserId" ON public."Posts" ("UserId");

CREATE INDEX "IX_TruthClaims_CreatorId" ON public."TruthClaims" ("CreatorId");

CREATE INDEX "IX_TruthDisputes_PostId" ON public."TruthDisputes" ("PostId");

CREATE INDEX "IX_TruthDisputes_ResolvedBy" ON public."TruthDisputes" ("ResolvedBy");

CREATE INDEX "IX_TruthDisputes_TruthClaimId" ON public."TruthDisputes" ("TruthClaimId");

CREATE INDEX "IX_TruthDisputes_UserId" ON public."TruthDisputes" ("UserId");

CREATE INDEX "IX_TruthVerificationVotes_ClaimId" ON public."TruthVerificationVotes" ("ClaimId");

CREATE INDEX "IX_TruthVerificationVotes_UserId" ON public."TruthVerificationVotes" ("UserId");

CREATE UNIQUE INDEX "IX_UserFollows_FollowerId_FollowingId" ON public."UserFollows" ("FollowerId", "FollowingId");

CREATE INDEX "IX_UserFollows_FollowingId" ON public."UserFollows" ("FollowingId");

CREATE UNIQUE INDEX "IX_UserSettings_UserId" ON public."UserSettings" ("UserId");

CREATE UNIQUE INDEX "IX_UserSubscriptions_StripeCustomerId" ON public."UserSubscriptions" ("StripeCustomerId");

CREATE UNIQUE INDEX "IX_UserSubscriptions_StripeSubscriptionId" ON public."UserSubscriptions" ("StripeSubscriptionId") WHERE "StripeSubscriptionId" IS NOT NULL;

CREATE UNIQUE INDEX "IX_UserSubscriptions_UserId" ON public."UserSubscriptions" ("UserId");

CREATE INDEX "IX_VideoComment_ParentCommentId" ON public."VideoComment" ("ParentCommentId");

CREATE INDEX "IX_VideoComment_UserId" ON public."VideoComment" ("UserId");

CREATE INDEX "IX_VideoComment_VideoId" ON public."VideoComment" ("VideoId");

CREATE INDEX "IX_VideoLike_UserId" ON public."VideoLike" ("UserId");

CREATE INDEX "IX_VideoLike_VideoId" ON public."VideoLike" ("VideoId");

CREATE INDEX "IX_Videos_UserId" ON public."Videos" ("UserId");

INSERT INTO public."__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20260801231625_InitialFullSchemaAppData', '10.0.10');

COMMIT;

-- ============================================================================
-- Additional runtime tables (non-EF) used by Wiseravenshare services
-- and DigitalOcean Buckets/Spaces upload metadata.
-- Compatible with PostgreSQL (DigitalOcean Managed Postgres).
-- ============================================================================

DO $WS$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'public') THEN
        CREATE SCHEMA public;
    END IF;
END $WS$;

-- UserStore durable auth/profile persistence table schema definition.
CREATE TABLE IF NOT EXISTS public.app_users (
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
    ON public.app_users(handle);

-- Video library runtime table used by VideoLibraryStore.
CREATE TABLE IF NOT EXISTS public.ravensight_videos (
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
    ON public.ravensight_videos (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ravensight_videos_created_at
    ON public.ravensight_videos (created_at DESC);

CREATE TABLE IF NOT EXISTS public.ravensight_video_comments (
    id TEXT PRIMARY KEY,
    video_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    comment TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT fk_ravensight_video_comments_video
        FOREIGN KEY (video_id) REFERENCES public.ravensight_videos (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ravensight_video_comments_video_id_created_at
    ON public.ravensight_video_comments (video_id, created_at DESC);

-- DigitalOcean Buckets/Spaces object registry.
-- Store each uploaded object key + metadata for retrieval/auditing/CDN mapping.
-- Project default folder:
-- folder: wiseravenshare/
CREATE TABLE IF NOT EXISTS public.bucket_objects (
    id TEXT PRIMARY KEY,
    owner_user_id UUID NULL,
    provider TEXT NOT NULL DEFAULT 'digitalocean_spaces',
    bucket_name TEXT NOT NULL DEFAULT 'bucket-wrs-01010',
    region TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    folder_path TEXT NOT NULL DEFAULT 'wiseravenshare/',
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
        FOREIGN KEY (owner_user_id) REFERENCES public."Users" ("Id") ON DELETE SET NULL,
    CONSTRAINT uq_bucket_objects_bucket_key UNIQUE (bucket_name, object_key)
);

CREATE INDEX IF NOT EXISTS idx_bucket_objects_owner_created
    ON public.bucket_objects (owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bucket_objects_folder_created
    ON public.bucket_objects (folder_path, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bucket_objects_status_created
    ON public.bucket_objects (upload_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bucket_objects_metadata_gin
    ON public.bucket_objects USING GIN (metadata);

-- Keep updated_at current for object metadata updates.
CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bucket_objects_updated_at ON public.bucket_objects;
CREATE TRIGGER trg_bucket_objects_updated_at
BEFORE UPDATE ON public.bucket_objects
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();
