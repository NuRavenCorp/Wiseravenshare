# NuRavenCorpLLM Context Memory

## Platform Integration
- WiseravenShare social integrations run through `wiseravenshare.server` plugin architecture.
- Primary contract: `POST /webhook/post` `{platform, action, data}` and `POST /webhook/<platform>/events` for inbound webhooks.
- Supported platforms: facebook, instagram, tiktok, youtube, linkedin, reddit.
- Prefer capability-aware behavior using `GET /capabilities` and platform readiness checks via `GET /platforms`.
- For long-running media operations, expect queued async flow and job IDs rather than blocking inline responses.

## Architecture (as of 2026-09-30)

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
