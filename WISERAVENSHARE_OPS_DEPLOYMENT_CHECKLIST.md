# WiseRavenShare Ops Deployment Checklist

Version: 2026-09-01
Scope: Production readiness, deployment controls, and post-release verification

## 1. Pre-Deploy Readiness
- [ ] Target branch/commit is approved for release.
- [ ] Deployment window and rollback owner are assigned.
- [ ] Required environment variables are present and validated.
- [ ] Stripe keys and plan price IDs are configured for target environment.
- [ ] Database target is verified as intended production instance.
- [ ] Backup/snapshot is taken before schema-changing releases.

## 2. Security Baseline Validation
- [ ] JWT key, issuer, and audience are configured.
- [ ] Self-registration policy matches production intent.
- [ ] Admin identity configuration is explicit and verified.
- [ ] No hardcoded secrets exist in deploy artifacts.
- [ ] Auth regression checks are queued for post-deploy.

## 3. Database and Schema
- [ ] Required migrations/scripts for this release are identified.
- [ ] Additive schema updates are applied before app promotion when required.
- [ ] Schema drift/repair checks are run if historical drift risk exists.
- [ ] Core tables for auth, media, subscriptions, and growth telemetry are reachable.

## 4. Application Deploy
- [ ] API and web services build successfully.
- [ ] Container image or build artifact digest is recorded.
- [ ] Deployment manifest values are environment-correct.
- [ ] Health probe routes are configured and reachable.

## 5. Post-Deploy Smoke Validation
- [ ] App health endpoint passes.
- [ ] Database health endpoint passes.
- [ ] Authentication smoke test passes.
- [ ] Feed create/read interactions pass.
- [ ] Ravensight media upload and retrieval pass.
- [ ] Music sharing flow smoke test passes.
- [ ] Subscription checkout creation passes.

## 6. Monetization and Growth Telemetry
- [ ] Funnel events are emitted for paywall and checkout sequence.
- [ ] Subscription activation state sync is functioning.
- [ ] Revenue evidence endpoint accepts records.
- [ ] Admin verification of evidence works.

## 7. Storage and Retention Controls
- [ ] Media object paths follow expected prefix structure.
- [ ] Retention cleanup service is running.
- [ ] Permanent storage behavior remains subscription-gated.
- [ ] Storage access credentials and bucket policy are healthy.

## 8. Observability and Incident Readiness
- [ ] Response-time and slow-request telemetry are visible.
- [ ] Error logging pipeline is receiving structured server errors.
- [ ] Alert routing (if configured) is active.
- [ ] On-call owner is aware of release watch period.

## 9. Rollback Plan
- [ ] Previous known-good app version is identified.
- [ ] Rollback trigger criteria are documented.
- [ ] Rollback execution commands/process are validated.
- [ ] Data-impact assessment for rollback is complete.

## 10. Completion Criteria
- [ ] No Sev-1/Sev-2 production incidents in release watch window.
- [ ] Core user journeys remain healthy.
- [ ] Security and monetization checks pass.
- [ ] Deployment closure note is published.

## 11. Reference Docs
- RUNBOOK_DO_ROLLOUT_2026-08-15.md
- SECURITY.md
- CURRENT_FEATURE_INDEX.md
- WISERAVENSHARE_FEATURE_SPEC.md
