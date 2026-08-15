# Wiseravenshare Current Feature Index

Date: 2026-08-15  
Prepared for: hard-copy review

## 1) Platform Overview
- Full-stack social and creator platform with:
- ASP.NET Core backend APIs
- React frontend application
- PostgreSQL-backed persistence with fallback behavior where configured
- Ravensight media workspace for recording, upload, library, and publishing workflows

## 2) Authentication and Access Control
- User registration, login, refresh token flow, token verification
- Password policy enforcement and login lockout protections
- Admin-only mode support when self-registration is disabled
- Team/invite-aware access gating for approved logins
- JWT-based authorization with role/access claims
- Admin pass token model for elevated all-access behavior

## 3) Team Invite and Prearranged Access
- Team invite token issuance and token consumption model
- Prearranged team token flow
- Role assignment in team access workflows (owner/member/admin-style mappings)
- Invite link generation for onboarding flows
- Invite email dispatch pipeline wired to SMTP-capable email service

## 4) Profile and User Social Settings
- Profile update endpoints and user identity mapping
- User social feed settings read/update endpoints
- Social graph support (follow/unfollow patterns in app workflows)

## 5) Core Social Feed Features
- Post creation and feed retrieval flows
- User timeline retrieval
- Trending post retrieval
- Post interactions:
- Like/unlike
- Repost/unrepost
- Bookmark/unbookmark
- Client-side local caching for feed continuity and optimistic interactions

## 6) Video Features (General)
- Video upload and metadata update
- Video retrieval by ID
- User video listing
- Public/anonymous video feed endpoint
- Video interactions:
- Like/unlike
- Share
- Role-scoped analytics endpoint for video metrics

## 7) Ravensight Creator Workspace
- Multi-tab creator workspace including:
- Record
- Feed
- Upload
- Library
- Podcast Control Room tab integration
- Subscription-gated feature unlocking by plan tier
- Plan/tier model for Creator Pro, Growth Suite, Studio Plus
- Channel rollout model and publishing capability presentation
- Direct upload/save-to-library workflows
- Storage mode and retention status behavior for media assets

## 8) Newsroom and Podcast Studio Workflow
- Newsroom-side recorder flow for social/newscaster capture
- Handoff bridge from newsroom recording context into podcast control room context
- Podcast control room embedded under Ravensight
- Team-role-aware controls and collaboration state
- Heartbeat/policy refresh pattern in studio control state syncing

## 9) Billing, Subscription, and Admin All-Access
- Subscription status endpoint and sync behavior
- Subscription-aware access checks in Ravensight flows
- Admin all-access bypass behavior for eligible admin accounts
- Admin pass token propagation to API clients via request headers
- Frontend and backend integration for admin all-access state handling

## 10) Social Platform Integrations
- Social feed aggregation endpoints:
- Facebook feed
- TikTok feed
- Combined feed timeline
- Social publishing endpoint with multi-platform intent flags

## 11) Growth and Moderation Features
- Growth event tracking APIs
- Onboarding state retrieval
- Referral invite creation and referral stats retrieval
- Funnel summary endpoint (admin-scoped)
- Moderation check endpoint
- Moderation report submission, queue listing, and resolution flow
- Revenue agent initialization and related growth-planning primitives

## 12) Truth and Evolution Capabilities
- Evolution modules/updates endpoints
- Module detail and latest-version lookup
- Plugin discovery endpoint
- Evolution metrics/history endpoints
- Truth/evolution admin-moderator management flows (agent lifecycle controls)

## 13) Notifications and Reminder Infrastructure
- Reminder dispatch service with:
- SMTP email support
- Twilio SMS support
- Notification channel selection per reminder request
- Success/failure reporting per channel

## 14) Real-Time and Collaboration
- SignalR hubs configured for:
- Evolution events
- Notifications
- Messaging
- Token support for hub connections
- Real-time integration points in frontend services

## 15) Persistence, Storage, and Retention
- PostgreSQL data layer with EF and repository/services model
- Media storage abstraction supporting blob/object storage flow
- Bucket object registry and storage metadata patterns
- Ravensight media catalog tracking
- Retention cleanup hosted service for expiring assets
- Degraded/fallback responses when persistence layers are unavailable

## 16) Security and Operational Controls
- CORS policy with environment-aware origin handling
- Request timeout policy
- Security response headers
- Health endpoints:
- General health
- Database/expected-table checks
- Startup checks for schema and storage registry readiness

## 17) Performance and Response-Time Optimizations (Current)
- Response compression enabled (Brotli + gzip)
- Output caching enabled with targeted policies:
- Market quote endpoints
- Evolution catalog endpoints
- Public short-feed endpoints (selected social/video/user timeline reads)
- Hybrid cache pattern on market data:
- In-memory cache
- Distributed cache abstraction (Redis-ready, disabled by default)
- Static asset cache-control tuning for non-HTML assets
- Runtime response-time headers:
- Server-Timing
- X-Response-Time-Ms
- Slow-request logging threshold instrumentation

## 18) Deployment and Environment Assets
- Docker and compose configurations
- Cloud build specs for API/web
- Render and DigitalOcean deployment artifacts
- Security and deployment documentation present in repository root

## 19) Current Packaging for Review
- This file is optimized for markdown/Word import and print.
- A plain-text version is also provided for Notepad print workflows.
