# Wiseravenshare -> Facebook Publishing Middleware

Implements the full checklist: **webhook trigger → download → optimize → Graph API upload → feed post**, with queuing, retries, and JSONL job journaling.

## Architecture

```
Wiseravenshare post ──POST /webhook──▶ FastAPI listener (auth + validate)
                                            │  asyncio.Queue (never blocks)
                                            ▼
                                     background worker
                                            │
                     downloader.py (streamed GET, magic-byte sniffing)
                                            │
                     optimizer.py (Pillow for images, ffmpeg for video)
                                            │
                     facebook_client.py (/{page-id}/photos|videos then /feed)
                                            ▼
                                  data/jobs.jsonl journal
```

## Run locally

```powershell
cd middleware
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --port 8080
```

## Configuration (env vars)

| Variable | Default | Purpose |
|---|---|---|
| `WEBHOOK_TOKEN` | `dev-webhook-token` | Shared secret sent as `X-WR-Webhook-Token` |
| `FACEBOOK_PAGE_ID` | – | Page to publish to |
| `FACEBOOK_PAGE_ACCESS_TOKEN` | – | Page access token (Graph API) |
| `DRY_RUN` | `true` | When true no Facebook calls are made — set `false` to go live |
| `GRAPH_BASE_URL` | `https://graph.facebook.com/v26.0` | Graph version pin |
| `MAX_IMAGE_BYTES` / `MAX_VIDEO_BYTES` | 8MB / 512MB | Download caps |
| `IMAGE_MAX_WIDTH`, `IMAGE_QUALITY` | 1200, 85 | Pillow targets |
| `VIDEO_MAX_WIDTH/HEIGHT`, `VIDEO_CRF` | 1280/1280, 23 | ffmpeg targets |
| `FFMPEG_BIN` | `ffmpeg` | Must be on PATH for video optimization |

## Webhook payload

```json
{
  "event": "post.published",
  "job_id": "wr-2026-08-22-0001",
  "message": "Breaking: raven sighted over the harbor #News",
  "media_url": "https://cdn.wise-ravens.com/media/abc123.jpg",
  "media_type": "photo",
  "link_url": "https://wise-ravens.com/feed/abc123",
  "source": "wiseravenshare"
}
```

Responses: `202` accepted+queued, `401` bad token, `422` malformed payload, `503` queue full (caller should retry with backoff).

## Going live checklist

1. Set `DRY_RUN=false`, `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_ACCESS_TOKEN`.
2. Install ffmpeg on the host.
3. Expose the service publicly (reverse proxy / cloud run) and point the Wiseravenshare server's `SocialPublish:MiddlewareWebhookUrl` at `https://<host>/webhook`.
4. Set the same secret in both sides (`WEBHOOK_TOKEN` here, `SocialPublish:WebhookToken` in the .NET server).
