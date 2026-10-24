export const WISERAVENSHARE_ENTITIES = [
  {
    "name": "AdminAccessRequest",
    "group": "admin",
    "description": "Administrative access requests. Source RLS is enforced by WiseRavenShare application authorization rather than by the DigitalOcean PostgreSQL proxy.",
    "required": [
      "requester_email"
    ],
    "defaults": {
      "status": "pending"
    },
    "enums": {
      "status": [
        "pending",
        "approved",
        "denied"
      ]
    },
    "accessPolicy": {
      "create": "admin only",
      "read": "admin only",
      "update": "admin only",
      "delete": "admin only"
    },
    "translatedFrom": "AdminAccessRequest.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "requester_email",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Requester Email"
      },
      {
        "name": "contact_email",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Contact Email"
      },
      {
        "name": "requester_name",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Requester Name"
      },
      {
        "name": "requested_userid",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Requested Userid"
      },
      {
        "name": "reason",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Reason"
      },
      {
        "name": "status",
        "storageType": "TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "pending",
        "options": [
          "pending",
          "approved",
          "denied"
        ],
        "description": "Status"
      },
      {
        "name": "assigned_admin_email",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Assigned Admin Email"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  {
    "name": "Badge",
    "group": "reputation",
    "description": "Configurable badge definitions for participation, productivity, promotion, value, truth, and creator awards.",
    "required": [
      "name",
      "category"
    ],
    "defaults": {
      "category": "participation",
      "threshold": 0
    },
    "enums": {
      "category": [
        "participation",
        "productivity",
        "promotion",
        "value",
        "truth",
        "creator"
      ]
    },
    "accessPolicy": {
      "read": "public",
      "create": "admin only",
      "update": "admin only",
      "delete": "admin only"
    },
    "translatedFrom": "Badge.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "name",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Name"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "icon_uri",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Icon Uri"
      },
      {
        "name": "category",
        "storageType": "TEXT NOT NULL DEFAULT 'participation' CHECK (category IN ('participation', 'productivity', 'promotion', 'value', 'truth', 'creator'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "participation",
        "options": [
          "participation",
          "productivity",
          "promotion",
          "value",
          "truth",
          "creator"
        ],
        "description": "Category"
      },
      {
        "name": "threshold",
        "storageType": "DOUBLE PRECISION NOT NULL DEFAULT 0",
        "valueType": "number",
        "required": true,
        "defaultValue": 0,
        "description": "Threshold"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  {
    "name": "Block",
    "group": "social",
    "description": "Per-user user-block relationships with optional notes and reasons.",
    "required": [
      "blocked_id"
    ],
    "defaults": {},
    "enums": {},
    "accessPolicy": {
      "read": "created_by_id owner only",
      "create": "created_by_id must match the authenticated user id",
      "delete": "created_by_id owner only"
    },
    "translatedFrom": "Block.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "created_by_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Created By Id"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "blocked_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Blocked Id"
      },
      {
        "name": "reason",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Reason"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  {
    "name": "Bookmark",
    "group": "social",
    "description": "Per-user saved post references with optional labels and cached content.",
    "required": [
      "post_id"
    ],
    "defaults": {},
    "enums": {},
    "accessPolicy": {
      "read": "created_by_id owner only",
      "create": "created_by_id must match the authenticated user id",
      "delete": "created_by_id owner only"
    },
    "translatedFrom": "Bookmark.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "created_by_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Created By Id"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "post_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Post Id"
      },
      {
        "name": "post_content",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Post Content"
      },
      {
        "name": "label",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Label"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  {
    "name": "Challenge",
    "group": "trust",
    "description": "Truth challenges raised against posts, including evidence and moderation status.",
    "required": [
      "post_id",
      "reason"
    ],
    "defaults": {
      "status": "open"
    },
    "enums": {
      "status": [
        "open",
        "under_review",
        "upheld",
        "dismissed"
      ]
    },
    "accessPolicy": {
      "read": "public",
      "create": "created_by_id must match the authenticated user id",
      "update": "admin only",
      "delete": "created_by_id owner or admin"
    },
    "translatedFrom": "Challenge.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "created_by_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Created By Id"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "post_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Post Id"
      },
      {
        "name": "reason",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Reason"
      },
      {
        "name": "evidence",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Evidence"
      },
      {
        "name": "status",
        "storageType": "TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'upheld', 'dismissed'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "open",
        "options": [
          "open",
          "under_review",
          "upheld",
          "dismissed"
        ],
        "description": "Status"
      },
      {
        "name": "verdict",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Verdict"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  {
    "name": "Comment",
    "group": "social",
    "description": "Comments on posts with optional threading and local moderation/truth metadata.",
    "required": [
      "post_id",
      "content"
    ],
    "defaults": {
      "truth_score": 50,
      "like_count": 0
    },
    "enums": {},
    "accessPolicy": {
      "read": "public",
      "create": "created_by_id must match the authenticated user id",
      "update": "created_by_id owner or admin",
      "delete": "created_by_id owner or admin"
    },
    "translatedFrom": "Comment.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "created_by_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Created By Id"
      },
      {
        "name": "post_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Post Id"
      },
      {
        "name": "content",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Content"
      },
      {
        "name": "parent_id",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Parent Id"
      },
      {
        "name": "truth_score",
        "storageType": "DOUBLE PRECISION NOT NULL DEFAULT 50",
        "valueType": "number",
        "required": true,
        "defaultValue": 50,
        "description": "Truth Score"
      },
      {
        "name": "like_count",
        "storageType": "DOUBLE PRECISION NOT NULL DEFAULT 0",
        "valueType": "number",
        "required": true,
        "defaultValue": 0,
        "description": "Like Count"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  {
    "name": "Conversation",
    "group": "messaging",
    "description": "Direct and group conversation containers with participant lists and last-message timestamps.",
    "required": [
      "participants",
      "type"
    ],
    "defaults": {
      "type": "dm"
    },
    "enums": {
      "type": [
        "dm",
        "group"
      ]
    },
    "accessPolicy": {
      "read": "participants include authenticated user or admin",
      "create": "participants must include authenticated user",
      "update": "created_by_id owner or admin",
      "delete": "admin only"
    },
    "translatedFrom": "Conversation.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "created_by_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Created By Id"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "participants",
        "storageType": "JSONB NOT NULL DEFAULT '[]'::jsonb",
        "valueType": "json",
        "required": true,
        "description": "Participants"
      },
      {
        "name": "type",
        "storageType": "TEXT NOT NULL DEFAULT 'dm' CHECK (type IN ('dm', 'group'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "dm",
        "options": [
          "dm",
          "group"
        ],
        "description": "Type"
      },
      {
        "name": "title",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Title"
      },
      {
        "name": "last_message_at",
        "storageType": "TIMESTAMPTZ",
        "valueType": "datetime",
        "required": false,
        "description": "Last Message At"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  {
    "name": "CopyrightReport",
    "group": "rights",
    "description": "Copyright, DMCA, dispute, and counter-notice reports against media assets.",
    "required": [
      "media_asset_id",
      "reporter_name",
      "report_type"
    ],
    "defaults": {
      "report_type": "infringement",
      "status": "submitted",
      "action_taken": "none"
    },
    "enums": {
      "report_type": [
        "infringement",
        "dmca_takedown",
        "dispute",
        "counter_notice"
      ],
      "status": [
        "submitted",
        "under_review",
        "action_taken",
        "dismissed",
        "restored"
      ],
      "action_taken": [
        "takedown",
        "warning",
        "restored",
        "dismissed",
        "none"
      ]
    },
    "accessPolicy": {
      "read": "created_by_id owner or admin",
      "create": "created_by_id must match the authenticated user id",
      "update": "admin only",
      "delete": "created_by_id owner or admin"
    },
    "translatedFrom": "CopyrightReport.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "created_by_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Created By Id"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "media_asset_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Media Asset Id"
      },
      {
        "name": "asset_title",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Asset Title"
      },
      {
        "name": "reporter_name",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Reporter Name"
      },
      {
        "name": "reporter_email",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Reporter Email"
      },
      {
        "name": "report_type",
        "storageType": "TEXT NOT NULL DEFAULT 'infringement' CHECK (report_type IN ('infringement', 'dmca_takedown', 'dispute', 'counter_notice'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "infringement",
        "options": [
          "infringement",
          "dmca_takedown",
          "dispute",
          "counter_notice"
        ],
        "description": "Report Type"
      },
      {
        "name": "infringement_summary",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Infringement Summary"
      },
      {
        "name": "original_work_title",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Original Work Title"
      },
      {
        "name": "original_work_url",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Original Work Url"
      },
      {
        "name": "evidence_uri",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Evidence Uri"
      },
      {
        "name": "status",
        "storageType": "TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'under_review', 'action_taken', 'dismissed', 'restored'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "submitted",
        "options": [
          "submitted",
          "under_review",
          "action_taken",
          "dismissed",
          "restored"
        ],
        "description": "Status"
      },
      {
        "name": "action_taken",
        "storageType": "TEXT NOT NULL DEFAULT 'none' CHECK (action_taken IN ('takedown', 'warning', 'restored', 'dismissed', 'none'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "none",
        "options": [
          "takedown",
          "warning",
          "restored",
          "dismissed",
          "none"
        ],
        "description": "Action Taken"
      },
      {
        "name": "resolution_notes",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Resolution Notes"
      },
      {
        "name": "reviewed_by",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Reviewed By"
      },
      {
        "name": "resolved_at",
        "storageType": "TIMESTAMPTZ",
        "valueType": "datetime",
        "required": false,
        "description": "Resolved At"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  {
    "name": "DigitalCertificate",
    "group": "rights",
    "description": "Digital ownership, authenticity, licensing, and original-creation certificates.",
    "required": [
      "media_asset_id",
      "rights_holder_name",
      "certificate_type"
    ],
    "defaults": {
      "certificate_type": "ownership",
      "authenticity_badge": "unverified",
      "verification_status": "pending"
    },
    "enums": {
      "asset_type": [
        "music",
        "video",
        "photo"
      ],
      "certificate_type": [
        "ownership",
        "authenticity",
        "licensing",
        "original_creation"
      ],
      "authenticity_badge": [
        "verified",
        "unverified",
        "flagged"
      ],
      "verification_status": [
        "pending",
        "verified",
        "flagged",
        "rejected"
      ]
    },
    "accessPolicy": {
      "read": "created_by_id owner or admin",
      "create": "created_by_id must match the authenticated user id",
      "update": "created_by_id owner or admin",
      "delete": "created_by_id owner or admin"
    },
    "translatedFrom": "DigitalCertificate.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "created_by_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Created By Id"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "media_asset_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Media Asset Id"
      },
      {
        "name": "asset_title",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Asset Title"
      },
      {
        "name": "asset_type",
        "storageType": "TEXT CHECK (asset_type IN ('music', 'video', 'photo'))",
        "valueType": "string",
        "required": false,
        "options": [
          "music",
          "video",
          "photo"
        ],
        "description": "Asset Type"
      },
      {
        "name": "file_uri",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "File Uri"
      },
      {
        "name": "certificate_id",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Certificate Id"
      },
      {
        "name": "rights_holder_name",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Rights Holder Name"
      },
      {
        "name": "rights_holder_email",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Rights Holder Email"
      },
      {
        "name": "certificate_type",
        "storageType": "TEXT NOT NULL DEFAULT 'ownership' CHECK (certificate_type IN ('ownership', 'authenticity', 'licensing', 'original_creation'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "ownership",
        "options": [
          "ownership",
          "authenticity",
          "licensing",
          "original_creation"
        ],
        "description": "Certificate Type"
      },
      {
        "name": "metadata_timestamp",
        "storageType": "TIMESTAMPTZ",
        "valueType": "datetime",
        "required": false,
        "description": "Metadata Timestamp"
      },
      {
        "name": "authenticity_badge",
        "storageType": "TEXT NOT NULL DEFAULT 'unverified' CHECK (authenticity_badge IN ('verified', 'unverified', 'flagged'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "unverified",
        "options": [
          "verified",
          "unverified",
          "flagged"
        ],
        "description": "Authenticity Badge"
      },
      {
        "name": "verification_status",
        "storageType": "TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'flagged', 'rejected'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "pending",
        "options": [
          "pending",
          "verified",
          "flagged",
          "rejected"
        ],
        "description": "Verification Status"
      },
      {
        "name": "state",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "State"
      },
      {
        "name": "copyright_authority",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Copyright Authority"
      },
      {
        "name": "authority_url",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Authority Url"
      },
      {
        "name": "file_hash",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "File Hash"
      },
      {
        "name": "verification_notes",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Verification Notes"
      },
      {
        "name": "verified_at",
        "storageType": "TIMESTAMPTZ",
        "valueType": "datetime",
        "required": false,
        "description": "Verified At"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  {
    "name": "FeatureRelease",
    "group": "admin",
    "description": "Feature release notes and rollout metadata.",
    "required": [
      "title",
      "status"
    ],
    "defaults": {
      "category": "feature",
      "status": "planned",
      "target_audience": "all",
      "rollout_percentage": 100,
      "is_public": false
    },
    "enums": {
      "category": [
        "feature",
        "improvement",
        "bugfix",
        "security",
        "infrastructure"
      ],
      "status": [
        "planned",
        "in_development",
        "testing",
        "released",
        "rolled_back"
      ],
      "target_audience": [
        "all",
        "creators",
        "admins",
        "beta"
      ]
    },
    "accessPolicy": {
      "read": "public when is_public = true, otherwise admin",
      "create": "admin only",
      "update": "admin only",
      "delete": "admin only"
    },
    "translatedFrom": "FeatureRelease.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "title",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Title"
      },
      {
        "name": "version",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Version"
      },
      {
        "name": "category",
        "storageType": "TEXT NOT NULL DEFAULT 'feature' CHECK (category IN ('feature', 'improvement', 'bugfix', 'security', 'infrastructure'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "feature",
        "options": [
          "feature",
          "improvement",
          "bugfix",
          "security",
          "infrastructure"
        ],
        "description": "Category"
      },
      {
        "name": "status",
        "storageType": "TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_development', 'testing', 'released', 'rolled_back'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "planned",
        "options": [
          "planned",
          "in_development",
          "testing",
          "released",
          "rolled_back"
        ],
        "description": "Status"
      },
      {
        "name": "changelog",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Changelog"
      },
      {
        "name": "release_date",
        "storageType": "DATE",
        "valueType": "date",
        "required": false,
        "description": "Release Date"
      },
      {
        "name": "target_audience",
        "storageType": "TEXT NOT NULL DEFAULT 'all' CHECK (target_audience IN ('all', 'creators', 'admins', 'beta'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "all",
        "options": [
          "all",
          "creators",
          "admins",
          "beta"
        ],
        "description": "Target Audience"
      },
      {
        "name": "rollout_percentage",
        "storageType": "DOUBLE PRECISION NOT NULL DEFAULT 100",
        "valueType": "number",
        "required": true,
        "defaultValue": 100,
        "description": "Rollout Percentage"
      },
      {
        "name": "is_public",
        "storageType": "BOOLEAN NOT NULL DEFAULT FALSE",
        "valueType": "boolean",
        "required": true,
        "defaultValue": false,
        "description": "Is Public"
      },
      {
        "name": "tags",
        "storageType": "JSONB NOT NULL DEFAULT '[]'::jsonb",
        "valueType": "json",
        "required": true,
        "description": "Tags"
      },
      {
        "name": "owner_id",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Owner Id"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  {
    "name": "Follow",
    "group": "social",
    "description": "User follow relationships with optional muted state.",
    "required": [
      "followee_id"
    ],
    "defaults": {
      "status": "active"
    },
    "enums": {
      "status": [
        "active",
        "muted"
      ]
    },
    "accessPolicy": {
      "create": "created_by_id must match the authenticated user id",
      "read": "created_by_id owner only",
      "update": "created_by_id owner only",
      "delete": "created_by_id owner only"
    },
    "translatedFrom": "Follow.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "created_by_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Created By Id"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "followee_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Followee Id"
      },
      {
        "name": "status",
        "storageType": "TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'muted'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "active",
        "options": [
          "active",
          "muted"
        ],
        "description": "Status"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  {
    "name": "Invitation",
    "group": "growth",
    "description": "Invite and referral tracking with reward status.",
    "required": [
      "invitee_email"
    ],
    "defaults": {
      "reward_amount": 25,
      "status": "pending",
      "reward_issued": false
    },
    "enums": {
      "status": [
        "pending",
        "accepted"
      ]
    },
    "accessPolicy": {
      "read": "created_by_id owner only",
      "create": "created_by_id must match the authenticated user id",
      "update": "admin only",
      "delete": "created_by_id owner only"
    },
    "translatedFrom": "Invitation.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "created_by_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Created By Id"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "invitee_email",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Invitee Email"
      },
      {
        "name": "reward_amount",
        "storageType": "DOUBLE PRECISION NOT NULL DEFAULT 25",
        "valueType": "number",
        "required": true,
        "defaultValue": 25,
        "description": "Reward Amount"
      },
      {
        "name": "status",
        "storageType": "TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "pending",
        "options": [
          "pending",
          "accepted"
        ],
        "description": "Status"
      },
      {
        "name": "reward_issued",
        "storageType": "BOOLEAN NOT NULL DEFAULT FALSE",
        "valueType": "boolean",
        "required": true,
        "defaultValue": false,
        "description": "Reward Issued"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  {
    "name": "JamSession",
    "group": "collaboration",
    "description": "Collaborative jam sessions with participant, schedule, and track metadata.",
    "required": [
      "title",
      "participants"
    ],
    "defaults": {
      "status": "active",
      "bpm": 120
    },
    "enums": {
      "status": [
        "scheduled",
        "active",
        "ended"
      ]
    },
    "accessPolicy": {
      "read": "public",
      "create": "participants must include authenticated user",
      "update": "application-managed",
      "delete": "created_by_id owner or admin"
    },
    "translatedFrom": "JamSession.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "created_by_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Created By Id"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "title",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Title"
      },
      {
        "name": "participants",
        "storageType": "JSONB NOT NULL DEFAULT '[]'::jsonb",
        "valueType": "json",
        "required": true,
        "description": "Participants"
      },
      {
        "name": "signup_ids",
        "storageType": "JSONB NOT NULL DEFAULT '[]'::jsonb",
        "valueType": "json",
        "required": true,
        "description": "Signup Ids"
      },
      {
        "name": "status",
        "storageType": "TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('scheduled', 'active', 'ended'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "active",
        "options": [
          "scheduled",
          "active",
          "ended"
        ],
        "description": "Status"
      },
      {
        "name": "track_uris",
        "storageType": "JSONB NOT NULL DEFAULT '[]'::jsonb",
        "valueType": "json",
        "required": true,
        "description": "Track Uris"
      },
      {
        "name": "scheduled_date",
        "storageType": "TIMESTAMPTZ",
        "valueType": "datetime",
        "required": false,
        "description": "Scheduled Date"
      },
      {
        "name": "started_at",
        "storageType": "TIMESTAMPTZ",
        "valueType": "datetime",
        "required": false,
        "description": "Started At"
      },
      {
        "name": "ended_at",
        "storageType": "TIMESTAMPTZ",
        "valueType": "datetime",
        "required": false,
        "description": "Ended At"
      },
      {
        "name": "bpm",
        "storageType": "DOUBLE PRECISION NOT NULL DEFAULT 120",
        "valueType": "number",
        "required": true,
        "defaultValue": 120,
        "description": "Bpm"
      },
      {
        "name": "max_participants",
        "storageType": "DOUBLE PRECISION",
        "valueType": "number",
        "required": false,
        "description": "Max Participants"
      },
      {
        "name": "reminder_sent_at",
        "storageType": "TIMESTAMPTZ",
        "valueType": "datetime",
        "required": false,
        "description": "Reminder Sent At"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  {
    "name": "JournalismReport",
    "group": "trust",
    "description": "Journalism verification records attached to posts.",
    "required": [
      "post_id",
      "verification_status"
    ],
    "defaults": {
      "verification_status": "verified"
    },
    "enums": {
      "verification_status": [
        "under_review",
        "verified",
        "rejected"
      ]
    },
    "accessPolicy": {
      "read": "public",
      "create": "created_by_id must match the authenticated user id",
      "update": "admin only",
      "delete": "admin only"
    },
    "translatedFrom": "JournalismReport.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "created_by_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Created By Id"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "post_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Post Id"
      },
      {
        "name": "headline",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Headline"
      },
      {
        "name": "region",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Region"
      },
      {
        "name": "truth_score",
        "storageType": "DOUBLE PRECISION",
        "valueType": "number",
        "required": false,
        "description": "Truth Score"
      },
      {
        "name": "verification_status",
        "storageType": "TEXT NOT NULL DEFAULT 'verified' CHECK (verification_status IN ('under_review', 'verified', 'rejected'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "verified",
        "options": [
          "under_review",
          "verified",
          "rejected"
        ],
        "description": "Verification Status"
      },
      {
        "name": "reviewer_id",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Reviewer Id"
      },
      {
        "name": "reviewer_name",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Reviewer Name"
      },
      {
        "name": "review_notes",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Review Notes"
      },
      {
        "name": "reviewed_at",
        "storageType": "TIMESTAMPTZ",
        "valueType": "datetime",
        "required": false,
        "description": "Reviewed At"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  {
    "name": "KaraokePayment",
    "group": "payments",
    "description": "Karaoke subscription payment tracking.",
    "required": [
      "user_id",
      "payment_type",
      "amount"
    ],
    "defaults": {
      "payment_type": "subscription",
      "status": "pending"
    },
    "enums": {
      "payment_type": [
        "subscription"
      ],
      "status": [
        "pending",
        "active",
        "cancelled"
      ]
    },
    "accessPolicy": {
      "read": "user_id owner or admin",
      "create": "user_id must match the authenticated user id",
      "update": "admin only",
      "delete": "admin only"
    },
    "translatedFrom": "KaraokePayment.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "user_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "User Id"
      },
      {
        "name": "payment_type",
        "storageType": "TEXT NOT NULL DEFAULT 'subscription' CHECK (payment_type IN ('subscription'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "subscription",
        "options": [
          "subscription"
        ],
        "description": "Payment Type"
      },
      {
        "name": "amount",
        "storageType": "DOUBLE PRECISION NOT NULL",
        "valueType": "number",
        "required": true,
        "description": "Amount"
      },
      {
        "name": "status",
        "storageType": "TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'cancelled'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "pending",
        "options": [
          "pending",
          "active",
          "cancelled"
        ],
        "description": "Status"
      },
      {
        "name": "stripe_session_id",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Stripe Session Id"
      },
      {
        "name": "stripe_subscription_id",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Stripe Subscription Id"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  {
    "name": "Like",
    "group": "social",
    "description": "Likes on posts or comments.",
    "required": [
      "target_id",
      "target_type"
    ],
    "defaults": {},
    "enums": {
      "target_type": [
        "post",
        "comment"
      ]
    },
    "accessPolicy": {
      "create": "created_by_id must match the authenticated user id",
      "read": "public",
      "update": "created_by_id owner only",
      "delete": "created_by_id owner only"
    },
    "translatedFrom": "Like.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "created_by_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Created By Id"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "target_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Target Id"
      },
      {
        "name": "target_type",
        "storageType": "TEXT NOT NULL CHECK (target_type IN ('post', 'comment'))",
        "valueType": "string",
        "required": true,
        "options": [
          "post",
          "comment"
        ],
        "description": "Target Type"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  {
    "name": "LiveStream",
    "group": "media",
    "description": "Live stream records with streamer and chunk state metadata.",
    "required": [
      "title",
      "streamer_id"
    ],
    "defaults": {
      "status": "live",
      "chunk_sequence": 0,
      "is_audio_only": false
    },
    "enums": {
      "status": [
        "live",
        "ended"
      ]
    },
    "accessPolicy": {
      "read": "public",
      "create": "created_by_id must match the authenticated user id",
      "update": "created_by_id owner or admin",
      "delete": "created_by_id owner or admin"
    },
    "translatedFrom": "LiveStream.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "created_by_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Created By Id"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "title",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Title"
      },
      {
        "name": "streamer_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Streamer Id"
      },
      {
        "name": "status",
        "storageType": "TEXT NOT NULL DEFAULT 'live' CHECK (status IN ('live', 'ended'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "live",
        "options": [
          "live",
          "ended"
        ],
        "description": "Status"
      },
      {
        "name": "current_chunk_uri",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Current Chunk Uri"
      },
      {
        "name": "chunk_sequence",
        "storageType": "DOUBLE PRECISION NOT NULL DEFAULT 0",
        "valueType": "number",
        "required": true,
        "defaultValue": 0,
        "description": "Chunk Sequence"
      },
      {
        "name": "is_audio_only",
        "storageType": "BOOLEAN NOT NULL DEFAULT FALSE",
        "valueType": "boolean",
        "required": true,
        "defaultValue": false,
        "description": "Is Audio Only"
      },
      {
        "name": "started_at",
        "storageType": "TIMESTAMPTZ",
        "valueType": "datetime",
        "required": false,
        "description": "Started At"
      },
      {
        "name": "ended_at",
        "storageType": "TIMESTAMPTZ",
        "valueType": "datetime",
        "required": false,
        "description": "Ended At"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  {
    "name": "MediaAsset",
    "group": "media",
    "description": "Uploaded media assets, including privacy, tags, and proprietary flags.",
    "required": [
      "asset_type",
      "file_uri"
    ],
    "defaults": {
      "is_proprietary": false,
      "is_public": false
    },
    "enums": {
      "asset_type": [
        "photo",
        "music",
        "video"
      ]
    },
    "accessPolicy": {
      "read": "created_by_id owner, public when is_public = true, or admin",
      "create": "created_by_id must match the authenticated user id",
      "update": "created_by_id owner or admin",
      "delete": "created_by_id owner or admin"
    },
    "translatedFrom": "MediaAsset.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "created_by_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Created By Id"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "asset_type",
        "storageType": "TEXT NOT NULL CHECK (asset_type IN ('photo', 'music', 'video'))",
        "valueType": "string",
        "required": true,
        "options": [
          "photo",
          "music",
          "video"
        ],
        "description": "Asset Type"
      },
      {
        "name": "file_uri",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "File Uri"
      },
      {
        "name": "title",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Title"
      },
      {
        "name": "duration",
        "storageType": "DOUBLE PRECISION",
        "valueType": "number",
        "required": false,
        "description": "Duration"
      },
      {
        "name": "is_proprietary",
        "storageType": "BOOLEAN NOT NULL DEFAULT FALSE",
        "valueType": "boolean",
        "required": true,
        "defaultValue": false,
        "description": "Is Proprietary"
      },
      {
        "name": "tags",
        "storageType": "JSONB NOT NULL DEFAULT '[]'::jsonb",
        "valueType": "json",
        "required": true,
        "description": "Tags"
      },
      {
        "name": "is_public",
        "storageType": "BOOLEAN NOT NULL DEFAULT FALSE",
        "valueType": "boolean",
        "required": true,
        "defaultValue": false,
        "description": "Is Public"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  {
    "name": "MediaRight",
    "group": "rights",
    "description": "Rights ownership and licensing records for media assets.",
    "required": [
      "media_asset_id",
      "rights_holder_name",
      "rights_type"
    ],
    "defaults": {
      "rights_type": "original_work",
      "license_type": "exclusive",
      "territory": "global",
      "status": "active"
    },
    "enums": {
      "asset_type": [
        "music",
        "video",
        "photo"
      ],
      "rights_type": [
        "original_work",
        "licensed",
        "assignment",
        "public_domain",
        "fair_use"
      ],
      "license_type": [
        "exclusive",
        "non_exclusive",
        "creative_commons",
        "royalty_free",
        "custom"
      ],
      "status": [
        "active",
        "expired",
        "disputed",
        "revoked"
      ]
    },
    "accessPolicy": {
      "read": "created_by_id owner or admin",
      "create": "created_by_id must match the authenticated user id",
      "update": "created_by_id owner or admin",
      "delete": "created_by_id owner or admin"
    },
    "translatedFrom": "MediaRight.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "created_by_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Created By Id"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "media_asset_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Media Asset Id"
      },
      {
        "name": "asset_title",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Asset Title"
      },
      {
        "name": "asset_type",
        "storageType": "TEXT CHECK (asset_type IN ('music', 'video', 'photo'))",
        "valueType": "string",
        "required": false,
        "options": [
          "music",
          "video",
          "photo"
        ],
        "description": "Asset Type"
      },
      {
        "name": "rights_holder_name",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Rights Holder Name"
      },
      {
        "name": "rights_holder_email",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Rights Holder Email"
      },
      {
        "name": "rights_type",
        "storageType": "TEXT NOT NULL DEFAULT 'original_work' CHECK (rights_type IN ('original_work', 'licensed', 'assignment', 'public_domain', 'fair_use'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "original_work",
        "options": [
          "original_work",
          "licensed",
          "assignment",
          "public_domain",
          "fair_use"
        ],
        "description": "Rights Type"
      },
      {
        "name": "license_type",
        "storageType": "TEXT NOT NULL DEFAULT 'exclusive' CHECK (license_type IN ('exclusive', 'non_exclusive', 'creative_commons', 'royalty_free', 'custom'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "exclusive",
        "options": [
          "exclusive",
          "non_exclusive",
          "creative_commons",
          "royalty_free",
          "custom"
        ],
        "description": "License Type"
      },
      {
        "name": "registration_number",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Registration Number"
      },
      {
        "name": "registration_date",
        "storageType": "DATE",
        "valueType": "date",
        "required": false,
        "description": "Registration Date"
      },
      {
        "name": "territory",
        "storageType": "TEXT NOT NULL DEFAULT 'global'",
        "valueType": "string",
        "required": true,
        "defaultValue": "global",
        "description": "Territory"
      },
      {
        "name": "usage_rights",
        "storageType": "JSONB NOT NULL DEFAULT '[]'::jsonb",
        "valueType": "json",
        "required": true,
        "description": "Usage Rights"
      },
      {
        "name": "expiry_date",
        "storageType": "DATE",
        "valueType": "date",
        "required": false,
        "description": "Expiry Date"
      },
      {
        "name": "status",
        "storageType": "TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'disputed', 'revoked'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "active",
        "options": [
          "active",
          "expired",
          "disputed",
          "revoked"
        ],
        "description": "Status"
      },
      {
        "name": "evidence_uri",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Evidence Uri"
      },
      {
        "name": "notes",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Notes"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  {
    "name": "Message",
    "group": "messaging",
    "description": "Conversation messages with participants, optional media, replies, and read-tracking.",
    "required": [
      "conversation_id",
      "participants"
    ],
    "defaults": {},
    "enums": {},
    "accessPolicy": {
      "read": "participants include authenticated user or admin",
      "create": "participants must include authenticated user",
      "update": "created_by_id owner only",
      "delete": "created_by_id owner only"
    },
    "translatedFrom": "Message.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "created_by_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Created By Id"
      },
      {
        "name": "conversation_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Conversation Id"
      },
      {
        "name": "participants",
        "storageType": "JSONB NOT NULL DEFAULT '[]'::jsonb",
        "valueType": "json",
        "required": true,
        "description": "Participants"
      },
      {
        "name": "content",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Content"
      },
      {
        "name": "media_uri",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Media Uri"
      },
      {
        "name": "parent_message_id",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Parent Message Id"
      },
      {
        "name": "read_by",
        "storageType": "JSONB NOT NULL DEFAULT '[]'::jsonb",
        "valueType": "json",
        "required": true,
        "description": "Read By"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  {
    "name": "MusicAnalysis",
    "group": "media",
    "description": "Analysis and fingerprint records for music assets.",
    "required": [
      "track_title",
      "bpm",
      "fingerprint"
    ],
    "defaults": {
      "bars_analyzed": 10,
      "confidence": 0,
      "stamp_status": "certified"
    },
    "enums": {
      "stamp_status": [
        "certified",
        "original",
        "flagged"
      ]
    },
    "accessPolicy": {
      "read": "public",
      "create": "created_by_id must match the authenticated user id",
      "update": "created_by_id owner only",
      "delete": "created_by_id owner only"
    },
    "translatedFrom": "MusicAnalysis.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "created_by_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Created By Id"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "media_asset_id",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Media Asset Id"
      },
      {
        "name": "track_title",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Track Title"
      },
      {
        "name": "bpm",
        "storageType": "DOUBLE PRECISION NOT NULL",
        "valueType": "number",
        "required": true,
        "description": "Bpm"
      },
      {
        "name": "key",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Key"
      },
      {
        "name": "energy",
        "storageType": "DOUBLE PRECISION",
        "valueType": "number",
        "required": false,
        "description": "Energy"
      },
      {
        "name": "dynamics",
        "storageType": "DOUBLE PRECISION",
        "valueType": "number",
        "required": false,
        "description": "Dynamics"
      },
      {
        "name": "spectral_centroid",
        "storageType": "DOUBLE PRECISION",
        "valueType": "number",
        "required": false,
        "description": "Spectral Centroid"
      },
      {
        "name": "bass_energy",
        "storageType": "DOUBLE PRECISION",
        "valueType": "number",
        "required": false,
        "description": "Bass Energy"
      },
      {
        "name": "mid_energy",
        "storageType": "DOUBLE PRECISION",
        "valueType": "number",
        "required": false,
        "description": "Mid Energy"
      },
      {
        "name": "treble_energy",
        "storageType": "DOUBLE PRECISION",
        "valueType": "number",
        "required": false,
        "description": "Treble Energy"
      },
      {
        "name": "fingerprint",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Fingerprint"
      },
      {
        "name": "bars_analyzed",
        "storageType": "DOUBLE PRECISION NOT NULL DEFAULT 10",
        "valueType": "number",
        "required": true,
        "defaultValue": 10,
        "description": "Bars Analyzed"
      },
      {
        "name": "confidence",
        "storageType": "DOUBLE PRECISION NOT NULL DEFAULT 0",
        "valueType": "number",
        "required": true,
        "defaultValue": 0,
        "description": "Confidence"
      },
      {
        "name": "stamp_status",
        "storageType": "TEXT NOT NULL DEFAULT 'certified' CHECK (stamp_status IN ('certified', 'original', 'flagged'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "certified",
        "options": [
          "certified",
          "original",
          "flagged"
        ],
        "description": "Stamp Status"
      },
      {
        "name": "stamp_id",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Stamp Id"
      },
      {
        "name": "assessment",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Assessment"
      },
      {
        "name": "character_tags",
        "storageType": "JSONB NOT NULL DEFAULT '[]'::jsonb",
        "valueType": "json",
        "required": true,
        "description": "Character Tags"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  {
    "name": "Notification",
    "group": "messaging",
    "description": "User notifications for DMs, likes, comments, follows, system events, badges, and truth changes.",
    "required": [
      "recipient_id",
      "type",
      "message"
    ],
    "defaults": {
      "type": "system",
      "read": false
    },
    "enums": {
      "type": [
        "dm",
        "like",
        "comment",
        "follow",
        "system",
        "badge",
        "truth_score"
      ]
    },
    "accessPolicy": {
      "create": "admin only",
      "read": "recipient_id owner only",
      "update": "recipient_id owner only",
      "delete": "recipient_id owner only"
    },
    "translatedFrom": "Notification.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "recipient_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Recipient Id"
      },
      {
        "name": "type",
        "storageType": "TEXT NOT NULL DEFAULT 'system' CHECK (type IN ('dm', 'like', 'comment', 'follow', 'system', 'badge', 'truth_score'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "system",
        "options": [
          "dm",
          "like",
          "comment",
          "follow",
          "system",
          "badge",
          "truth_score"
        ],
        "description": "Type"
      },
      {
        "name": "message",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Message"
      },
      {
        "name": "link",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Link"
      },
      {
        "name": "read",
        "storageType": "BOOLEAN NOT NULL DEFAULT FALSE",
        "valueType": "boolean",
        "required": true,
        "defaultValue": false,
        "description": "Read"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  {
    "name": "PlannerEvent",
    "group": "productivity",
    "description": "Personal planner events for sessions, meetings, deadlines, and streams.",
    "required": [
      "title",
      "event_date"
    ],
    "defaults": {
      "event_type": "session",
      "status": "scheduled"
    },
    "enums": {
      "event_type": [
        "session",
        "meeting",
        "deadline",
        "personal",
        "stream"
      ],
      "status": [
        "scheduled",
        "completed",
        "cancelled"
      ]
    },
    "accessPolicy": {
      "read": "created_by_id owner only",
      "create": "created_by_id must match the authenticated user id",
      "update": "created_by_id owner only",
      "delete": "created_by_id owner only"
    },
    "translatedFrom": "PlannerEvent.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "created_by_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Created By Id"
      },
      {
        "name": "title",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Title"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "event_date",
        "storageType": "DATE NOT NULL",
        "valueType": "date",
        "required": true,
        "description": "Event Date"
      },
      {
        "name": "event_time",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Event Time"
      },
      {
        "name": "event_type",
        "storageType": "TEXT NOT NULL DEFAULT 'session' CHECK (event_type IN ('session', 'meeting', 'deadline', 'personal', 'stream'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "session",
        "options": [
          "session",
          "meeting",
          "deadline",
          "personal",
          "stream"
        ],
        "description": "Event Type"
      },
      {
        "name": "location",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Location"
      },
      {
        "name": "status",
        "storageType": "TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "scheduled",
        "options": [
          "scheduled",
          "completed",
          "cancelled"
        ],
        "description": "Status"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  {
    "name": "Podcast",
    "group": "podcast",
    "description": "Podcast episodes with script, lineup, media, monetization, team, and production timeline metadata.",
    "required": [
      "title",
      "episode_number",
      "subject_matter"
    ],
    "defaults": {
      "script_status": "draft",
      "lineup_status": "pending",
      "status": "planning",
      "board_stage": "backlog",
      "is_premium": false,
      "view_count": 0
    },
    "enums": {
      "script_status": [
        "draft",
        "submitted",
        "approved"
      ],
      "lineup_status": [
        "pending",
        "approved",
        "rejected"
      ],
      "status": [
        "planning",
        "recording",
        "published",
        "archived"
      ],
      "board_stage": [
        "backlog",
        "recording",
        "editing",
        "review",
        "published"
      ]
    },
    "accessPolicy": {
      "read": "public when status = published, otherwise creator or admin",
      "create": "created_by_id must match the authenticated user id",
      "update": "created_by_id owner or admin",
      "delete": "created_by_id owner or admin"
    },
    "translatedFrom": "Podcast.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "created_by_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Created By Id"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "title",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Title"
      },
      {
        "name": "episode_number",
        "storageType": "DOUBLE PRECISION NOT NULL",
        "valueType": "number",
        "required": true,
        "description": "Episode Number"
      },
      {
        "name": "subject_matter",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Subject Matter"
      },
      {
        "name": "script",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Script"
      },
      {
        "name": "script_status",
        "storageType": "TEXT NOT NULL DEFAULT 'draft' CHECK (script_status IN ('draft', 'submitted', 'approved'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "draft",
        "options": [
          "draft",
          "submitted",
          "approved"
        ],
        "description": "Script Status"
      },
      {
        "name": "itinerary",
        "storageType": "JSONB NOT NULL DEFAULT '[]'::jsonb",
        "valueType": "json",
        "required": true,
        "description": "Itinerary"
      },
      {
        "name": "lineup_status",
        "storageType": "TEXT NOT NULL DEFAULT 'pending' CHECK (lineup_status IN ('pending', 'approved', 'rejected'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "pending",
        "options": [
          "pending",
          "approved",
          "rejected"
        ],
        "description": "Lineup Status"
      },
      {
        "name": "status",
        "storageType": "TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'recording', 'published', 'archived'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "planning",
        "options": [
          "planning",
          "recording",
          "published",
          "archived"
        ],
        "description": "Status"
      },
      {
        "name": "board_stage",
        "storageType": "TEXT NOT NULL DEFAULT 'backlog' CHECK (board_stage IN ('backlog', 'recording', 'editing', 'review', 'published'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "backlog",
        "options": [
          "backlog",
          "recording",
          "editing",
          "review",
          "published"
        ],
        "description": "Board Stage"
      },
      {
        "name": "is_premium",
        "storageType": "BOOLEAN NOT NULL DEFAULT FALSE",
        "valueType": "boolean",
        "required": true,
        "defaultValue": false,
        "description": "Is Premium"
      },
      {
        "name": "episode_media_uri",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Episode Media Uri"
      },
      {
        "name": "raw_media_uri",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Raw Media Uri"
      },
      {
        "name": "intro_uri",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Intro Uri"
      },
      {
        "name": "outro_uri",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Outro Uri"
      },
      {
        "name": "teaser_text",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Teaser Text"
      },
      {
        "name": "teaser_video_uri",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Teaser Video Uri"
      },
      {
        "name": "price_monthly",
        "storageType": "DOUBLE PRECISION",
        "valueType": "number",
        "required": false,
        "description": "Price Monthly"
      },
      {
        "name": "price_one_time",
        "storageType": "DOUBLE PRECISION",
        "valueType": "number",
        "required": false,
        "description": "Price One Time"
      },
      {
        "name": "ai_pricing",
        "storageType": "JSONB NOT NULL DEFAULT '{}'::jsonb",
        "valueType": "json",
        "required": true,
        "description": "Ai Pricing"
      },
      {
        "name": "team_ids",
        "storageType": "JSONB NOT NULL DEFAULT '[]'::jsonb",
        "valueType": "json",
        "required": true,
        "description": "Team Ids"
      },
      {
        "name": "production_timeline",
        "storageType": "JSONB NOT NULL DEFAULT '[]'::jsonb",
        "valueType": "json",
        "required": true,
        "description": "Production Timeline"
      },
      {
        "name": "view_count",
        "storageType": "DOUBLE PRECISION NOT NULL DEFAULT 0",
        "valueType": "number",
        "required": true,
        "defaultValue": 0,
        "description": "View Count"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  {
    "name": "PodcastPayment",
    "group": "payments",
    "description": "Podcast-specific subscription and one-time payment records.",
    "required": [
      "podcast_id",
      "user_id",
      "payment_type",
      "amount"
    ],
    "defaults": {
      "status": "pending"
    },
    "enums": {
      "payment_type": [
        "subscription",
        "one_time"
      ],
      "status": [
        "pending",
        "completed",
        "active",
        "cancelled"
      ]
    },
    "accessPolicy": {
      "read": "user_id owner or admin",
      "create": "user_id must match the authenticated user id",
      "update": "admin only",
      "delete": "admin only"
    },
    "translatedFrom": "PodcastPayment.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "podcast_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Podcast Id"
      },
      {
        "name": "user_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "User Id"
      },
      {
        "name": "payment_type",
        "storageType": "TEXT NOT NULL CHECK (payment_type IN ('subscription', 'one_time'))",
        "valueType": "string",
        "required": true,
        "options": [
          "subscription",
          "one_time"
        ],
        "description": "Payment Type"
      },
      {
        "name": "amount",
        "storageType": "DOUBLE PRECISION NOT NULL",
        "valueType": "number",
        "required": true,
        "description": "Amount"
      },
      {
        "name": "status",
        "storageType": "TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'active', 'cancelled'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "pending",
        "options": [
          "pending",
          "completed",
          "active",
          "cancelled"
        ],
        "description": "Status"
      },
      {
        "name": "stripe_session_id",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Stripe Session Id"
      },
      {
        "name": "stripe_subscription_id",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Stripe Subscription Id"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  {
    "name": "Post",
    "group": "social",
    "description": "Core social posts with media, truth metadata, counters, and publication status.",
    "required": [
      "content",
      "post_type"
    ],
    "defaults": {
      "post_type": "text",
      "truth_score": 50,
      "truth_status": "unverified",
      "status": "published",
      "like_count": 0,
      "comment_count": 0,
      "share_count": 0,
      "repost_count": 0,
      "challenge_count": 0
    },
    "enums": {
      "post_type": [
        "text",
        "photo",
        "video",
        "music",
        "journalism",
        "karaoke"
      ],
      "truth_status": [
        "unverified",
        "verified",
        "flagged",
        "challenged"
      ],
      "status": [
        "published",
        "draft",
        "archived"
      ]
    },
    "accessPolicy": {
      "read": "public when status = published, otherwise creator or admin",
      "create": "created_by_id must match the authenticated user id",
      "update": "created_by_id owner or admin",
      "delete": "created_by_id owner or admin"
    },
    "translatedFrom": "Post.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "created_by_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Created By Id"
      },
      {
        "name": "content",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Content"
      },
      {
        "name": "media_uris",
        "storageType": "JSONB NOT NULL DEFAULT '[]'::jsonb",
        "valueType": "json",
        "required": true,
        "description": "Media Uris"
      },
      {
        "name": "hashtags",
        "storageType": "JSONB NOT NULL DEFAULT '[]'::jsonb",
        "valueType": "json",
        "required": true,
        "description": "Hashtags"
      },
      {
        "name": "partials",
        "storageType": "JSONB NOT NULL DEFAULT '[]'::jsonb",
        "valueType": "json",
        "required": true,
        "description": "Partials"
      },
      {
        "name": "post_type",
        "storageType": "TEXT NOT NULL DEFAULT 'text' CHECK (post_type IN ('text', 'photo', 'video', 'music', 'journalism', 'karaoke'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "text",
        "options": [
          "text",
          "photo",
          "video",
          "music",
          "journalism",
          "karaoke"
        ],
        "description": "Post Type"
      },
      {
        "name": "region",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Region"
      },
      {
        "name": "truth_score",
        "storageType": "DOUBLE PRECISION NOT NULL DEFAULT 50",
        "valueType": "number",
        "required": true,
        "defaultValue": 50,
        "description": "Truth Score"
      },
      {
        "name": "truth_status",
        "storageType": "TEXT NOT NULL DEFAULT 'unverified' CHECK (truth_status IN ('unverified', 'verified', 'flagged', 'challenged'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "unverified",
        "options": [
          "unverified",
          "verified",
          "flagged",
          "challenged"
        ],
        "description": "Truth Status"
      },
      {
        "name": "status",
        "storageType": "TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'draft', 'archived'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "published",
        "options": [
          "published",
          "draft",
          "archived"
        ],
        "description": "Status"
      },
      {
        "name": "like_count",
        "storageType": "DOUBLE PRECISION NOT NULL DEFAULT 0",
        "valueType": "number",
        "required": true,
        "defaultValue": 0,
        "description": "Like Count"
      },
      {
        "name": "comment_count",
        "storageType": "DOUBLE PRECISION NOT NULL DEFAULT 0",
        "valueType": "number",
        "required": true,
        "defaultValue": 0,
        "description": "Comment Count"
      },
      {
        "name": "share_count",
        "storageType": "DOUBLE PRECISION NOT NULL DEFAULT 0",
        "valueType": "number",
        "required": true,
        "defaultValue": 0,
        "description": "Share Count"
      },
      {
        "name": "repost_count",
        "storageType": "DOUBLE PRECISION NOT NULL DEFAULT 0",
        "valueType": "number",
        "required": true,
        "defaultValue": 0,
        "description": "Repost Count"
      },
      {
        "name": "challenge_count",
        "storageType": "DOUBLE PRECISION NOT NULL DEFAULT 0",
        "valueType": "number",
        "required": true,
        "defaultValue": 0,
        "description": "Challenge Count"
      },
      {
        "name": "external_source",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "External Source"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  {
    "name": "Scratchboard",
    "group": "productivity",
    "description": "Private user notes with tags and a board color.",
    "required": [
      "title"
    ],
    "defaults": {
      "color": "amethyst"
    },
    "enums": {
      "color": [
        "amethyst",
        "gold",
        "violet",
        "blue",
        "rose"
      ]
    },
    "accessPolicy": {
      "read": "created_by_id owner only",
      "create": "created_by_id must match the authenticated user id",
      "update": "created_by_id owner only",
      "delete": "created_by_id owner only"
    },
    "translatedFrom": "Scratchboard.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "created_by_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Created By Id"
      },
      {
        "name": "title",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Title"
      },
      {
        "name": "content",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Content"
      },
      {
        "name": "tags",
        "storageType": "JSONB NOT NULL DEFAULT '[]'::jsonb",
        "valueType": "json",
        "required": true,
        "description": "Tags"
      },
      {
        "name": "color",
        "storageType": "TEXT NOT NULL DEFAULT 'amethyst' CHECK (color IN ('amethyst', 'gold', 'violet', 'blue', 'rose'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "amethyst",
        "options": [
          "amethyst",
          "gold",
          "violet",
          "blue",
          "rose"
        ],
        "description": "Color"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  {
    "name": "SubscriptionPayment",
    "group": "payments",
    "description": "General subscription payment records for WiseRavenShare product groups.",
    "required": [
      "user_id",
      "product_group",
      "price_id",
      "amount"
    ],
    "defaults": {
      "payment_type": "subscription",
      "status": "pending"
    },
    "enums": {
      "product_group": [
        "music_rights",
        "studio_plus",
        "growth_suite",
        "creator_pro"
      ],
      "payment_type": [
        "subscription"
      ],
      "interval": [
        "month",
        "year"
      ],
      "status": [
        "pending",
        "active",
        "cancelled"
      ]
    },
    "accessPolicy": {
      "read": "user_id owner or admin",
      "create": "user_id must match the authenticated user id",
      "update": "admin only",
      "delete": "admin only"
    },
    "translatedFrom": "SubscriptionPayment.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "user_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "User Id"
      },
      {
        "name": "product_group",
        "storageType": "TEXT NOT NULL CHECK (product_group IN ('music_rights', 'studio_plus', 'growth_suite', 'creator_pro'))",
        "valueType": "string",
        "required": true,
        "options": [
          "music_rights",
          "studio_plus",
          "growth_suite",
          "creator_pro"
        ],
        "description": "Product Group"
      },
      {
        "name": "tier",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Tier"
      },
      {
        "name": "price_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Price Id"
      },
      {
        "name": "payment_type",
        "storageType": "TEXT NOT NULL DEFAULT 'subscription' CHECK (payment_type IN ('subscription'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "subscription",
        "options": [
          "subscription"
        ],
        "description": "Payment Type"
      },
      {
        "name": "amount",
        "storageType": "DOUBLE PRECISION NOT NULL",
        "valueType": "number",
        "required": true,
        "description": "Amount"
      },
      {
        "name": "interval",
        "storageType": "TEXT CHECK (interval IN ('month', 'year'))",
        "valueType": "string",
        "required": false,
        "options": [
          "month",
          "year"
        ],
        "description": "Interval"
      },
      {
        "name": "status",
        "storageType": "TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'cancelled'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "pending",
        "options": [
          "pending",
          "active",
          "cancelled"
        ],
        "description": "Status"
      },
      {
        "name": "stripe_session_id",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Stripe Session Id"
      },
      {
        "name": "stripe_subscription_id",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Stripe Subscription Id"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  {
    "name": "Team",
    "group": "collaboration",
    "description": "Creator collaboration teams with membership, devices, roles, and responsibilities.",
    "required": [
      "team_name",
      "owner_id"
    ],
    "defaults": {},
    "enums": {},
    "accessPolicy": {
      "read": "owner or listed member",
      "create": "owner_id must match the authenticated user id",
      "update": "owner only",
      "delete": "owner only"
    },
    "translatedFrom": "Team.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "team_name",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Team Name"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "owner_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Owner Id"
      },
      {
        "name": "members",
        "storageType": "JSONB NOT NULL DEFAULT '[]'::jsonb",
        "valueType": "json",
        "required": true,
        "description": "Members"
      },
      {
        "name": "member_details",
        "storageType": "JSONB NOT NULL DEFAULT '[]'::jsonb",
        "valueType": "json",
        "required": true,
        "description": "Member Details"
      },
      {
        "name": "purpose",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Purpose"
      },
      {
        "name": "focus",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Focus"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  {
    "name": "TruthScore",
    "group": "trust",
    "description": "Truth-scoring records for posts, comments, and journalism items.",
    "required": [
      "target_id",
      "target_type",
      "score"
    ],
    "defaults": {
      "score": 50,
      "confidence": 0
    },
    "enums": {
      "target_type": [
        "post",
        "comment",
        "journalism"
      ]
    },
    "accessPolicy": {
      "read": "public",
      "create": "admin only",
      "update": "admin only",
      "delete": "admin only"
    },
    "translatedFrom": "TruthScore.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "target_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Target Id"
      },
      {
        "name": "target_type",
        "storageType": "TEXT NOT NULL CHECK (target_type IN ('post', 'comment', 'journalism'))",
        "valueType": "string",
        "required": true,
        "options": [
          "post",
          "comment",
          "journalism"
        ],
        "description": "Target Type"
      },
      {
        "name": "score",
        "storageType": "DOUBLE PRECISION NOT NULL DEFAULT 50",
        "valueType": "number",
        "required": true,
        "defaultValue": 50,
        "description": "Score"
      },
      {
        "name": "confidence",
        "storageType": "DOUBLE PRECISION NOT NULL DEFAULT 0",
        "valueType": "number",
        "required": true,
        "defaultValue": 0,
        "description": "Confidence"
      },
      {
        "name": "factors",
        "storageType": "JSONB NOT NULL DEFAULT '[]'::jsonb",
        "valueType": "json",
        "required": true,
        "description": "Factors"
      },
      {
        "name": "ai_detection_flags",
        "storageType": "JSONB NOT NULL DEFAULT '[]'::jsonb",
        "valueType": "json",
        "required": true,
        "description": "Ai Detection Flags"
      },
      {
        "name": "notes",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Notes"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  {
    "name": "User",
    "group": "identity",
    "description": "Minimal app-level user role and status projection used by WiseRavenShare.",
    "required": [
      "role"
    ],
    "defaults": {
      "status": "active"
    },
    "enums": {
      "role": [
        "admin",
        "user"
      ],
      "status": [
        "active",
        "suspended",
        "blocked"
      ]
    },
    "accessPolicy": {
      "note": "Managed by application auth and admin workflows."
    },
    "translatedFrom": "User.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "role",
        "storageType": "TEXT NOT NULL CHECK (role IN ('admin', 'user'))",
        "valueType": "string",
        "required": true,
        "options": [
          "admin",
          "user"
        ],
        "description": "Role"
      },
      {
        "name": "status",
        "storageType": "TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'blocked'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "active",
        "options": [
          "active",
          "suspended",
          "blocked"
        ],
        "description": "Status"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  {
    "name": "UserBadge",
    "group": "reputation",
    "description": "Badge awards granted to users.",
    "required": [
      "user_id",
      "badge_id"
    ],
    "defaults": {},
    "enums": {},
    "accessPolicy": {
      "read": "public",
      "create": "admin only",
      "update": "admin only",
      "delete": "admin only"
    },
    "translatedFrom": "UserBadge.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "user_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "User Id"
      },
      {
        "name": "badge_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Badge Id"
      },
      {
        "name": "awarded_reason",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Awarded Reason"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  {
    "name": "UserProfile",
    "group": "identity",
    "description": "Public-facing user profile and social connection metadata.",
    "required": [
      "display_name"
    ],
    "defaults": {
      "is_creator": true,
      "verified": false,
      "truth_reputation": 50,
      "follower_count": 0,
      "following_count": 0,
      "post_count": 0
    },
    "enums": {},
    "accessPolicy": {
      "read": "public",
      "create": "created_by_id must match the authenticated user id",
      "update": "created_by_id owner only",
      "delete": "created_by_id owner only"
    },
    "translatedFrom": "UserProfile.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "created_by_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Created By Id"
      },
      {
        "name": "display_name",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Display Name"
      },
      {
        "name": "bio",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Bio"
      },
      {
        "name": "avatar_uri",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Avatar Uri"
      },
      {
        "name": "cover_uri",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Cover Uri"
      },
      {
        "name": "location",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Location"
      },
      {
        "name": "website",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Website"
      },
      {
        "name": "is_creator",
        "storageType": "BOOLEAN NOT NULL DEFAULT TRUE",
        "valueType": "boolean",
        "required": true,
        "defaultValue": true,
        "description": "Is Creator"
      },
      {
        "name": "verified",
        "storageType": "BOOLEAN NOT NULL DEFAULT FALSE",
        "valueType": "boolean",
        "required": true,
        "defaultValue": false,
        "description": "Verified"
      },
      {
        "name": "truth_reputation",
        "storageType": "DOUBLE PRECISION NOT NULL DEFAULT 50",
        "valueType": "number",
        "required": true,
        "defaultValue": 50,
        "description": "Truth Reputation"
      },
      {
        "name": "follower_count",
        "storageType": "DOUBLE PRECISION NOT NULL DEFAULT 0",
        "valueType": "number",
        "required": true,
        "defaultValue": 0,
        "description": "Follower Count"
      },
      {
        "name": "following_count",
        "storageType": "DOUBLE PRECISION NOT NULL DEFAULT 0",
        "valueType": "number",
        "required": true,
        "defaultValue": 0,
        "description": "Following Count"
      },
      {
        "name": "post_count",
        "storageType": "DOUBLE PRECISION NOT NULL DEFAULT 0",
        "valueType": "number",
        "required": true,
        "defaultValue": 0,
        "description": "Post Count"
      },
      {
        "name": "social_connections",
        "storageType": "JSONB NOT NULL DEFAULT '[]'::jsonb",
        "valueType": "json",
        "required": true,
        "description": "Social Connections"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  {
    "name": "Vibe",
    "group": "community",
    "description": "User mood check-ins and short notes.",
    "required": [
      "mood"
    ],
    "defaults": {},
    "enums": {
      "mood": [
        "inspired",
        "fired_up",
        "chill",
        "curious",
        "loved",
        "tired",
        "creative",
        "reflective"
      ]
    },
    "accessPolicy": {
      "read": "public",
      "create": "created_by_id must match the authenticated user id",
      "update": "created_by_id owner only",
      "delete": "created_by_id owner only"
    },
    "translatedFrom": "Vibe.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "created_by_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Created By Id"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "mood",
        "storageType": "TEXT NOT NULL CHECK (mood IN ('inspired', 'fired_up', 'chill', 'curious', 'loved', 'tired', 'creative', 'reflective'))",
        "valueType": "string",
        "required": true,
        "options": [
          "inspired",
          "fired_up",
          "chill",
          "curious",
          "loved",
          "tired",
          "creative",
          "reflective"
        ],
        "description": "Mood"
      },
      {
        "name": "note",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Note"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  {
    "name": "WiseCoinTransaction",
    "group": "reputation",
    "description": "WiseCoin earning and spending ledger entries.",
    "required": [
      "user_id",
      "amount",
      "category"
    ],
    "defaults": {
      "category": "productivity",
      "balance_after": 0
    },
    "enums": {
      "category": [
        "productivity",
        "participation",
        "promotion",
        "value",
        "bonus",
        "spend"
      ]
    },
    "accessPolicy": {
      "read": "user_id owner or admin",
      "create": "admin only",
      "update": "admin only",
      "delete": "admin only"
    },
    "translatedFrom": "WiseCoinTransaction.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "user_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "User Id"
      },
      {
        "name": "amount",
        "storageType": "DOUBLE PRECISION NOT NULL",
        "valueType": "number",
        "required": true,
        "description": "Amount"
      },
      {
        "name": "reason",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Reason"
      },
      {
        "name": "category",
        "storageType": "TEXT NOT NULL DEFAULT 'productivity' CHECK (category IN ('productivity', 'participation', 'promotion', 'value', 'bonus', 'spend'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "productivity",
        "options": [
          "productivity",
          "participation",
          "promotion",
          "value",
          "bonus",
          "spend"
        ],
        "description": "Category"
      },
      {
        "name": "balance_after",
        "storageType": "DOUBLE PRECISION NOT NULL DEFAULT 0",
        "valueType": "number",
        "required": true,
        "defaultValue": 0,
        "description": "Balance After"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  }
];

export const WISERAVENSHARE_ENTITY_GROUPS = [
  {
    "id": "all",
    "label": "All Entities"
  },
  {
    "id": "admin",
    "label": "Admin"
  },
  {
    "id": "collaboration",
    "label": "Collaboration"
  },
  {
    "id": "community",
    "label": "Community"
  },
  {
    "id": "growth",
    "label": "Growth"
  },
  {
    "id": "identity",
    "label": "Identity"
  },
  {
    "id": "media",
    "label": "Media"
  },
  {
    "id": "messaging",
    "label": "Messaging"
  },
  {
    "id": "payments",
    "label": "Payments"
  },
  {
    "id": "podcast",
    "label": "Podcast"
  },
  {
    "id": "productivity",
    "label": "Productivity"
  },
  {
    "id": "reputation",
    "label": "Reputation"
  },
  {
    "id": "rights",
    "label": "Rights"
  },
  {
    "id": "social",
    "label": "Social"
  },
  {
    "id": "trust",
    "label": "Trust"
  }
];

export const WISERAVENSHARE_ENTITY_NAMES = [
  "AdminAccessRequest",
  "Badge",
  "Block",
  "Bookmark",
  "Challenge",
  "Comment",
  "Conversation",
  "CopyrightReport",
  "DigitalCertificate",
  "FeatureRelease",
  "Follow",
  "Invitation",
  "JamSession",
  "JournalismReport",
  "KaraokePayment",
  "Like",
  "LiveStream",
  "MediaAsset",
  "MediaRight",
  "Message",
  "MusicAnalysis",
  "Notification",
  "PlannerEvent",
  "Podcast",
  "PodcastPayment",
  "Post",
  "Scratchboard",
  "SubscriptionPayment",
  "Team",
  "TruthScore",
  "User",
  "UserBadge",
  "UserProfile",
  "Vibe",
  "WiseCoinTransaction"
];

export const WISERAVENSHARE_ENTITIES_BY_NAME = {
  "AdminAccessRequest": {
    "name": "AdminAccessRequest",
    "group": "admin",
    "description": "Administrative access requests. Source RLS is enforced by WiseRavenShare application authorization rather than by the DigitalOcean PostgreSQL proxy.",
    "required": [
      "requester_email"
    ],
    "defaults": {
      "status": "pending"
    },
    "enums": {
      "status": [
        "pending",
        "approved",
        "denied"
      ]
    },
    "accessPolicy": {
      "create": "admin only",
      "read": "admin only",
      "update": "admin only",
      "delete": "admin only"
    },
    "translatedFrom": "AdminAccessRequest.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "requester_email",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Requester Email"
      },
      {
        "name": "contact_email",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Contact Email"
      },
      {
        "name": "requester_name",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Requester Name"
      },
      {
        "name": "requested_userid",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Requested Userid"
      },
      {
        "name": "reason",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Reason"
      },
      {
        "name": "status",
        "storageType": "TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "pending",
        "options": [
          "pending",
          "approved",
          "denied"
        ],
        "description": "Status"
      },
      {
        "name": "assigned_admin_email",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Assigned Admin Email"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  "Badge": {
    "name": "Badge",
    "group": "reputation",
    "description": "Configurable badge definitions for participation, productivity, promotion, value, truth, and creator awards.",
    "required": [
      "name",
      "category"
    ],
    "defaults": {
      "category": "participation",
      "threshold": 0
    },
    "enums": {
      "category": [
        "participation",
        "productivity",
        "promotion",
        "value",
        "truth",
        "creator"
      ]
    },
    "accessPolicy": {
      "read": "public",
      "create": "admin only",
      "update": "admin only",
      "delete": "admin only"
    },
    "translatedFrom": "Badge.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "name",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Name"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "icon_uri",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Icon Uri"
      },
      {
        "name": "category",
        "storageType": "TEXT NOT NULL DEFAULT 'participation' CHECK (category IN ('participation', 'productivity', 'promotion', 'value', 'truth', 'creator'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "participation",
        "options": [
          "participation",
          "productivity",
          "promotion",
          "value",
          "truth",
          "creator"
        ],
        "description": "Category"
      },
      {
        "name": "threshold",
        "storageType": "DOUBLE PRECISION NOT NULL DEFAULT 0",
        "valueType": "number",
        "required": true,
        "defaultValue": 0,
        "description": "Threshold"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  "Block": {
    "name": "Block",
    "group": "social",
    "description": "Per-user user-block relationships with optional notes and reasons.",
    "required": [
      "blocked_id"
    ],
    "defaults": {},
    "enums": {},
    "accessPolicy": {
      "read": "created_by_id owner only",
      "create": "created_by_id must match the authenticated user id",
      "delete": "created_by_id owner only"
    },
    "translatedFrom": "Block.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "created_by_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Created By Id"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "blocked_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Blocked Id"
      },
      {
        "name": "reason",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Reason"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  "Bookmark": {
    "name": "Bookmark",
    "group": "social",
    "description": "Per-user saved post references with optional labels and cached content.",
    "required": [
      "post_id"
    ],
    "defaults": {},
    "enums": {},
    "accessPolicy": {
      "read": "created_by_id owner only",
      "create": "created_by_id must match the authenticated user id",
      "delete": "created_by_id owner only"
    },
    "translatedFrom": "Bookmark.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "created_by_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Created By Id"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "post_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Post Id"
      },
      {
        "name": "post_content",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Post Content"
      },
      {
        "name": "label",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Label"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  "Challenge": {
    "name": "Challenge",
    "group": "trust",
    "description": "Truth challenges raised against posts, including evidence and moderation status.",
    "required": [
      "post_id",
      "reason"
    ],
    "defaults": {
      "status": "open"
    },
    "enums": {
      "status": [
        "open",
        "under_review",
        "upheld",
        "dismissed"
      ]
    },
    "accessPolicy": {
      "read": "public",
      "create": "created_by_id must match the authenticated user id",
      "update": "admin only",
      "delete": "created_by_id owner or admin"
    },
    "translatedFrom": "Challenge.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "created_by_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Created By Id"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "post_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Post Id"
      },
      {
        "name": "reason",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Reason"
      },
      {
        "name": "evidence",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Evidence"
      },
      {
        "name": "status",
        "storageType": "TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'upheld', 'dismissed'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "open",
        "options": [
          "open",
          "under_review",
          "upheld",
          "dismissed"
        ],
        "description": "Status"
      },
      {
        "name": "verdict",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Verdict"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  "Comment": {
    "name": "Comment",
    "group": "social",
    "description": "Comments on posts with optional threading and local moderation/truth metadata.",
    "required": [
      "post_id",
      "content"
    ],
    "defaults": {
      "truth_score": 50,
      "like_count": 0
    },
    "enums": {},
    "accessPolicy": {
      "read": "public",
      "create": "created_by_id must match the authenticated user id",
      "update": "created_by_id owner or admin",
      "delete": "created_by_id owner or admin"
    },
    "translatedFrom": "Comment.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "created_by_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Created By Id"
      },
      {
        "name": "post_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Post Id"
      },
      {
        "name": "content",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Content"
      },
      {
        "name": "parent_id",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Parent Id"
      },
      {
        "name": "truth_score",
        "storageType": "DOUBLE PRECISION NOT NULL DEFAULT 50",
        "valueType": "number",
        "required": true,
        "defaultValue": 50,
        "description": "Truth Score"
      },
      {
        "name": "like_count",
        "storageType": "DOUBLE PRECISION NOT NULL DEFAULT 0",
        "valueType": "number",
        "required": true,
        "defaultValue": 0,
        "description": "Like Count"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  "Conversation": {
    "name": "Conversation",
    "group": "messaging",
    "description": "Direct and group conversation containers with participant lists and last-message timestamps.",
    "required": [
      "participants",
      "type"
    ],
    "defaults": {
      "type": "dm"
    },
    "enums": {
      "type": [
        "dm",
        "group"
      ]
    },
    "accessPolicy": {
      "read": "participants include authenticated user or admin",
      "create": "participants must include authenticated user",
      "update": "created_by_id owner or admin",
      "delete": "admin only"
    },
    "translatedFrom": "Conversation.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "created_by_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Created By Id"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "participants",
        "storageType": "JSONB NOT NULL DEFAULT '[]'::jsonb",
        "valueType": "json",
        "required": true,
        "description": "Participants"
      },
      {
        "name": "type",
        "storageType": "TEXT NOT NULL DEFAULT 'dm' CHECK (type IN ('dm', 'group'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "dm",
        "options": [
          "dm",
          "group"
        ],
        "description": "Type"
      },
      {
        "name": "title",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Title"
      },
      {
        "name": "last_message_at",
        "storageType": "TIMESTAMPTZ",
        "valueType": "datetime",
        "required": false,
        "description": "Last Message At"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  "CopyrightReport": {
    "name": "CopyrightReport",
    "group": "rights",
    "description": "Copyright, DMCA, dispute, and counter-notice reports against media assets.",
    "required": [
      "media_asset_id",
      "reporter_name",
      "report_type"
    ],
    "defaults": {
      "report_type": "infringement",
      "status": "submitted",
      "action_taken": "none"
    },
    "enums": {
      "report_type": [
        "infringement",
        "dmca_takedown",
        "dispute",
        "counter_notice"
      ],
      "status": [
        "submitted",
        "under_review",
        "action_taken",
        "dismissed",
        "restored"
      ],
      "action_taken": [
        "takedown",
        "warning",
        "restored",
        "dismissed",
        "none"
      ]
    },
    "accessPolicy": {
      "read": "created_by_id owner or admin",
      "create": "created_by_id must match the authenticated user id",
      "update": "admin only",
      "delete": "created_by_id owner or admin"
    },
    "translatedFrom": "CopyrightReport.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "created_by_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Created By Id"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "media_asset_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Media Asset Id"
      },
      {
        "name": "asset_title",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Asset Title"
      },
      {
        "name": "reporter_name",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Reporter Name"
      },
      {
        "name": "reporter_email",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Reporter Email"
      },
      {
        "name": "report_type",
        "storageType": "TEXT NOT NULL DEFAULT 'infringement' CHECK (report_type IN ('infringement', 'dmca_takedown', 'dispute', 'counter_notice'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "infringement",
        "options": [
          "infringement",
          "dmca_takedown",
          "dispute",
          "counter_notice"
        ],
        "description": "Report Type"
      },
      {
        "name": "infringement_summary",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Infringement Summary"
      },
      {
        "name": "original_work_title",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Original Work Title"
      },
      {
        "name": "original_work_url",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Original Work Url"
      },
      {
        "name": "evidence_uri",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Evidence Uri"
      },
      {
        "name": "status",
        "storageType": "TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'under_review', 'action_taken', 'dismissed', 'restored'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "submitted",
        "options": [
          "submitted",
          "under_review",
          "action_taken",
          "dismissed",
          "restored"
        ],
        "description": "Status"
      },
      {
        "name": "action_taken",
        "storageType": "TEXT NOT NULL DEFAULT 'none' CHECK (action_taken IN ('takedown', 'warning', 'restored', 'dismissed', 'none'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "none",
        "options": [
          "takedown",
          "warning",
          "restored",
          "dismissed",
          "none"
        ],
        "description": "Action Taken"
      },
      {
        "name": "resolution_notes",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Resolution Notes"
      },
      {
        "name": "reviewed_by",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Reviewed By"
      },
      {
        "name": "resolved_at",
        "storageType": "TIMESTAMPTZ",
        "valueType": "datetime",
        "required": false,
        "description": "Resolved At"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  "DigitalCertificate": {
    "name": "DigitalCertificate",
    "group": "rights",
    "description": "Digital ownership, authenticity, licensing, and original-creation certificates.",
    "required": [
      "media_asset_id",
      "rights_holder_name",
      "certificate_type"
    ],
    "defaults": {
      "certificate_type": "ownership",
      "authenticity_badge": "unverified",
      "verification_status": "pending"
    },
    "enums": {
      "asset_type": [
        "music",
        "video",
        "photo"
      ],
      "certificate_type": [
        "ownership",
        "authenticity",
        "licensing",
        "original_creation"
      ],
      "authenticity_badge": [
        "verified",
        "unverified",
        "flagged"
      ],
      "verification_status": [
        "pending",
        "verified",
        "flagged",
        "rejected"
      ]
    },
    "accessPolicy": {
      "read": "created_by_id owner or admin",
      "create": "created_by_id must match the authenticated user id",
      "update": "created_by_id owner or admin",
      "delete": "created_by_id owner or admin"
    },
    "translatedFrom": "DigitalCertificate.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "created_by_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Created By Id"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "media_asset_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Media Asset Id"
      },
      {
        "name": "asset_title",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Asset Title"
      },
      {
        "name": "asset_type",
        "storageType": "TEXT CHECK (asset_type IN ('music', 'video', 'photo'))",
        "valueType": "string",
        "required": false,
        "options": [
          "music",
          "video",
          "photo"
        ],
        "description": "Asset Type"
      },
      {
        "name": "file_uri",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "File Uri"
      },
      {
        "name": "certificate_id",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Certificate Id"
      },
      {
        "name": "rights_holder_name",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Rights Holder Name"
      },
      {
        "name": "rights_holder_email",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Rights Holder Email"
      },
      {
        "name": "certificate_type",
        "storageType": "TEXT NOT NULL DEFAULT 'ownership' CHECK (certificate_type IN ('ownership', 'authenticity', 'licensing', 'original_creation'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "ownership",
        "options": [
          "ownership",
          "authenticity",
          "licensing",
          "original_creation"
        ],
        "description": "Certificate Type"
      },
      {
        "name": "metadata_timestamp",
        "storageType": "TIMESTAMPTZ",
        "valueType": "datetime",
        "required": false,
        "description": "Metadata Timestamp"
      },
      {
        "name": "authenticity_badge",
        "storageType": "TEXT NOT NULL DEFAULT 'unverified' CHECK (authenticity_badge IN ('verified', 'unverified', 'flagged'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "unverified",
        "options": [
          "verified",
          "unverified",
          "flagged"
        ],
        "description": "Authenticity Badge"
      },
      {
        "name": "verification_status",
        "storageType": "TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'flagged', 'rejected'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "pending",
        "options": [
          "pending",
          "verified",
          "flagged",
          "rejected"
        ],
        "description": "Verification Status"
      },
      {
        "name": "state",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "State"
      },
      {
        "name": "copyright_authority",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Copyright Authority"
      },
      {
        "name": "authority_url",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Authority Url"
      },
      {
        "name": "file_hash",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "File Hash"
      },
      {
        "name": "verification_notes",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Verification Notes"
      },
      {
        "name": "verified_at",
        "storageType": "TIMESTAMPTZ",
        "valueType": "datetime",
        "required": false,
        "description": "Verified At"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  "FeatureRelease": {
    "name": "FeatureRelease",
    "group": "admin",
    "description": "Feature release notes and rollout metadata.",
    "required": [
      "title",
      "status"
    ],
    "defaults": {
      "category": "feature",
      "status": "planned",
      "target_audience": "all",
      "rollout_percentage": 100,
      "is_public": false
    },
    "enums": {
      "category": [
        "feature",
        "improvement",
        "bugfix",
        "security",
        "infrastructure"
      ],
      "status": [
        "planned",
        "in_development",
        "testing",
        "released",
        "rolled_back"
      ],
      "target_audience": [
        "all",
        "creators",
        "admins",
        "beta"
      ]
    },
    "accessPolicy": {
      "read": "public when is_public = true, otherwise admin",
      "create": "admin only",
      "update": "admin only",
      "delete": "admin only"
    },
    "translatedFrom": "FeatureRelease.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "title",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Title"
      },
      {
        "name": "version",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Version"
      },
      {
        "name": "category",
        "storageType": "TEXT NOT NULL DEFAULT 'feature' CHECK (category IN ('feature', 'improvement', 'bugfix', 'security', 'infrastructure'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "feature",
        "options": [
          "feature",
          "improvement",
          "bugfix",
          "security",
          "infrastructure"
        ],
        "description": "Category"
      },
      {
        "name": "status",
        "storageType": "TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_development', 'testing', 'released', 'rolled_back'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "planned",
        "options": [
          "planned",
          "in_development",
          "testing",
          "released",
          "rolled_back"
        ],
        "description": "Status"
      },
      {
        "name": "changelog",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Changelog"
      },
      {
        "name": "release_date",
        "storageType": "DATE",
        "valueType": "date",
        "required": false,
        "description": "Release Date"
      },
      {
        "name": "target_audience",
        "storageType": "TEXT NOT NULL DEFAULT 'all' CHECK (target_audience IN ('all', 'creators', 'admins', 'beta'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "all",
        "options": [
          "all",
          "creators",
          "admins",
          "beta"
        ],
        "description": "Target Audience"
      },
      {
        "name": "rollout_percentage",
        "storageType": "DOUBLE PRECISION NOT NULL DEFAULT 100",
        "valueType": "number",
        "required": true,
        "defaultValue": 100,
        "description": "Rollout Percentage"
      },
      {
        "name": "is_public",
        "storageType": "BOOLEAN NOT NULL DEFAULT FALSE",
        "valueType": "boolean",
        "required": true,
        "defaultValue": false,
        "description": "Is Public"
      },
      {
        "name": "tags",
        "storageType": "JSONB NOT NULL DEFAULT '[]'::jsonb",
        "valueType": "json",
        "required": true,
        "description": "Tags"
      },
      {
        "name": "owner_id",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Owner Id"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  "Follow": {
    "name": "Follow",
    "group": "social",
    "description": "User follow relationships with optional muted state.",
    "required": [
      "followee_id"
    ],
    "defaults": {
      "status": "active"
    },
    "enums": {
      "status": [
        "active",
        "muted"
      ]
    },
    "accessPolicy": {
      "create": "created_by_id must match the authenticated user id",
      "read": "created_by_id owner only",
      "update": "created_by_id owner only",
      "delete": "created_by_id owner only"
    },
    "translatedFrom": "Follow.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "created_by_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Created By Id"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "followee_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Followee Id"
      },
      {
        "name": "status",
        "storageType": "TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'muted'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "active",
        "options": [
          "active",
          "muted"
        ],
        "description": "Status"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  "Invitation": {
    "name": "Invitation",
    "group": "growth",
    "description": "Invite and referral tracking with reward status.",
    "required": [
      "invitee_email"
    ],
    "defaults": {
      "reward_amount": 25,
      "status": "pending",
      "reward_issued": false
    },
    "enums": {
      "status": [
        "pending",
        "accepted"
      ]
    },
    "accessPolicy": {
      "read": "created_by_id owner only",
      "create": "created_by_id must match the authenticated user id",
      "update": "admin only",
      "delete": "created_by_id owner only"
    },
    "translatedFrom": "Invitation.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "created_by_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Created By Id"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "invitee_email",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Invitee Email"
      },
      {
        "name": "reward_amount",
        "storageType": "DOUBLE PRECISION NOT NULL DEFAULT 25",
        "valueType": "number",
        "required": true,
        "defaultValue": 25,
        "description": "Reward Amount"
      },
      {
        "name": "status",
        "storageType": "TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "pending",
        "options": [
          "pending",
          "accepted"
        ],
        "description": "Status"
      },
      {
        "name": "reward_issued",
        "storageType": "BOOLEAN NOT NULL DEFAULT FALSE",
        "valueType": "boolean",
        "required": true,
        "defaultValue": false,
        "description": "Reward Issued"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  "JamSession": {
    "name": "JamSession",
    "group": "collaboration",
    "description": "Collaborative jam sessions with participant, schedule, and track metadata.",
    "required": [
      "title",
      "participants"
    ],
    "defaults": {
      "status": "active",
      "bpm": 120
    },
    "enums": {
      "status": [
        "scheduled",
        "active",
        "ended"
      ]
    },
    "accessPolicy": {
      "read": "public",
      "create": "participants must include authenticated user",
      "update": "application-managed",
      "delete": "created_by_id owner or admin"
    },
    "translatedFrom": "JamSession.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "created_by_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Created By Id"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "title",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Title"
      },
      {
        "name": "participants",
        "storageType": "JSONB NOT NULL DEFAULT '[]'::jsonb",
        "valueType": "json",
        "required": true,
        "description": "Participants"
      },
      {
        "name": "signup_ids",
        "storageType": "JSONB NOT NULL DEFAULT '[]'::jsonb",
        "valueType": "json",
        "required": true,
        "description": "Signup Ids"
      },
      {
        "name": "status",
        "storageType": "TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('scheduled', 'active', 'ended'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "active",
        "options": [
          "scheduled",
          "active",
          "ended"
        ],
        "description": "Status"
      },
      {
        "name": "track_uris",
        "storageType": "JSONB NOT NULL DEFAULT '[]'::jsonb",
        "valueType": "json",
        "required": true,
        "description": "Track Uris"
      },
      {
        "name": "scheduled_date",
        "storageType": "TIMESTAMPTZ",
        "valueType": "datetime",
        "required": false,
        "description": "Scheduled Date"
      },
      {
        "name": "started_at",
        "storageType": "TIMESTAMPTZ",
        "valueType": "datetime",
        "required": false,
        "description": "Started At"
      },
      {
        "name": "ended_at",
        "storageType": "TIMESTAMPTZ",
        "valueType": "datetime",
        "required": false,
        "description": "Ended At"
      },
      {
        "name": "bpm",
        "storageType": "DOUBLE PRECISION NOT NULL DEFAULT 120",
        "valueType": "number",
        "required": true,
        "defaultValue": 120,
        "description": "Bpm"
      },
      {
        "name": "max_participants",
        "storageType": "DOUBLE PRECISION",
        "valueType": "number",
        "required": false,
        "description": "Max Participants"
      },
      {
        "name": "reminder_sent_at",
        "storageType": "TIMESTAMPTZ",
        "valueType": "datetime",
        "required": false,
        "description": "Reminder Sent At"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  "JournalismReport": {
    "name": "JournalismReport",
    "group": "trust",
    "description": "Journalism verification records attached to posts.",
    "required": [
      "post_id",
      "verification_status"
    ],
    "defaults": {
      "verification_status": "verified"
    },
    "enums": {
      "verification_status": [
        "under_review",
        "verified",
        "rejected"
      ]
    },
    "accessPolicy": {
      "read": "public",
      "create": "created_by_id must match the authenticated user id",
      "update": "admin only",
      "delete": "admin only"
    },
    "translatedFrom": "JournalismReport.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "created_by_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Created By Id"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "post_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Post Id"
      },
      {
        "name": "headline",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Headline"
      },
      {
        "name": "region",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Region"
      },
      {
        "name": "truth_score",
        "storageType": "DOUBLE PRECISION",
        "valueType": "number",
        "required": false,
        "description": "Truth Score"
      },
      {
        "name": "verification_status",
        "storageType": "TEXT NOT NULL DEFAULT 'verified' CHECK (verification_status IN ('under_review', 'verified', 'rejected'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "verified",
        "options": [
          "under_review",
          "verified",
          "rejected"
        ],
        "description": "Verification Status"
      },
      {
        "name": "reviewer_id",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Reviewer Id"
      },
      {
        "name": "reviewer_name",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Reviewer Name"
      },
      {
        "name": "review_notes",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Review Notes"
      },
      {
        "name": "reviewed_at",
        "storageType": "TIMESTAMPTZ",
        "valueType": "datetime",
        "required": false,
        "description": "Reviewed At"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  "KaraokePayment": {
    "name": "KaraokePayment",
    "group": "payments",
    "description": "Karaoke subscription payment tracking.",
    "required": [
      "user_id",
      "payment_type",
      "amount"
    ],
    "defaults": {
      "payment_type": "subscription",
      "status": "pending"
    },
    "enums": {
      "payment_type": [
        "subscription"
      ],
      "status": [
        "pending",
        "active",
        "cancelled"
      ]
    },
    "accessPolicy": {
      "read": "user_id owner or admin",
      "create": "user_id must match the authenticated user id",
      "update": "admin only",
      "delete": "admin only"
    },
    "translatedFrom": "KaraokePayment.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "user_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "User Id"
      },
      {
        "name": "payment_type",
        "storageType": "TEXT NOT NULL DEFAULT 'subscription' CHECK (payment_type IN ('subscription'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "subscription",
        "options": [
          "subscription"
        ],
        "description": "Payment Type"
      },
      {
        "name": "amount",
        "storageType": "DOUBLE PRECISION NOT NULL",
        "valueType": "number",
        "required": true,
        "description": "Amount"
      },
      {
        "name": "status",
        "storageType": "TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'cancelled'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "pending",
        "options": [
          "pending",
          "active",
          "cancelled"
        ],
        "description": "Status"
      },
      {
        "name": "stripe_session_id",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Stripe Session Id"
      },
      {
        "name": "stripe_subscription_id",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Stripe Subscription Id"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  "Like": {
    "name": "Like",
    "group": "social",
    "description": "Likes on posts or comments.",
    "required": [
      "target_id",
      "target_type"
    ],
    "defaults": {},
    "enums": {
      "target_type": [
        "post",
        "comment"
      ]
    },
    "accessPolicy": {
      "create": "created_by_id must match the authenticated user id",
      "read": "public",
      "update": "created_by_id owner only",
      "delete": "created_by_id owner only"
    },
    "translatedFrom": "Like.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "created_by_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Created By Id"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "target_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Target Id"
      },
      {
        "name": "target_type",
        "storageType": "TEXT NOT NULL CHECK (target_type IN ('post', 'comment'))",
        "valueType": "string",
        "required": true,
        "options": [
          "post",
          "comment"
        ],
        "description": "Target Type"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  "LiveStream": {
    "name": "LiveStream",
    "group": "media",
    "description": "Live stream records with streamer and chunk state metadata.",
    "required": [
      "title",
      "streamer_id"
    ],
    "defaults": {
      "status": "live",
      "chunk_sequence": 0,
      "is_audio_only": false
    },
    "enums": {
      "status": [
        "live",
        "ended"
      ]
    },
    "accessPolicy": {
      "read": "public",
      "create": "created_by_id must match the authenticated user id",
      "update": "created_by_id owner or admin",
      "delete": "created_by_id owner or admin"
    },
    "translatedFrom": "LiveStream.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "created_by_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Created By Id"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "title",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Title"
      },
      {
        "name": "streamer_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Streamer Id"
      },
      {
        "name": "status",
        "storageType": "TEXT NOT NULL DEFAULT 'live' CHECK (status IN ('live', 'ended'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "live",
        "options": [
          "live",
          "ended"
        ],
        "description": "Status"
      },
      {
        "name": "current_chunk_uri",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Current Chunk Uri"
      },
      {
        "name": "chunk_sequence",
        "storageType": "DOUBLE PRECISION NOT NULL DEFAULT 0",
        "valueType": "number",
        "required": true,
        "defaultValue": 0,
        "description": "Chunk Sequence"
      },
      {
        "name": "is_audio_only",
        "storageType": "BOOLEAN NOT NULL DEFAULT FALSE",
        "valueType": "boolean",
        "required": true,
        "defaultValue": false,
        "description": "Is Audio Only"
      },
      {
        "name": "started_at",
        "storageType": "TIMESTAMPTZ",
        "valueType": "datetime",
        "required": false,
        "description": "Started At"
      },
      {
        "name": "ended_at",
        "storageType": "TIMESTAMPTZ",
        "valueType": "datetime",
        "required": false,
        "description": "Ended At"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  "MediaAsset": {
    "name": "MediaAsset",
    "group": "media",
    "description": "Uploaded media assets, including privacy, tags, and proprietary flags.",
    "required": [
      "asset_type",
      "file_uri"
    ],
    "defaults": {
      "is_proprietary": false,
      "is_public": false
    },
    "enums": {
      "asset_type": [
        "photo",
        "music",
        "video"
      ]
    },
    "accessPolicy": {
      "read": "created_by_id owner, public when is_public = true, or admin",
      "create": "created_by_id must match the authenticated user id",
      "update": "created_by_id owner or admin",
      "delete": "created_by_id owner or admin"
    },
    "translatedFrom": "MediaAsset.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "created_by_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Created By Id"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "asset_type",
        "storageType": "TEXT NOT NULL CHECK (asset_type IN ('photo', 'music', 'video'))",
        "valueType": "string",
        "required": true,
        "options": [
          "photo",
          "music",
          "video"
        ],
        "description": "Asset Type"
      },
      {
        "name": "file_uri",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "File Uri"
      },
      {
        "name": "title",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Title"
      },
      {
        "name": "duration",
        "storageType": "DOUBLE PRECISION",
        "valueType": "number",
        "required": false,
        "description": "Duration"
      },
      {
        "name": "is_proprietary",
        "storageType": "BOOLEAN NOT NULL DEFAULT FALSE",
        "valueType": "boolean",
        "required": true,
        "defaultValue": false,
        "description": "Is Proprietary"
      },
      {
        "name": "tags",
        "storageType": "JSONB NOT NULL DEFAULT '[]'::jsonb",
        "valueType": "json",
        "required": true,
        "description": "Tags"
      },
      {
        "name": "is_public",
        "storageType": "BOOLEAN NOT NULL DEFAULT FALSE",
        "valueType": "boolean",
        "required": true,
        "defaultValue": false,
        "description": "Is Public"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  "MediaRight": {
    "name": "MediaRight",
    "group": "rights",
    "description": "Rights ownership and licensing records for media assets.",
    "required": [
      "media_asset_id",
      "rights_holder_name",
      "rights_type"
    ],
    "defaults": {
      "rights_type": "original_work",
      "license_type": "exclusive",
      "territory": "global",
      "status": "active"
    },
    "enums": {
      "asset_type": [
        "music",
        "video",
        "photo"
      ],
      "rights_type": [
        "original_work",
        "licensed",
        "assignment",
        "public_domain",
        "fair_use"
      ],
      "license_type": [
        "exclusive",
        "non_exclusive",
        "creative_commons",
        "royalty_free",
        "custom"
      ],
      "status": [
        "active",
        "expired",
        "disputed",
        "revoked"
      ]
    },
    "accessPolicy": {
      "read": "created_by_id owner or admin",
      "create": "created_by_id must match the authenticated user id",
      "update": "created_by_id owner or admin",
      "delete": "created_by_id owner or admin"
    },
    "translatedFrom": "MediaRight.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "created_by_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Created By Id"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "media_asset_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Media Asset Id"
      },
      {
        "name": "asset_title",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Asset Title"
      },
      {
        "name": "asset_type",
        "storageType": "TEXT CHECK (asset_type IN ('music', 'video', 'photo'))",
        "valueType": "string",
        "required": false,
        "options": [
          "music",
          "video",
          "photo"
        ],
        "description": "Asset Type"
      },
      {
        "name": "rights_holder_name",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Rights Holder Name"
      },
      {
        "name": "rights_holder_email",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Rights Holder Email"
      },
      {
        "name": "rights_type",
        "storageType": "TEXT NOT NULL DEFAULT 'original_work' CHECK (rights_type IN ('original_work', 'licensed', 'assignment', 'public_domain', 'fair_use'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "original_work",
        "options": [
          "original_work",
          "licensed",
          "assignment",
          "public_domain",
          "fair_use"
        ],
        "description": "Rights Type"
      },
      {
        "name": "license_type",
        "storageType": "TEXT NOT NULL DEFAULT 'exclusive' CHECK (license_type IN ('exclusive', 'non_exclusive', 'creative_commons', 'royalty_free', 'custom'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "exclusive",
        "options": [
          "exclusive",
          "non_exclusive",
          "creative_commons",
          "royalty_free",
          "custom"
        ],
        "description": "License Type"
      },
      {
        "name": "registration_number",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Registration Number"
      },
      {
        "name": "registration_date",
        "storageType": "DATE",
        "valueType": "date",
        "required": false,
        "description": "Registration Date"
      },
      {
        "name": "territory",
        "storageType": "TEXT NOT NULL DEFAULT 'global'",
        "valueType": "string",
        "required": true,
        "defaultValue": "global",
        "description": "Territory"
      },
      {
        "name": "usage_rights",
        "storageType": "JSONB NOT NULL DEFAULT '[]'::jsonb",
        "valueType": "json",
        "required": true,
        "description": "Usage Rights"
      },
      {
        "name": "expiry_date",
        "storageType": "DATE",
        "valueType": "date",
        "required": false,
        "description": "Expiry Date"
      },
      {
        "name": "status",
        "storageType": "TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'disputed', 'revoked'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "active",
        "options": [
          "active",
          "expired",
          "disputed",
          "revoked"
        ],
        "description": "Status"
      },
      {
        "name": "evidence_uri",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Evidence Uri"
      },
      {
        "name": "notes",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Notes"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  "Message": {
    "name": "Message",
    "group": "messaging",
    "description": "Conversation messages with participants, optional media, replies, and read-tracking.",
    "required": [
      "conversation_id",
      "participants"
    ],
    "defaults": {},
    "enums": {},
    "accessPolicy": {
      "read": "participants include authenticated user or admin",
      "create": "participants must include authenticated user",
      "update": "created_by_id owner only",
      "delete": "created_by_id owner only"
    },
    "translatedFrom": "Message.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "created_by_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Created By Id"
      },
      {
        "name": "conversation_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Conversation Id"
      },
      {
        "name": "participants",
        "storageType": "JSONB NOT NULL DEFAULT '[]'::jsonb",
        "valueType": "json",
        "required": true,
        "description": "Participants"
      },
      {
        "name": "content",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Content"
      },
      {
        "name": "media_uri",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Media Uri"
      },
      {
        "name": "parent_message_id",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Parent Message Id"
      },
      {
        "name": "read_by",
        "storageType": "JSONB NOT NULL DEFAULT '[]'::jsonb",
        "valueType": "json",
        "required": true,
        "description": "Read By"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  "MusicAnalysis": {
    "name": "MusicAnalysis",
    "group": "media",
    "description": "Analysis and fingerprint records for music assets.",
    "required": [
      "track_title",
      "bpm",
      "fingerprint"
    ],
    "defaults": {
      "bars_analyzed": 10,
      "confidence": 0,
      "stamp_status": "certified"
    },
    "enums": {
      "stamp_status": [
        "certified",
        "original",
        "flagged"
      ]
    },
    "accessPolicy": {
      "read": "public",
      "create": "created_by_id must match the authenticated user id",
      "update": "created_by_id owner only",
      "delete": "created_by_id owner only"
    },
    "translatedFrom": "MusicAnalysis.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "created_by_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Created By Id"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "media_asset_id",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Media Asset Id"
      },
      {
        "name": "track_title",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Track Title"
      },
      {
        "name": "bpm",
        "storageType": "DOUBLE PRECISION NOT NULL",
        "valueType": "number",
        "required": true,
        "description": "Bpm"
      },
      {
        "name": "key",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Key"
      },
      {
        "name": "energy",
        "storageType": "DOUBLE PRECISION",
        "valueType": "number",
        "required": false,
        "description": "Energy"
      },
      {
        "name": "dynamics",
        "storageType": "DOUBLE PRECISION",
        "valueType": "number",
        "required": false,
        "description": "Dynamics"
      },
      {
        "name": "spectral_centroid",
        "storageType": "DOUBLE PRECISION",
        "valueType": "number",
        "required": false,
        "description": "Spectral Centroid"
      },
      {
        "name": "bass_energy",
        "storageType": "DOUBLE PRECISION",
        "valueType": "number",
        "required": false,
        "description": "Bass Energy"
      },
      {
        "name": "mid_energy",
        "storageType": "DOUBLE PRECISION",
        "valueType": "number",
        "required": false,
        "description": "Mid Energy"
      },
      {
        "name": "treble_energy",
        "storageType": "DOUBLE PRECISION",
        "valueType": "number",
        "required": false,
        "description": "Treble Energy"
      },
      {
        "name": "fingerprint",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Fingerprint"
      },
      {
        "name": "bars_analyzed",
        "storageType": "DOUBLE PRECISION NOT NULL DEFAULT 10",
        "valueType": "number",
        "required": true,
        "defaultValue": 10,
        "description": "Bars Analyzed"
      },
      {
        "name": "confidence",
        "storageType": "DOUBLE PRECISION NOT NULL DEFAULT 0",
        "valueType": "number",
        "required": true,
        "defaultValue": 0,
        "description": "Confidence"
      },
      {
        "name": "stamp_status",
        "storageType": "TEXT NOT NULL DEFAULT 'certified' CHECK (stamp_status IN ('certified', 'original', 'flagged'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "certified",
        "options": [
          "certified",
          "original",
          "flagged"
        ],
        "description": "Stamp Status"
      },
      {
        "name": "stamp_id",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Stamp Id"
      },
      {
        "name": "assessment",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Assessment"
      },
      {
        "name": "character_tags",
        "storageType": "JSONB NOT NULL DEFAULT '[]'::jsonb",
        "valueType": "json",
        "required": true,
        "description": "Character Tags"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  "Notification": {
    "name": "Notification",
    "group": "messaging",
    "description": "User notifications for DMs, likes, comments, follows, system events, badges, and truth changes.",
    "required": [
      "recipient_id",
      "type",
      "message"
    ],
    "defaults": {
      "type": "system",
      "read": false
    },
    "enums": {
      "type": [
        "dm",
        "like",
        "comment",
        "follow",
        "system",
        "badge",
        "truth_score"
      ]
    },
    "accessPolicy": {
      "create": "admin only",
      "read": "recipient_id owner only",
      "update": "recipient_id owner only",
      "delete": "recipient_id owner only"
    },
    "translatedFrom": "Notification.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "recipient_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Recipient Id"
      },
      {
        "name": "type",
        "storageType": "TEXT NOT NULL DEFAULT 'system' CHECK (type IN ('dm', 'like', 'comment', 'follow', 'system', 'badge', 'truth_score'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "system",
        "options": [
          "dm",
          "like",
          "comment",
          "follow",
          "system",
          "badge",
          "truth_score"
        ],
        "description": "Type"
      },
      {
        "name": "message",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Message"
      },
      {
        "name": "link",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Link"
      },
      {
        "name": "read",
        "storageType": "BOOLEAN NOT NULL DEFAULT FALSE",
        "valueType": "boolean",
        "required": true,
        "defaultValue": false,
        "description": "Read"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  "PlannerEvent": {
    "name": "PlannerEvent",
    "group": "productivity",
    "description": "Personal planner events for sessions, meetings, deadlines, and streams.",
    "required": [
      "title",
      "event_date"
    ],
    "defaults": {
      "event_type": "session",
      "status": "scheduled"
    },
    "enums": {
      "event_type": [
        "session",
        "meeting",
        "deadline",
        "personal",
        "stream"
      ],
      "status": [
        "scheduled",
        "completed",
        "cancelled"
      ]
    },
    "accessPolicy": {
      "read": "created_by_id owner only",
      "create": "created_by_id must match the authenticated user id",
      "update": "created_by_id owner only",
      "delete": "created_by_id owner only"
    },
    "translatedFrom": "PlannerEvent.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "created_by_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Created By Id"
      },
      {
        "name": "title",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Title"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "event_date",
        "storageType": "DATE NOT NULL",
        "valueType": "date",
        "required": true,
        "description": "Event Date"
      },
      {
        "name": "event_time",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Event Time"
      },
      {
        "name": "event_type",
        "storageType": "TEXT NOT NULL DEFAULT 'session' CHECK (event_type IN ('session', 'meeting', 'deadline', 'personal', 'stream'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "session",
        "options": [
          "session",
          "meeting",
          "deadline",
          "personal",
          "stream"
        ],
        "description": "Event Type"
      },
      {
        "name": "location",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Location"
      },
      {
        "name": "status",
        "storageType": "TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "scheduled",
        "options": [
          "scheduled",
          "completed",
          "cancelled"
        ],
        "description": "Status"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  "Podcast": {
    "name": "Podcast",
    "group": "podcast",
    "description": "Podcast episodes with script, lineup, media, monetization, team, and production timeline metadata.",
    "required": [
      "title",
      "episode_number",
      "subject_matter"
    ],
    "defaults": {
      "script_status": "draft",
      "lineup_status": "pending",
      "status": "planning",
      "board_stage": "backlog",
      "is_premium": false,
      "view_count": 0
    },
    "enums": {
      "script_status": [
        "draft",
        "submitted",
        "approved"
      ],
      "lineup_status": [
        "pending",
        "approved",
        "rejected"
      ],
      "status": [
        "planning",
        "recording",
        "published",
        "archived"
      ],
      "board_stage": [
        "backlog",
        "recording",
        "editing",
        "review",
        "published"
      ]
    },
    "accessPolicy": {
      "read": "public when status = published, otherwise creator or admin",
      "create": "created_by_id must match the authenticated user id",
      "update": "created_by_id owner or admin",
      "delete": "created_by_id owner or admin"
    },
    "translatedFrom": "Podcast.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "created_by_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Created By Id"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "title",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Title"
      },
      {
        "name": "episode_number",
        "storageType": "DOUBLE PRECISION NOT NULL",
        "valueType": "number",
        "required": true,
        "description": "Episode Number"
      },
      {
        "name": "subject_matter",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Subject Matter"
      },
      {
        "name": "script",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Script"
      },
      {
        "name": "script_status",
        "storageType": "TEXT NOT NULL DEFAULT 'draft' CHECK (script_status IN ('draft', 'submitted', 'approved'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "draft",
        "options": [
          "draft",
          "submitted",
          "approved"
        ],
        "description": "Script Status"
      },
      {
        "name": "itinerary",
        "storageType": "JSONB NOT NULL DEFAULT '[]'::jsonb",
        "valueType": "json",
        "required": true,
        "description": "Itinerary"
      },
      {
        "name": "lineup_status",
        "storageType": "TEXT NOT NULL DEFAULT 'pending' CHECK (lineup_status IN ('pending', 'approved', 'rejected'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "pending",
        "options": [
          "pending",
          "approved",
          "rejected"
        ],
        "description": "Lineup Status"
      },
      {
        "name": "status",
        "storageType": "TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'recording', 'published', 'archived'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "planning",
        "options": [
          "planning",
          "recording",
          "published",
          "archived"
        ],
        "description": "Status"
      },
      {
        "name": "board_stage",
        "storageType": "TEXT NOT NULL DEFAULT 'backlog' CHECK (board_stage IN ('backlog', 'recording', 'editing', 'review', 'published'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "backlog",
        "options": [
          "backlog",
          "recording",
          "editing",
          "review",
          "published"
        ],
        "description": "Board Stage"
      },
      {
        "name": "is_premium",
        "storageType": "BOOLEAN NOT NULL DEFAULT FALSE",
        "valueType": "boolean",
        "required": true,
        "defaultValue": false,
        "description": "Is Premium"
      },
      {
        "name": "episode_media_uri",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Episode Media Uri"
      },
      {
        "name": "raw_media_uri",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Raw Media Uri"
      },
      {
        "name": "intro_uri",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Intro Uri"
      },
      {
        "name": "outro_uri",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Outro Uri"
      },
      {
        "name": "teaser_text",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Teaser Text"
      },
      {
        "name": "teaser_video_uri",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Teaser Video Uri"
      },
      {
        "name": "price_monthly",
        "storageType": "DOUBLE PRECISION",
        "valueType": "number",
        "required": false,
        "description": "Price Monthly"
      },
      {
        "name": "price_one_time",
        "storageType": "DOUBLE PRECISION",
        "valueType": "number",
        "required": false,
        "description": "Price One Time"
      },
      {
        "name": "ai_pricing",
        "storageType": "JSONB NOT NULL DEFAULT '{}'::jsonb",
        "valueType": "json",
        "required": true,
        "description": "Ai Pricing"
      },
      {
        "name": "team_ids",
        "storageType": "JSONB NOT NULL DEFAULT '[]'::jsonb",
        "valueType": "json",
        "required": true,
        "description": "Team Ids"
      },
      {
        "name": "production_timeline",
        "storageType": "JSONB NOT NULL DEFAULT '[]'::jsonb",
        "valueType": "json",
        "required": true,
        "description": "Production Timeline"
      },
      {
        "name": "view_count",
        "storageType": "DOUBLE PRECISION NOT NULL DEFAULT 0",
        "valueType": "number",
        "required": true,
        "defaultValue": 0,
        "description": "View Count"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  "PodcastPayment": {
    "name": "PodcastPayment",
    "group": "payments",
    "description": "Podcast-specific subscription and one-time payment records.",
    "required": [
      "podcast_id",
      "user_id",
      "payment_type",
      "amount"
    ],
    "defaults": {
      "status": "pending"
    },
    "enums": {
      "payment_type": [
        "subscription",
        "one_time"
      ],
      "status": [
        "pending",
        "completed",
        "active",
        "cancelled"
      ]
    },
    "accessPolicy": {
      "read": "user_id owner or admin",
      "create": "user_id must match the authenticated user id",
      "update": "admin only",
      "delete": "admin only"
    },
    "translatedFrom": "PodcastPayment.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "podcast_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Podcast Id"
      },
      {
        "name": "user_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "User Id"
      },
      {
        "name": "payment_type",
        "storageType": "TEXT NOT NULL CHECK (payment_type IN ('subscription', 'one_time'))",
        "valueType": "string",
        "required": true,
        "options": [
          "subscription",
          "one_time"
        ],
        "description": "Payment Type"
      },
      {
        "name": "amount",
        "storageType": "DOUBLE PRECISION NOT NULL",
        "valueType": "number",
        "required": true,
        "description": "Amount"
      },
      {
        "name": "status",
        "storageType": "TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'active', 'cancelled'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "pending",
        "options": [
          "pending",
          "completed",
          "active",
          "cancelled"
        ],
        "description": "Status"
      },
      {
        "name": "stripe_session_id",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Stripe Session Id"
      },
      {
        "name": "stripe_subscription_id",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Stripe Subscription Id"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  "Post": {
    "name": "Post",
    "group": "social",
    "description": "Core social posts with media, truth metadata, counters, and publication status.",
    "required": [
      "content",
      "post_type"
    ],
    "defaults": {
      "post_type": "text",
      "truth_score": 50,
      "truth_status": "unverified",
      "status": "published",
      "like_count": 0,
      "comment_count": 0,
      "share_count": 0,
      "repost_count": 0,
      "challenge_count": 0
    },
    "enums": {
      "post_type": [
        "text",
        "photo",
        "video",
        "music",
        "journalism",
        "karaoke"
      ],
      "truth_status": [
        "unverified",
        "verified",
        "flagged",
        "challenged"
      ],
      "status": [
        "published",
        "draft",
        "archived"
      ]
    },
    "accessPolicy": {
      "read": "public when status = published, otherwise creator or admin",
      "create": "created_by_id must match the authenticated user id",
      "update": "created_by_id owner or admin",
      "delete": "created_by_id owner or admin"
    },
    "translatedFrom": "Post.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "created_by_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Created By Id"
      },
      {
        "name": "content",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Content"
      },
      {
        "name": "media_uris",
        "storageType": "JSONB NOT NULL DEFAULT '[]'::jsonb",
        "valueType": "json",
        "required": true,
        "description": "Media Uris"
      },
      {
        "name": "hashtags",
        "storageType": "JSONB NOT NULL DEFAULT '[]'::jsonb",
        "valueType": "json",
        "required": true,
        "description": "Hashtags"
      },
      {
        "name": "partials",
        "storageType": "JSONB NOT NULL DEFAULT '[]'::jsonb",
        "valueType": "json",
        "required": true,
        "description": "Partials"
      },
      {
        "name": "post_type",
        "storageType": "TEXT NOT NULL DEFAULT 'text' CHECK (post_type IN ('text', 'photo', 'video', 'music', 'journalism', 'karaoke'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "text",
        "options": [
          "text",
          "photo",
          "video",
          "music",
          "journalism",
          "karaoke"
        ],
        "description": "Post Type"
      },
      {
        "name": "region",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Region"
      },
      {
        "name": "truth_score",
        "storageType": "DOUBLE PRECISION NOT NULL DEFAULT 50",
        "valueType": "number",
        "required": true,
        "defaultValue": 50,
        "description": "Truth Score"
      },
      {
        "name": "truth_status",
        "storageType": "TEXT NOT NULL DEFAULT 'unverified' CHECK (truth_status IN ('unverified', 'verified', 'flagged', 'challenged'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "unverified",
        "options": [
          "unverified",
          "verified",
          "flagged",
          "challenged"
        ],
        "description": "Truth Status"
      },
      {
        "name": "status",
        "storageType": "TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'draft', 'archived'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "published",
        "options": [
          "published",
          "draft",
          "archived"
        ],
        "description": "Status"
      },
      {
        "name": "like_count",
        "storageType": "DOUBLE PRECISION NOT NULL DEFAULT 0",
        "valueType": "number",
        "required": true,
        "defaultValue": 0,
        "description": "Like Count"
      },
      {
        "name": "comment_count",
        "storageType": "DOUBLE PRECISION NOT NULL DEFAULT 0",
        "valueType": "number",
        "required": true,
        "defaultValue": 0,
        "description": "Comment Count"
      },
      {
        "name": "share_count",
        "storageType": "DOUBLE PRECISION NOT NULL DEFAULT 0",
        "valueType": "number",
        "required": true,
        "defaultValue": 0,
        "description": "Share Count"
      },
      {
        "name": "repost_count",
        "storageType": "DOUBLE PRECISION NOT NULL DEFAULT 0",
        "valueType": "number",
        "required": true,
        "defaultValue": 0,
        "description": "Repost Count"
      },
      {
        "name": "challenge_count",
        "storageType": "DOUBLE PRECISION NOT NULL DEFAULT 0",
        "valueType": "number",
        "required": true,
        "defaultValue": 0,
        "description": "Challenge Count"
      },
      {
        "name": "external_source",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "External Source"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  "Scratchboard": {
    "name": "Scratchboard",
    "group": "productivity",
    "description": "Private user notes with tags and a board color.",
    "required": [
      "title"
    ],
    "defaults": {
      "color": "amethyst"
    },
    "enums": {
      "color": [
        "amethyst",
        "gold",
        "violet",
        "blue",
        "rose"
      ]
    },
    "accessPolicy": {
      "read": "created_by_id owner only",
      "create": "created_by_id must match the authenticated user id",
      "update": "created_by_id owner only",
      "delete": "created_by_id owner only"
    },
    "translatedFrom": "Scratchboard.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "created_by_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Created By Id"
      },
      {
        "name": "title",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Title"
      },
      {
        "name": "content",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Content"
      },
      {
        "name": "tags",
        "storageType": "JSONB NOT NULL DEFAULT '[]'::jsonb",
        "valueType": "json",
        "required": true,
        "description": "Tags"
      },
      {
        "name": "color",
        "storageType": "TEXT NOT NULL DEFAULT 'amethyst' CHECK (color IN ('amethyst', 'gold', 'violet', 'blue', 'rose'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "amethyst",
        "options": [
          "amethyst",
          "gold",
          "violet",
          "blue",
          "rose"
        ],
        "description": "Color"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  "SubscriptionPayment": {
    "name": "SubscriptionPayment",
    "group": "payments",
    "description": "General subscription payment records for WiseRavenShare product groups.",
    "required": [
      "user_id",
      "product_group",
      "price_id",
      "amount"
    ],
    "defaults": {
      "payment_type": "subscription",
      "status": "pending"
    },
    "enums": {
      "product_group": [
        "music_rights",
        "studio_plus",
        "growth_suite",
        "creator_pro"
      ],
      "payment_type": [
        "subscription"
      ],
      "interval": [
        "month",
        "year"
      ],
      "status": [
        "pending",
        "active",
        "cancelled"
      ]
    },
    "accessPolicy": {
      "read": "user_id owner or admin",
      "create": "user_id must match the authenticated user id",
      "update": "admin only",
      "delete": "admin only"
    },
    "translatedFrom": "SubscriptionPayment.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "user_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "User Id"
      },
      {
        "name": "product_group",
        "storageType": "TEXT NOT NULL CHECK (product_group IN ('music_rights', 'studio_plus', 'growth_suite', 'creator_pro'))",
        "valueType": "string",
        "required": true,
        "options": [
          "music_rights",
          "studio_plus",
          "growth_suite",
          "creator_pro"
        ],
        "description": "Product Group"
      },
      {
        "name": "tier",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Tier"
      },
      {
        "name": "price_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Price Id"
      },
      {
        "name": "payment_type",
        "storageType": "TEXT NOT NULL DEFAULT 'subscription' CHECK (payment_type IN ('subscription'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "subscription",
        "options": [
          "subscription"
        ],
        "description": "Payment Type"
      },
      {
        "name": "amount",
        "storageType": "DOUBLE PRECISION NOT NULL",
        "valueType": "number",
        "required": true,
        "description": "Amount"
      },
      {
        "name": "interval",
        "storageType": "TEXT CHECK (interval IN ('month', 'year'))",
        "valueType": "string",
        "required": false,
        "options": [
          "month",
          "year"
        ],
        "description": "Interval"
      },
      {
        "name": "status",
        "storageType": "TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'cancelled'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "pending",
        "options": [
          "pending",
          "active",
          "cancelled"
        ],
        "description": "Status"
      },
      {
        "name": "stripe_session_id",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Stripe Session Id"
      },
      {
        "name": "stripe_subscription_id",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Stripe Subscription Id"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  "Team": {
    "name": "Team",
    "group": "collaboration",
    "description": "Creator collaboration teams with membership, devices, roles, and responsibilities.",
    "required": [
      "team_name",
      "owner_id"
    ],
    "defaults": {},
    "enums": {},
    "accessPolicy": {
      "read": "owner or listed member",
      "create": "owner_id must match the authenticated user id",
      "update": "owner only",
      "delete": "owner only"
    },
    "translatedFrom": "Team.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "team_name",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Team Name"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "owner_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Owner Id"
      },
      {
        "name": "members",
        "storageType": "JSONB NOT NULL DEFAULT '[]'::jsonb",
        "valueType": "json",
        "required": true,
        "description": "Members"
      },
      {
        "name": "member_details",
        "storageType": "JSONB NOT NULL DEFAULT '[]'::jsonb",
        "valueType": "json",
        "required": true,
        "description": "Member Details"
      },
      {
        "name": "purpose",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Purpose"
      },
      {
        "name": "focus",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Focus"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  "TruthScore": {
    "name": "TruthScore",
    "group": "trust",
    "description": "Truth-scoring records for posts, comments, and journalism items.",
    "required": [
      "target_id",
      "target_type",
      "score"
    ],
    "defaults": {
      "score": 50,
      "confidence": 0
    },
    "enums": {
      "target_type": [
        "post",
        "comment",
        "journalism"
      ]
    },
    "accessPolicy": {
      "read": "public",
      "create": "admin only",
      "update": "admin only",
      "delete": "admin only"
    },
    "translatedFrom": "TruthScore.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "target_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Target Id"
      },
      {
        "name": "target_type",
        "storageType": "TEXT NOT NULL CHECK (target_type IN ('post', 'comment', 'journalism'))",
        "valueType": "string",
        "required": true,
        "options": [
          "post",
          "comment",
          "journalism"
        ],
        "description": "Target Type"
      },
      {
        "name": "score",
        "storageType": "DOUBLE PRECISION NOT NULL DEFAULT 50",
        "valueType": "number",
        "required": true,
        "defaultValue": 50,
        "description": "Score"
      },
      {
        "name": "confidence",
        "storageType": "DOUBLE PRECISION NOT NULL DEFAULT 0",
        "valueType": "number",
        "required": true,
        "defaultValue": 0,
        "description": "Confidence"
      },
      {
        "name": "factors",
        "storageType": "JSONB NOT NULL DEFAULT '[]'::jsonb",
        "valueType": "json",
        "required": true,
        "description": "Factors"
      },
      {
        "name": "ai_detection_flags",
        "storageType": "JSONB NOT NULL DEFAULT '[]'::jsonb",
        "valueType": "json",
        "required": true,
        "description": "Ai Detection Flags"
      },
      {
        "name": "notes",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Notes"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  "User": {
    "name": "User",
    "group": "identity",
    "description": "Minimal app-level user role and status projection used by WiseRavenShare.",
    "required": [
      "role"
    ],
    "defaults": {
      "status": "active"
    },
    "enums": {
      "role": [
        "admin",
        "user"
      ],
      "status": [
        "active",
        "suspended",
        "blocked"
      ]
    },
    "accessPolicy": {
      "note": "Managed by application auth and admin workflows."
    },
    "translatedFrom": "User.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "role",
        "storageType": "TEXT NOT NULL CHECK (role IN ('admin', 'user'))",
        "valueType": "string",
        "required": true,
        "options": [
          "admin",
          "user"
        ],
        "description": "Role"
      },
      {
        "name": "status",
        "storageType": "TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'blocked'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "active",
        "options": [
          "active",
          "suspended",
          "blocked"
        ],
        "description": "Status"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  "UserBadge": {
    "name": "UserBadge",
    "group": "reputation",
    "description": "Badge awards granted to users.",
    "required": [
      "user_id",
      "badge_id"
    ],
    "defaults": {},
    "enums": {},
    "accessPolicy": {
      "read": "public",
      "create": "admin only",
      "update": "admin only",
      "delete": "admin only"
    },
    "translatedFrom": "UserBadge.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "user_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "User Id"
      },
      {
        "name": "badge_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Badge Id"
      },
      {
        "name": "awarded_reason",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Awarded Reason"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  "UserProfile": {
    "name": "UserProfile",
    "group": "identity",
    "description": "Public-facing user profile and social connection metadata.",
    "required": [
      "display_name"
    ],
    "defaults": {
      "is_creator": true,
      "verified": false,
      "truth_reputation": 50,
      "follower_count": 0,
      "following_count": 0,
      "post_count": 0
    },
    "enums": {},
    "accessPolicy": {
      "read": "public",
      "create": "created_by_id must match the authenticated user id",
      "update": "created_by_id owner only",
      "delete": "created_by_id owner only"
    },
    "translatedFrom": "UserProfile.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "created_by_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Created By Id"
      },
      {
        "name": "display_name",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Display Name"
      },
      {
        "name": "bio",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Bio"
      },
      {
        "name": "avatar_uri",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Avatar Uri"
      },
      {
        "name": "cover_uri",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Cover Uri"
      },
      {
        "name": "location",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Location"
      },
      {
        "name": "website",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Website"
      },
      {
        "name": "is_creator",
        "storageType": "BOOLEAN NOT NULL DEFAULT TRUE",
        "valueType": "boolean",
        "required": true,
        "defaultValue": true,
        "description": "Is Creator"
      },
      {
        "name": "verified",
        "storageType": "BOOLEAN NOT NULL DEFAULT FALSE",
        "valueType": "boolean",
        "required": true,
        "defaultValue": false,
        "description": "Verified"
      },
      {
        "name": "truth_reputation",
        "storageType": "DOUBLE PRECISION NOT NULL DEFAULT 50",
        "valueType": "number",
        "required": true,
        "defaultValue": 50,
        "description": "Truth Reputation"
      },
      {
        "name": "follower_count",
        "storageType": "DOUBLE PRECISION NOT NULL DEFAULT 0",
        "valueType": "number",
        "required": true,
        "defaultValue": 0,
        "description": "Follower Count"
      },
      {
        "name": "following_count",
        "storageType": "DOUBLE PRECISION NOT NULL DEFAULT 0",
        "valueType": "number",
        "required": true,
        "defaultValue": 0,
        "description": "Following Count"
      },
      {
        "name": "post_count",
        "storageType": "DOUBLE PRECISION NOT NULL DEFAULT 0",
        "valueType": "number",
        "required": true,
        "defaultValue": 0,
        "description": "Post Count"
      },
      {
        "name": "social_connections",
        "storageType": "JSONB NOT NULL DEFAULT '[]'::jsonb",
        "valueType": "json",
        "required": true,
        "description": "Social Connections"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  "Vibe": {
    "name": "Vibe",
    "group": "community",
    "description": "User mood check-ins and short notes.",
    "required": [
      "mood"
    ],
    "defaults": {},
    "enums": {
      "mood": [
        "inspired",
        "fired_up",
        "chill",
        "curious",
        "loved",
        "tired",
        "creative",
        "reflective"
      ]
    },
    "accessPolicy": {
      "read": "public",
      "create": "created_by_id must match the authenticated user id",
      "update": "created_by_id owner only",
      "delete": "created_by_id owner only"
    },
    "translatedFrom": "Vibe.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "created_by_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "Created By Id"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "mood",
        "storageType": "TEXT NOT NULL CHECK (mood IN ('inspired', 'fired_up', 'chill', 'curious', 'loved', 'tired', 'creative', 'reflective'))",
        "valueType": "string",
        "required": true,
        "options": [
          "inspired",
          "fired_up",
          "chill",
          "curious",
          "loved",
          "tired",
          "creative",
          "reflective"
        ],
        "description": "Mood"
      },
      {
        "name": "note",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Note"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  },
  "WiseCoinTransaction": {
    "name": "WiseCoinTransaction",
    "group": "reputation",
    "description": "WiseCoin earning and spending ledger entries.",
    "required": [
      "user_id",
      "amount",
      "category"
    ],
    "defaults": {
      "category": "productivity",
      "balance_after": 0
    },
    "enums": {
      "category": [
        "productivity",
        "participation",
        "promotion",
        "value",
        "bonus",
        "spend"
      ]
    },
    "accessPolicy": {
      "read": "user_id owner or admin",
      "create": "admin only",
      "update": "admin only",
      "delete": "admin only"
    },
    "translatedFrom": "WiseCoinTransaction.jsonc",
    "fields": [
      {
        "name": "id",
        "storageType": "TEXT PRIMARY KEY",
        "valueType": "string",
        "required": false,
        "description": "Id"
      },
      {
        "name": "description",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Description"
      },
      {
        "name": "user_id",
        "storageType": "TEXT NOT NULL",
        "valueType": "string",
        "required": true,
        "description": "User Id"
      },
      {
        "name": "amount",
        "storageType": "DOUBLE PRECISION NOT NULL",
        "valueType": "number",
        "required": true,
        "description": "Amount"
      },
      {
        "name": "reason",
        "storageType": "TEXT",
        "valueType": "string",
        "required": false,
        "description": "Reason"
      },
      {
        "name": "category",
        "storageType": "TEXT NOT NULL DEFAULT 'productivity' CHECK (category IN ('productivity', 'participation', 'promotion', 'value', 'bonus', 'spend'))",
        "valueType": "string",
        "required": true,
        "defaultValue": "productivity",
        "options": [
          "productivity",
          "participation",
          "promotion",
          "value",
          "bonus",
          "spend"
        ],
        "description": "Category"
      },
      {
        "name": "balance_after",
        "storageType": "DOUBLE PRECISION NOT NULL DEFAULT 0",
        "valueType": "number",
        "required": true,
        "defaultValue": 0,
        "description": "Balance After"
      },
      {
        "name": "created_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Created Date"
      },
      {
        "name": "updated_date",
        "storageType": "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        "valueType": "datetime",
        "required": true,
        "description": "Updated Date"
      }
    ]
  }
};

const SYSTEM_MANAGED_ENTITY_FIELDS = new Set(["id", "created_date", "updated_date"]);

export function isSystemManagedEntityField(fieldName) {
  return SYSTEM_MANAGED_ENTITY_FIELDS.has(fieldName);
}

export function getEditableEntityFields(entity, options = {}) {
  const includeSystemFields = options.includeSystemFields === true;
  if (!entity?.fields) return [];
  return entity.fields.filter(
    (field) => includeSystemFields || !isSystemManagedEntityField(field.name)
  );
}

export function getDefaultEntityFieldValue(field) {
  if (field?.defaultValue !== undefined) {
    return field.defaultValue;
  }

  switch (field?.valueType) {
    case "boolean":
      return false;
    case "number":
      return "";
    case "json":
      return String(field?.storageType || "").includes("'{}'::jsonb") ? {} : [];
    case "date":
    case "datetime":
      return "";
    default:
      return "";
  }
}

export function createEntityDraft(entity, options = {}) {
  const includeSystemFields = options.includeSystemFields === true;
  return getEditableEntityFields(entity, { includeSystemFields }).reduce(
    (draft, field) => {
      draft[field.name] = getDefaultEntityFieldValue(field);
      return draft;
    },
    {}
  );
}

export function compactEntityDraft(entity, draft, options = {}) {
  const includeSystemFields = options.includeSystemFields === true;
  return getEditableEntityFields(entity, { includeSystemFields }).reduce(
    (payload, field) => {
      const value = draft?.[field.name];

      if (value === "" || value === null || value === undefined) {
        return payload;
      }

      if (Array.isArray(value) && value.length === 0) {
        return payload;
      }

      if (
        field.valueType === "json" &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        Object.keys(value).length === 0
      ) {
        return payload;
      }

      payload[field.name] = value;
      return payload;
    },
    {}
  );
}
