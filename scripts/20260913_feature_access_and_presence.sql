CREATE TABLE IF NOT EXISTS app_data."UserCompartmentAssignments" (
    "Id" uuid PRIMARY KEY,
    "UserId" uuid NOT NULL,
    "Compartment" text NOT NULL CHECK ("Compartment" IN ('Public', 'Guest', 'Member', 'Creator', 'Premium', 'Moderator', 'Admin', 'Ops')),
    "IsOverride" boolean NOT NULL DEFAULT false,
    "IsActive" boolean NOT NULL DEFAULT true,
    "ExpiresAt" timestamptz NULL,
    "CreatedAt" timestamptz NOT NULL DEFAULT now(),
    "UpdatedAt" timestamptz NOT NULL DEFAULT now(),
    "IsDeleted" boolean NOT NULL DEFAULT false,
    "DeletedAt" timestamptz NULL
);

CREATE TABLE IF NOT EXISTS app_data."FeatureFlags" (
    "Id" uuid PRIMARY KEY,
    "FeatureKey" text NOT NULL,
    "Scope" text NOT NULL CHECK ("Scope" IN ('Global', 'Compartment', 'Role', 'User')),
    "ScopeValue" text NULL,
    "State" text NOT NULL CHECK ("State" IN ('Enabled', 'Disabled', 'Hidden', 'Maintenance')),
    "Notes" text NULL,
    "ExpiresAt" timestamptz NULL,
    "CreatedAt" timestamptz NOT NULL DEFAULT now(),
    "UpdatedAt" timestamptz NOT NULL DEFAULT now(),
    "IsDeleted" boolean NOT NULL DEFAULT false,
    "DeletedAt" timestamptz NULL
);

CREATE TABLE IF NOT EXISTS app_data."UserPresence" (
    "Id" uuid PRIMARY KEY,
    "UserId" uuid NOT NULL,
    "State" text NOT NULL CHECK ("State" IN ('Offline', 'Online', 'Away', 'Suspended')),
    "LastSeenUtc" timestamptz NOT NULL DEFAULT now(),
    "LastHeartbeatUtc" timestamptz NULL,
    "DeviceName" text NULL,
    "IpAddress" text NULL,
    "IsAdminVisible" boolean NOT NULL DEFAULT false,
    "CreatedAt" timestamptz NOT NULL DEFAULT now(),
    "UpdatedAt" timestamptz NOT NULL DEFAULT now(),
    "IsDeleted" boolean NOT NULL DEFAULT false,
    "DeletedAt" timestamptz NULL
);

CREATE TABLE IF NOT EXISTS app_data."FeatureAuditLogs" (
    "Id" uuid PRIMARY KEY,
    "ActorUserId" uuid NULL,
    "FeatureKey" text NOT NULL,
    "Scope" text NOT NULL CHECK ("Scope" IN ('Global', 'Compartment', 'Role', 'User')),
    "ScopeValue" text NULL,
    "OldState" text NULL,
    "NewState" text NOT NULL,
    "Reason" text NULL,
    "CreatedAt" timestamptz NOT NULL DEFAULT now(),
    "UpdatedAt" timestamptz NOT NULL DEFAULT now(),
    "IsDeleted" boolean NOT NULL DEFAULT false,
    "DeletedAt" timestamptz NULL
);

CREATE INDEX IF NOT EXISTS ix_feature_flags_feature_key
    ON app_data."FeatureFlags" ("FeatureKey");

CREATE INDEX IF NOT EXISTS ix_feature_flags_scope_value
    ON app_data."FeatureFlags" ("Scope", "ScopeValue");

CREATE INDEX IF NOT EXISTS ix_user_compartment_assignments_user_id
    ON app_data."UserCompartmentAssignments" ("UserId");

CREATE INDEX IF NOT EXISTS ix_user_compartment_assignments_compartment
    ON app_data."UserCompartmentAssignments" ("Compartment");

CREATE INDEX IF NOT EXISTS ix_user_presence_user_id
    ON app_data."UserPresence" ("UserId");

CREATE INDEX IF NOT EXISTS ix_user_presence_visible
    ON app_data."UserPresence" ("IsAdminVisible", "LastSeenUtc" DESC);

INSERT INTO app_data."FeatureFlags" ("Id", "FeatureKey", "Scope", "ScopeValue", "State", "Notes", "CreatedAt", "UpdatedAt")
VALUES
    (gen_random_uuid(), 'site.maintenance', 'Global', NULL, 'Enabled', 'System-wide normal operation', now(), now()),
    (gen_random_uuid(), 'public.feed', 'Compartment', 'Public', 'Enabled', 'Public content feed available', now(), now()),
    (gen_random_uuid(), 'member.dashboard', 'Compartment', 'Member', 'Enabled', 'Member dashboard accessible', now(), now()),
    (gen_random_uuid(), 'creator.upload', 'Compartment', 'Creator', 'Enabled', 'Creator upload flow enabled', now(), now()),
    (gen_random_uuid(), 'truth.verification', 'Compartment', 'Moderator', 'Enabled', 'Verification workflows enabled for moderators', now(), now()),
    (gen_random_uuid(), 'admin.ops.visibility', 'Compartment', 'Admin', 'Enabled', 'Admin-only admin ops visible', now(), now())
ON CONFLICT DO NOTHING;
