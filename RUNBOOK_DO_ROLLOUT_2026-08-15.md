# DigitalOcean Rollout Runbook (Post-Push)

Date: 2026-08-15  
Repo: NuRavenCorp/Wiseravenshare  
Branch: main  
Commit: 6879704

## 1) Objective
Deploy the auth hardening and journalism truth-dispatch persistence changes to DigitalOcean with controlled verification and rollback checkpoints.

## 2) Preconditions
- You can access DigitalOcean App Platform and Managed PostgreSQL.
- `DATABASE_URL` points to the production database target.
- App env vars are configured from `digitalocean-app-env.txt` (including Spaces and DB variables).
- `App__PublicBaseUrl` is set to the production public URL (for invite link generation).

## 3) Pre-Deploy Safety Checks
1. Confirm Git revision:

```powershell
git rev-parse --short HEAD
```

Expected: `6879704`

2. Confirm DB target and health endpoint baseline:

```powershell
Invoke-WebRequest -UseBasicParsing https://wise-ravens.com/health/db | Select-Object -ExpandProperty Content
```

3. (Recommended) backup/snapshot the Managed PostgreSQL instance in DigitalOcean before schema changes.

## 4) Apply Database Upgrade (Required Before App Promotion)
Run from repository root:

```powershell
psql "$env:DATABASE_URL" -f ./scripts/20260815_truth_dispatch_upgrade.sql
```

This applies:
- `Posts.IsTruthDispatch`
- `Posts.TruthDeclarationAccepted`
- `idx_posts_is_truth_dispatch_created_at`
- `idx_posts_location_name_created_at`

## 5) Repair/Drift Check (Optional but Recommended)
If any schema drift has been observed historically, run:

```powershell
pwsh -File ./scripts/repair-do-schema.ps1 `
  -TargetConnectionString $env:DATABASE_URL `
  -ExpectedDatabaseName wiseravenshare-db `
  -BucketName allbuckets1786108292029 `
  -ProjectFolder wiseravenshare/
```

## 6) Deploy Application
Use your existing App Platform pipeline for main.

If deployment is manual, trigger your standard backend/web deploy process tied to current `main`.

## 7) Post-Deploy Verification (Must Pass)
1. Health checks:

```powershell
Invoke-WebRequest -UseBasicParsing https://wise-ravens.com/health | Select-Object -ExpandProperty Content
Invoke-WebRequest -UseBasicParsing https://wise-ravens.com/health/db | Select-Object -ExpandProperty Content
```

2. Auth regression script:

```powershell
pwsh -File ./scripts/auth-regression-check.ps1 -BaseUrl https://wise-ravens.com
```

3. Invite flow smoke:
- Create team invite from admin account.
- Confirm invite email dispatch result is `sent` or expected SMTP fallback behavior.
- Confirm invite link host is production host from `App__PublicBaseUrl`.

4. Journalism flow smoke:
- Publish one local and one national dispatch from Amateur Journalist page.
- Confirm post payload behavior includes truth dispatch flags.
- Confirm created posts surface in feed correctly.

5. Spaces path smoke:
- Confirm upload object keys land under expected prefixes:
  - `wiseravenshare/ravensight/video/`
  - `wiseravenshare/ravensight/photo/`
  - `wiseravenshare/ravensight/music/`
  - `wiseravenshare/journalist_dispatches/`

## 8) Security Assertions
- Self-registration policy behaves as configured.
- Admin identity is only derived from explicit `Admin:Emails` configuration.
- No hardcoded seeded password remains in appsettings.
- Invite links are generated from configured public base URL (not request host).

## 9) Rollback Plan
1. If app behavior fails but DB migration succeeded:
- Roll back app deployment to prior known-good release.
- Keep schema columns in place (safe additive change).

2. If DB target mistake is detected:
- Stop deployment promotion.
- Restore DB from DigitalOcean snapshot/backup.
- Re-run deploy against correct DB target.

3. If invite mail fails only:
- Keep deployment active if core auth works.
- Correct SMTP env vars and redeploy configuration only.

## 10) Completion Criteria
Rollout is complete when all conditions below are true:
- Health endpoints pass.
- Auth regression script passes.
- Invite issue/accept cycle passes with valid link origin.
- Journalism publish and regional feed behavior verified.
- Spaces object-prefix usage confirmed.
