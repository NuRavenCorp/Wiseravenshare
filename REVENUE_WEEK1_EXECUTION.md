# Revenue Week 1 Execution Plan

## Objective
- Weekly target: $1,250 verified revenue
- Deadline: end of Week 1 in the 8-week path to $10,000/week
- Verification requirement: every dollar must be attached to evidence entries in the revenue API

## Funnel Instrumentation Map

### Existing events already in product
- `signup_completed` from server registration flow
- `login_success` from server login flow
- `profile_updated` from profile and social feed updates
- `first_post_created` from post composer
- `first_follow` from follow action
- `invite_sent` from referral invite creation

### Events added in this execution pass
- `checkout_started` in Stripe checkout session creation (server)
- `subscription_status_updated` on Stripe webhook subscription update (server)
- `subscription_activated` when Stripe status becomes `active` or `trialing` (server)
- `paywall_viewed` when user opens Ravensight subscribe tab (client)
- `checkout_redirected` after checkout URL is returned and before redirect (client)
- `subscription_checkout_success_landing` when return URL includes `?subscription=success` (client)
- `subscription_checkout_cancelled_landing` when return URL includes `?subscription=cancelled` (client)
- `checkout_fallback_enabled` when Stripe is unavailable and local fallback is used (client)
- `subscription_cancelled_local` for local test-mode cancellation path (client)

## Week 1 KPI Targets
- Paywall views: at least 200
- Checkout starts: at least 30
- Checkout redirects: at least 25
- Activated subscriptions: at least 5
- Verified Week 1 revenue evidence: at least $1,250

## Verification Endpoints
Use authenticated calls:
- `GET /api/growth/funnel?days=7`
- `GET /api/growth/revenue/summary`
- `GET /api/growth/revenue/actions?weekNumber=1&status=all`
- `GET /api/growth/revenue/evidence?weekNumber=1`
- `POST /api/growth/revenue/evidence`
- `POST /api/growth/revenue/evidence/{evidenceId}/verify` (admin)

## Evidence Entry Format
Submit one entry per charge batch or invoice set:
- `weekNumber`: 1
- `amountUsd`: exact gross or net amount tracked consistently
- `sourceType`: example values `stripe_invoice`, `stripe_dashboard_export`, `manual_bank_reconciliation`
- `sourceReference`: invoice id, payout id, export file id, or dashboard link id
- `notes`: optional context

## First 3 Actions This Week
1. Instrumentation validation (Owner: Engineering, Due: Day 1)
- Run end-to-end test for subscribe flow and confirm all new events appear in growth state.
- Success metric: event sequence visible for at least 3 internal test accounts.

2. Conversion offer test (Owner: Growth, Due: Day 3)
- Test monthly CTA copy against annual CTA copy in Ravensight subscribe panel.
- Success metric: +20% checkout_started to checkout_redirected ratio over baseline.

3. Revenue proof pipeline (Owner: Ops, Due: Day 5)
- Record all Week 1 monetary events through `POST /api/growth/revenue/evidence` and verify as admin.
- Success metric: >= $1,250 verified in `GET /api/growth/revenue/summary`.

## Experiment Backlog (Week 1)

### Experiment 1: CTA message framing
- Hypothesis: outcome-oriented CTA increases checkout starts.
- Change: replace generic button copy with value-specific copy tied to direct-upload benefit.
- Primary metric: `checkout_started / paywall_viewed`.
- Decision rule: keep variant if relative lift is at least 15% with at least 200 paywall views.

### Experiment 2: Annual plan prominence
- Hypothesis: clearer annual savings language increases annual mix and raises collected cash.
- Change: emphasize annual savings and renewal value near annual button.
- Primary metric: annual share of `checkout_redirected`.
- Decision rule: keep variant if annual share improves by at least 10 percentage points.

### Experiment 3: Friction reduction on return
- Hypothesis: explicit post-checkout feedback reduces confusion and support drop-off.
- Change: success/cancel landing notifications and follow-up nudges in Ravensight.
- Primary metric: `subscription_activated / subscription_checkout_success_landing`.
- Decision rule: keep if activation confirmation rate improves by at least 10%.

## Risks and Mitigations
- Stripe misconfiguration risk:
  - Mitigation: track `checkout_fallback_enabled`; treat fallback as non-revenue in evidence.
- Webhook delay risk:
  - Mitigation: separate `subscription_checkout_success_landing` from server-verified `subscription_activated`.
- Small sample sizes risk:
  - Mitigation: use directional decisions in Week 1 and rerun in Week 2 with higher volume.
