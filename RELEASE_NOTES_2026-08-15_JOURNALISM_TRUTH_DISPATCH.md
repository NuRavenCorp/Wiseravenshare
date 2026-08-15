# Release Notes: Journalism Truth Dispatch Upgrade

Date: 2026-08-15

## Summary
This upgrade finalizes persistence for the Amateur Journalist dispatch workflow by adding truth-dispatch fields to posts, wiring those fields through API DTO/service mapping, and providing both EF migration and SQL-first deployment paths for DigitalOcean PostgreSQL.

## Included Changes
- Backend post entity now persists:
  - `IsTruthDispatch` (boolean)
  - `TruthDeclarationAccepted` (boolean)
- Post API contract updated:
  - `PostDto` includes `truthDispatch` and `truthDeclarationAccepted`
  - `CreatePostDto` accepts `truthDispatch` and `truthDeclarationAccepted`
  - `UpdatePostDto` now supports optional `truthDispatch` and `truthDeclarationAccepted`
- Post service mapping updated for create/update/read round-trip.

## Database and Migration Artifacts
- EF migration generated:
  - `20260815145614_AddTruthDispatchFlagsToPosts`
  - Files:
    - `Wiseravenshare.Server/Infrastructure/Data/Migrations/20260815145614_AddTruthDispatchFlagsToPosts.cs`
    - `Wiseravenshare.Server/Infrastructure/Data/Migrations/20260815145614_AddTruthDispatchFlagsToPosts.Designer.cs`
- SQL upgrade script for DigitalOcean:
  - `scripts/20260815_truth_dispatch_upgrade.sql`
  - Adds both columns with `NOT NULL DEFAULT false`
  - Adds supporting indexes:
    - `idx_posts_is_truth_dispatch_created_at`
    - `idx_posts_location_name_created_at`
- Canonical schema snapshot updated:
  - `Wiseravenshare_complete_db_schema_do_buckets.sql`

## Spaces Schema Details
Required object-key prefixes for this feature set:
- `wiseravenshare/ravensight/video/`
- `wiseravenshare/ravensight/photo/`
- `wiseravenshare/ravensight/music/`
- `wiseravenshare/journalist_dispatches/`

These are key prefixes only; no physical folder provisioning is required in Spaces.

## Frontend Payload Verification
Verified in the journalist publish flow that the API payload includes:
- `truthDispatch: true`
- `truthDeclarationAccepted: true`

The payload is sent via `apiService.createPost(...)` and maps correctly to the backend DTO JSON property names.

## Deployment Order (DigitalOcean)
1. Apply DB upgrade first (recommended SQL path):
   - `psql "$env:DATABASE_URL" -f ./scripts/20260815_truth_dispatch_upgrade.sql`
2. Deploy backend/frontend code.
3. Run smoke checks:
   - Publish one local dispatch and one national dispatch.
   - Confirm created post records have expected truth-dispatch flags.
   - Confirm media objects appear under `wiseravenshare/journalist_dispatches/`.

## Validation
- `dotnet build` for `Wiseravenshare.Server` succeeded after changes.
- No new compile errors introduced by this upgrade.
