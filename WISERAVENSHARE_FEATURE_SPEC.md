# WiseRavenShare Feature Specification

Version: 2026-09-01  
Scope: Product-level feature, policy, and monetization specification for WiseRavenShare (Ravensight)

## 1. Platform Summary
WiseRavenShare is a creator-first social platform that combines publishing, media workflows, cross-platform distribution, collaboration, truth verification workflows, and a dual monetization model:
- fiat subscriptions (Stripe-backed plans), and
- internal WiseCoin (WSC) platform currency with ledger integrity controls.

Primary stack:
- Backend: ASP.NET Core APIs
- Frontend: React client
- Persistence: PostgreSQL-backed application data
- Media storage: Blob/object storage abstraction with retention controls

## 2. Product Rules

### 2.1 Access and account rules
- JWT-based authentication is required for protected APIs.
- Self-registration is disabled by default in production unless explicitly enabled.
- Allowlisted users and role/access claims control privileged access.
- Admin-only areas (growth/revenue/team access) are restricted by configured admin identity.
- Failed login behavior includes rate limiting and temporary lockout protections.

### 2.2 Content and publishing rules
- Users retain ownership of submitted content.
- Cross-publishing requires explicit user authorization for each connected platform.
- Platform integrations may reject unsupported media destinations by media type.
  - Current music sharing behavior: Facebook supported for publish flow, TikTok/YouTube rejected with explicit unsupported responses.

### 2.3 Collaboration and moderation rules
- Collaboration rooms are invite-scoped and role-aware.
- Moderation queue and resolution flows are available for trust and safety operations.
- Truth/verification functions are policy-governed and auditable.

### 2.4 Security baseline rules
- Fail-closed auth posture for production deployments.
- Password complexity and lockout requirements are enforced.
- Security headers, CORS controls, health checks, and startup readiness checks are part of the operational baseline.

## 3. Monetary Specifications

### 3.1 Subscription catalog (fiat)
Default public plan catalog (USD):
- Creator Pro
  - Monthly: $19
  - Annual: $190
- Growth Suite
  - Monthly: $39
  - Annual: $390
- Studio Plus
  - Monthly: $79
  - Annual: $790

Implementation notes:
- Stripe checkout is used with `mode=subscription`.
- Price IDs are environment/config driven (`STRIPE_PRICE_*` and `Stripe:Price*` keys).
- Success/cancel subscription return handling is instrumented in product growth events.

### 3.2 Revenue instrumentation and verification
Revenue execution model includes:
- Week-by-week KPI tracking (paywall views, checkout starts, redirects, activations).
- Evidence-first revenue accounting through growth endpoints.
- Admin verification workflow for evidence records.

Evidence record minimum fields:
- `weekNumber`
- `amountUsd`
- `sourceType`
- `sourceReference`
- optional `notes`

### 3.3 WiseCoin (WSC) economy
WSC is defined as a closed, work-hour-backed platform currency:
- Baseline minting reference: 10 WSC per work hour
- Baseline wage anchor: $15.00/hour reference
- Transaction fee: 0.5% burn
- Inflation cap target: 5%

Wallet structure:
- Balance (spendable)
- LockedBalance (staked)
- EscrowedBalance (pending)

Staking framework:
- Durations: 7 to 365 days
- Types: Flexible (x1.0), Locked (x1.5), Work-Backed (x2.0)
- Locked early-exit penalty: 30% of rewards

### 3.4 Ledger integrity guarantees
- WSC transactions are hash-chained using SHA-256 with previous-hash linkage.
- Daily integrity verification/anchoring jobs detect tampering attempts.
- Ledger verification endpoint exists for integrity checks.

## 4. Feature Inventory

### 4.1 Core social platform
- Feed creation and retrieval
- User timeline and trending retrieval
- Post interactions: like, repost, bookmark
- Profile/social settings management

### 4.2 Ravensight media suite
- Multi-tab creator workspace: record, feed, upload, library
- Video workflows, photo library, music library, and media retention behavior
- Podcast control room and newsroom capture handoff workflows
- Subscription-aware permanent storage behavior

### 4.3 Cross-platform integrations
- Social feed aggregation and publishing intent routing
- Platform-targeted publish operations with media-type checks
- Share and dispatch support for media content

### 4.4 Truth and journalism capabilities
- Truth claims and consensus-oriented workflows
- Truth/evolution module endpoints and plugin discovery
- Journalism dispatch and newsroom-related publishing experiences

### 4.5 Collaboration and real-time
- SignalR-powered eventing for notifications, messaging, and evolution updates
- Room-based collaboration, membership controls, and file transfer support

### 4.6 Growth and admin capabilities
- Growth event capture and funnel summaries
- Revenue console workflows (admin-scoped)
- Referral tracking and onboarding state support

### 4.7 New music sharing feature set
- Music upload + metadata handling
- Music library management UI (playback and track actions)
- Multi-platform share entry points and message/URL composition helpers
- Backend music media-type routing and DTO support

## 5. Provisions

### 5.1 Service provisions
- Health endpoints for general and database health must remain deploy-gate checks.
- Startup checks for schema/storage readiness are required in release workflows.
- Retention cleanup services are mandatory for managed media lifecycle enforcement.

### 5.2 Security provisions
- Production auth configuration must include explicit JWT key/issuer/audience and registration policy.
- Admin identity and access should derive from explicit configuration, not implicit defaults.
- Regression checks (including auth regression scripts) are required post-deploy.

### 5.3 Deployment provisions
- Docker/compose and cloud deployment manifests are supported deployment paths.
- Database additive migrations must run before app promotion when required by release notes.
- Rollback preference is app rollback with additive schema continuity unless database corruption is detected.

### 5.4 Observability provisions
- Response timing headers and slow-request logging should remain enabled.
- Growth/revenue telemetry must be captured for conversion and monetization experiments.
- Verification data for revenue claims must be retained in evidence workflows.

### 5.5 Governance provisions
- Feature changes that alter monetization, security posture, or retention rules require release-note documentation.
- Unsupported platform/media combinations should return explicit user-facing outcomes.
- New paid or gated capabilities must include measurable funnel instrumentation.

## 6. Canonical Source References
This specification consolidates implementation-aligned details from:
- `CURRENT_FEATURE_INDEX.md`
- `docs/PLATFORM.md`
- `REVENUE_WEEK1_EXECUTION.md`
- `SECURITY.md`
- `Wiseravenshare.Server/Controllers/PaymentsController.cs`
- `MUSIC_SHARING_IMPLEMENTATION.md`
