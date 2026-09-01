# WiseRavenShare QA Release Checklist

Version: 2026-09-01
Scope: Product regression, policy validation, monetization checks, and feature confidence

## 1. Authentication and Access
- [ ] Login succeeds for allowlisted user account.
- [ ] Login fails for invalid credentials with 401 behavior.
- [ ] Self-registration behavior matches environment policy.
- [ ] Protected endpoints reject unauthenticated requests.
- [ ] Admin-only areas are blocked for non-admin accounts.
- [ ] Team invite acceptance flow works end-to-end.

## 2. Core Social and Feed
- [ ] Create post succeeds with expected feed placement.
- [ ] Like/unlike, repost/unrepost, bookmark/unbookmark are consistent.
- [ ] User timeline loads and updates as expected.
- [ ] Trending retrieval endpoint returns stable results.
- [ ] Client cache behavior does not produce duplicate or stale interactions.

## 3. Ravensight Media Workflows
- [ ] Upload/save flow works for video, photo, and music entries.
- [ ] Library views show recently uploaded items.
- [ ] Playback controls function for supported media.
- [ ] Metadata persistence is correct after refresh.
- [ ] Storage mode and retention state are visible and consistent.

## 4. Music Sharing (New)
- [ ] Music upload accepts supported formats.
- [ ] Track appears in music library with title/artist metadata.
- [ ] Share action builds correct URL and message payload.
- [ ] Facebook music publish path returns success or actionable error.
- [ ] Unsupported music targets return explicit user-facing outcomes.
- [ ] Clipboard fallback or native share path works on target device/browser.

## 5. Cross-Platform Publishing
- [ ] Publish intent flags are mapped correctly per media type.
- [ ] Cross-platform status responses are handled without UI breakage.
- [ ] External errors are surfaced cleanly to user notifications.

## 6. Subscription and Revenue Flows
- [ ] Public payment config endpoint reports configuration state correctly.
- [ ] Plan catalog returns expected plan set and default USD amounts.
- [ ] Checkout session can be created with selected plan/cycle.
- [ ] Success and cancel return flows produce expected UI state.
- [ ] Growth funnel events appear for paywall, checkout, and activation sequences.

## 7. WiseCoin and Ledger
- [ ] Wallet retrieval returns balance, locked, and escrow values.
- [ ] Spend and transfer reject invalid amounts and self-transfer.
- [ ] Transaction fee burn behavior is reflected in resulting balances.
- [ ] Staking and unstaking apply expected duration/type rules.
- [ ] Ledger verification endpoint reports consistent chain integrity.

## 8. Truth, Moderation, and Journalism
- [ ] Truth-related submission and feed display paths remain functional.
- [ ] Moderation report submission and queue listing operate correctly.
- [ ] Journalism dispatch workflow posts and displays correctly.

## 9. Real-Time and Collaboration
- [ ] SignalR connections authenticate and receive events.
- [ ] Collaboration room create/join behavior is role-consistent.
- [ ] Room messages/file transfer do not regress core flows.

## 10. Security and Reliability
- [ ] Security headers and CORS policy match environment expectations.
- [ ] Health endpoints pass for app and database checks.
- [ ] Request timeout behavior does not break normal user workflows.
- [ ] Slow-request or error telemetry appears for induced failure cases.

## 11. Performance and UX Baseline
- [ ] Primary pages load without fatal console/network errors.
- [ ] Feed and Ravensight interactions remain responsive under typical load.
- [ ] Mobile layout is functional for top workflows.

## 12. Release Sign-Off
- [ ] No blocker or critical defects remain open.
- [ ] Release notes updated for functional, security, or monetization-impacting changes.
- [ ] Product, Engineering, and QA sign-off recorded.
