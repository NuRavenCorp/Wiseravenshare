# NuRavenCorpLLM Context Memory

## Platform Integration
- WiseravenShare social integrations run through `wiseravenshare.server` plugin architecture.
- Primary contract: `POST /webhook/post` `{platform, action, data}` and `POST /webhook/<platform>/events` for inbound webhooks.
- Supported platforms: facebook, instagram, tiktok, youtube, linkedin, reddit.
- Prefer capability-aware behavior using `GET /capabilities` and platform readiness checks via `GET /platforms`.
- For long-running media operations, expect queued async flow and job IDs rather than blocking inline responses.

## Architecture (as of 2026-10-22)

### Auth
- JWT auth via `Authentication__Jwt__Key` (WRS_prod_jwt_*). `Authentication__Jwt__ExpiresMinutes = 1440`.
- Google, Microsoft, Facebook, TikTok, YouTube, Instagram OAuth providers active.
- Admin email list: `admin@wiseravenshare.com`, `gaius@wiseravenshare.com`, `arnoldspence@wiseravenshare.com`.
- Admin logins bypass ALL paywalls: `PostsFeed`, `PodcastsPanel`, `KaraokePaywall`, `SubscriptionPlans`.
  - `apiClient.auth.me()` now enriches user with `isAdmin`, `adminPassActive`, `accessScope`.
  - Server `BillingController.GetSubscription` returns `status: "admin_all_access"` for admins.

### Feed / Timeline
- `PostRepository.GetFeedAsync`: **primary** = own posts + followed users; **partial** = authors of liked posts (max 10 authors, max 2 posts each); **blocked** = both-direction block filter at DB query level.
- **Critical 2026-10-22 fixes**:
  - `MapToPostDtosAsync` was issuing `GetInteractionStateAsync` per post (6 DB queries + `SaveChangesAsync` each). Replaced with `GetBatchInteractionStatesAsync` (3 read-only queries for entire page).
  - `CreatePostAsync` no longer silently returns a fake 201 when DB fails — errors propagate visibly.
  - `GetTrendingPostsAsync` now always prepends posts from last 24 h (so new zero-engagement posts appear).
  - Reposts (`RepostPostAsync`) now create a real `Post` entity with `RepostOfId` set — they appear in the feed.
  - `UnrepostPostAsync` soft-deletes the repost Post entity.
  - `BuildPostDto` now populates `RepostOf` (one level deep).
  - `PostsFeed.jsx` falls back to trending when the following feed returns 0 posts.
  - `PostCard.jsx` renders the embedded original-post content for repost cards.
- User block: `UserBlock` entity in `app_data.UserBlocks`. Endpoints: `POST/DELETE /api/users/{id}/block`, `GET /api/users/me/blocks`.

### Post Feed Ranker (python-matrix)
- New: `feed_ranker.py` in `wiseravenshare.Server/python-matrix/`.
- Endpoint: `GET /post/feed/ranked?viewer_id=&page_size=&window_days=`
- Returns post IDs + scores (not full DTOs); .NET layer fetches full posts by ID.
- 5-trigger candidate gather:
  - A: own + followed (standard retrieval)
  - B: comment velocity surge ≥2 in 48 h (Reddit: comment recency > aggregate engagement)
  - C: like velocity surge ≥5 in 48 h (separated, lower signal than B)
  - D: HashVec cosine similarity ≥0.55 to viewer interest profile (LinkedIn LLM-semantic approach)
  - E: posts with comment/view ratio ≥0.45 for similar users (X completion-rate pre-retrieval)
- 4-prediction multi-task layer (Meta 4-category design):
  - `will_like`, `will_spend_time`, `will_find_meaningful`, `will_spark_discussion`
- Acquaintance score: explicit aggregation via `compute_acquaintance_score()` with 4 weighted signals (fixes the silent-zero bug in earlier spec).
- Author debiasing (Instagram): `incremental = will_find_meaningful - 0.4 * author_baseline_engagement`.
- Diversity composition (Pinterest): max 2 consecutive posts from same topic cluster; 1 resurfaced per 4 new.

### Live Stream Ranker (python-matrix)
- `live_ranker.py`: personalized scoring for live streams. Weights: viewer history, category affinity, freshness.
- `GET /live/feed?viewer_id=&limit=`: returns scored live stream list.
- NuRavenCorpLLM scorer: called at `NURAVEN_CORP_LLM_SCORER_URL` with `{features: {…}}`, returns `{score: float}`.
- Impressions logged to `live_rank_impressions` table. Training data at `GET /live/training-data`.

### Wise-tracks (Music Player)
- Route `music-player` → `MusicPlayerPage` (no admin gate).
- 30-song free-tier cap enforced both client-side and server-side (`RavensightMusicMediaController.SaveMusic`).
- Music always stored in user-scoped folder `users/{identity}/media/music`.
- Creator plan for unlimited storage: scaffolded, not yet wired to billing.

### My Library Upload
- `api.js uploadMusicTrack/uploadMedia`: sends `File` field (capital F) only — no duplicate lowercase field.
- `handleUpload` in `MyLibraryPage`: optimistic UI update immediately after upload; server reload on `libraryVersion` increment.
- `useEffect` deps: `[user?.id, libraryVersion]` — `addToast` removed to prevent reload loops.
- `RavensightMusicMediaController.SaveMusic`: file fallback via `Request.Form.Files`, try/catch around count check.

### Karaoke
- Async job pipeline: `POST /generate-backing/jobs` → `jobId`; client polls `GET /api/karaoke/jobs/{id}`; downloads from `GET /api/karaoke/jobs/{id}/instrumental`.
- Per-user persistent workspace: `data/karaoke/users/{id}/uploads|stems|tracks|catalogue|tmp`.
- Premium catalogue songs unlockable per-user (persistent purchases).
- Container: gunicorn + uvicorn workers, 900s timeout.
- **Karaoke paywall**: admin users bypass it (no KaraokePayment lookup needed).
- **Direct local transcription**: `POST /api/functions/transcribe-local-file` (compat route). Falls back to `/api/assistant/audio/transcribe`.

### Player Error Handling
- FMRadioPage (`onloaderror`): auto-advances to next queued track; clears `currentTrack` if queue exhausted.
- FMRadioPage (`handleUpload`): auto-loads new file if no current track OR `loadError` is set.
- MusicPlayerPage (`onError`): clears ephemeral/blob tracks from library on final failure.
- MyLibraryPage audio: `onError` sets `isPlaying = false`.
- FM playback: HTTPS streams play direct; HTTP streams proxy through server; HLS allowlist uses HLS proxy.

### Podcast / Music Rights
- Podcast Studio checkout unified with Ravensight plan navigation.
- Music Rights plans wired to Stripe (Basic/Standard/Pro). Server-side price→plan-key resolution in `SubscriptionService`.
- Subscription auto-release: `rights_basic/standard/pro` feature maps in `SubscriptionService.ReleaseFeaturesByTierAsync`.
- **Podcast paywall**: admin users bypass it (no PodcastPayment lookup in `PodcastsPanel.hasAccess`).

### Stripe Pricing (as of 2026-10-22)
| Plan | planId | Monthly | Annual |
|------|--------|---------|--------|
| IP Protection Basic | rights_basic | $5 | $50 |
| IP Protection Standard | rights_standard | $15 | $150 |
| IP Protection Pro | rights_pro | $30 | $300 |
| Creator Pro | creator_pro | $19 | $190 |
| WRS Growth Suite | growth_suite | $49 | $490 |
| WRS Studio Plus | studio_plus | $99 | $990 |
| WRS Podcast Pro | podcast_pro | $149 | $1,490 |
- Dev price IDs: `creator_pro` monthly `price_1UCjZxK4zW843WGuHDqLTVXu`, growth_suite/studio_plus also configured.
- Missing: rights_basic/standard/pro, podcast_pro Stripe IDs (env: `STRIPE_PRICE_MUSIC_STUDIO_RIGHTS_*`).
- Health endpoint: `GET /api/payments/health`.

### Dropbox Cloud Media
- Inclusion via `POST /api/functions/cloud-media-transfer` with `{action:"include", provider:"dropbox", sharedUrl:…}`.
- Full browse/import requires `Dropbox:AccessToken` or `DROPBOX_ACCESS_TOKEN` env var.
- Shared-link inclusion works without token.
- SavedMedia persistence: `GET /api/SavedMedia/library`, `POST /api/SavedMedia/save`.

### Streaming
- Video: HTTP range-request via `VideoStreamingController` → DO Spaces CDN.
- Radio: HTTP audio proxy (`/api/fmtuner/stream-proxy`) for CORS bypass; `useRadioStream.js` has real Web Audio analyser + exponential-backoff reconnect.
- Icecast: configured but disabled (`Enabled=false`) — Creator Radio "Go Live" is activation-pending.
- HLS segmentation: **planned** — `services/video-processor/` service being added. Non-destructive; existing URLs remain as fallback.
- Python services (audio-processor:8001, karaoke-engine:8002, karaoke-speech:8003) deployed via Docker Compose; DO App Platform base URLs left blank pending activation.

### Deployment
- DO App Platform: `api` (ASP.NET Core) + `web` (static React) + `llm-api` (NuRavenCorpLLM, added 2026-09-30).
- DB: Managed Postgres 16 cluster `wiseravenshare-db` / `defaultdb`.
- Blob: DO Spaces `bucket-wrs-01010` / CDN at `DO_CDN_PUBLIC_BASE_URL`.

### Key Environment Variables
```
# Auth
Authentication__Jwt__Key
DROPBOX_ACCESS_TOKEN / Dropbox:AccessToken

# Stripe
STRIPE_PUBLISHABLE_KEY / Stripe:PublishableKey
STRIPE_SECRET_KEY / Stripe:SecretKey
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_CREATOR_PRO_MONTHLY_ID   price_1UCjZxK4zW843WGuHDqLTVXu
STRIPE_PRICE_CREATOR_PRO_ANNUAL_ID    price_1UCjaaK4zW843WGu8TV353Nc
STRIPE_PRICE_GROWTHSUITE_MONTHLY_ID   price_1UCjXjK4zW843WGui7qNCPPC
STRIPE_PRICE_GROWTHSUITE_ANNUAL_ID    price_1UCjXEK4zW843WGuVAfHpHuK
STRIPE_PRICE_STUDIOPLUS_MONTHLY_ID    price_1UCjVuK4zW843WGuq7fhuyjh
STRIPE_PRICE_STUDIOPLUS_ANNUAL_ID     price_1UCjV2K4zW843WGuLyklflF8
STRIPE_PRICE_MUSIC_STUDIO_RIGHTS_BASIC_MONTHLY_ID  (not configured)
STRIPE_PRICE_MUSIC_STUDIO_RIGHTS_BASIC_ANNUAL_ID   (not configured)
STRIPE_PRICE_MUSIC_STUDIO_RIGHTS_STANDARD_MONTHLY_ID (not configured)
STRIPE_PRICE_MUSIC_STUDIO_RIGHTS_STANDARD_ANNUAL_ID  (not configured)
STRIPE_PRICE_MUSIC_STUDIO_RIGHTS_PRO_MONTHLY_ID    (not configured)
STRIPE_PRICE_MUSIC_STUDIO_RIGHTS_PRO_ANNUAL_ID     (not configured)

# Python matrix
DATABASE_URL
NURAVEN_CORP_LLM_SCORER_URL   # optional: NuRavenCorpLLM live-stream scoring endpoint
RANKER_MODEL_TIMEOUT_SECONDS  # default 1.5

# NuRavenCorpLLM bridge (from wiseravenshare server)
NuRavenCorpLlm:BaseUrl        # default http://localhost:5011
NuRavenCorpLlm:AccessToken    # optional
NuRavenCorpLlm:DefaultPersona # default Technical
```


### Auth
- JWT auth via `Authentication__Jwt__Key` (WRS_prod_jwt_*). `Authentication__Jwt__ExpiresMinutes = 1440`.
- Google, Microsoft, Facebook, TikTok, YouTube, Instagram OAuth providers active.
- Admin email list: `admin@wiseravenshare.com`, `gaius@wiseravenshare.com`, `arnoldspence@wiseravenshare.com`.

### Feed / Timeline
- `PostRepository.GetFeedAsync`: **primary** = own posts + followed users; **partial** = authors of liked posts (max 10 authors, max 2 posts each); **blocked** = both-direction block filter at DB query level.
- User block: `UserBlock` entity in `app_data.UserBlocks` (idempotent SQL migration). Endpoints: `POST/DELETE /api/users/{id}/block`, `GET /api/users/me/blocks`.
- Frontend: `SocialGraph.js` has `blockUser/unblockUser/isBlocked/seedBlocksFromServer`; `FeedPage.jsx` loads blocks on mount and filters `rankedFeedPosts`.
- `PostCard.jsx` has a 🚫 block button per post.

### Wise-tracks (Music Player)
- Route `music-player` → `MusicPlayerPage` (no admin gate).
- 30-song free-tier cap enforced both client-side and server-side (`RavensightMusicMediaController.SaveMusic`).
- Music always stored in user-scoped folder `users/{identity}/media/music`.
- Creator plan for unlimited storage: scaffolded, not yet wired to billing.

### My Library Upload
- `api.js uploadMusicTrack/uploadMedia`: sends `File` field (capital F) only — no duplicate lowercase field.
- `handleUpload` in `MyLibraryPage`: optimistic UI update immediately after upload; server reload on `libraryVersion` increment.
- `useEffect` deps: `[user?.id, libraryVersion]` — `addToast` removed to prevent reload loops.
- `RavensightMusicMediaController.SaveMusic`: file fallback via `Request.Form.Files`, try/catch around count check.

### Karaoke
- Async job pipeline: `POST /generate-backing/jobs` → `jobId`; client polls `GET /api/karaoke/jobs/{id}`; downloads from `GET /api/karaoke/jobs/{id}/instrumental`.
- Per-user persistent workspace: `data/karaoke/users/{id}/uploads|stems|tracks|catalogue|tmp`.
- Premium catalogue songs unlockable per-user (persistent purchases).
- Container: gunicorn + uvicorn workers, 900s timeout.

### Player Error Handling
- FMRadioPage (`onloaderror`): auto-advances to next queued track; clears `currentTrack` if queue exhausted.
- FMRadioPage (`handleUpload`): auto-loads new file if no current track OR `loadError` is set.
- MusicPlayerPage (`onError`): clears ephemeral/blob tracks from library on final failure.
- MyLibraryPage audio: `onError` sets `isPlaying = false`.

### Podcast / Music Rights
- Podcast Studio checkout unified with Ravensight plan navigation.
- Music Rights plans wired to Stripe (Basic/Standard/Pro). Server-side price→plan-key resolution in `SubscriptionService`.
- Subscription auto-release: `rights_basic/standard/pro` feature maps in `SubscriptionService.ReleaseFeaturesByTierAsync`.

### Streaming
- Video: HTTP range-request via `VideoStreamingController` → DO Spaces CDN.
- Radio: HTTP audio proxy (`/api/fmtuner/stream-proxy`) for CORS bypass; `useRadioStream.js` has real Web Audio analyser + exponential-backoff reconnect.
- Icecast: configured but disabled (`Enabled=false`) — Creator Radio "Go Live" is activation-pending.
- HLS segmentation: **planned** — `services/video-processor/` service being added. Non-destructive; existing URLs remain as fallback.
- Python services (audio-processor:8001, karaoke-engine:8002, karaoke-speech:8003) deployed via Docker Compose; DO App Platform base URLs left blank pending activation.

### Deployment
- DO App Platform: `api` (ASP.NET Core) + `web` (static React) + `llm-api` (NuRavenCorpLLM, added 2026-09-30).
- DB: Managed Postgres 16 cluster `wiseravenshare-db` / `defaultdb`.
- Blob: DO Spaces `bucket-wrs-01010` / CDN at `DO_CDN_PUBLIC_BASE_URL`.
