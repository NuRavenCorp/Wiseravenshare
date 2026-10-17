# WiseRavenStream transfer API

Configure the same secret on both servers: `StreamBridge:ApiKey` on WiseRavenShare (or the `WISERAVENSTREAM_API_KEY` environment variable) and send it from WiseRavenStream in the `X-Stream-Api-Key` header. Requests without a configured and matching key receive `401 Unauthorized`.

## Poll approved transfers

`GET /api/stream-transfer/approved?limit=25`

The `limit` is clamped to 1–100. The response is an array of transfer records including `id`, `videoUrl`, `title`, `description`, `sourceCreatorId`, and `sourceContentId`. The video URL must be accessible to the WiseRavenStream server.

## Report upload state

`PUT /api/stream-transfer/{id}/stream-status`

Begin the upload:

```json
{ "status": "Uploading" }
```

On successful publication, provide the WiseRavenStream video ID:

```json
{ "status": "Ready", "streamVideoUid": "strm_2026_09_23_001" }
```

On upload failure:

```json
{ "status": "Failed" }
```

Allowed transitions are `Approved` → `Uploading` → `Ready`, or `Approved`/`Uploading` → `Failed`. A failed transfer can be retried through the existing creator endpoint `POST /api/stream-transfer/{id}/retry`. `Ready` records `publishedAt`; invalid transitions return `400`, and unknown transfer IDs return `404`.
