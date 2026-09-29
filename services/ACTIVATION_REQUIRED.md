# WiseRavenShare Audio + Karaoke Services — Activation Checklist

## ✅ STATUS: ACTIVATED

These services are running and validated on the primary site stack.

---

## Services Overview

| Service | Port | Purpose |
|---|---|---|
| `audio-processor` | 8001 | Podcast DSP pipeline (DC → noise-reduce → gate → compress → -16 LUFS) |
| `karaoke-engine` | 8002 | Vocal separation via htdemucs_ft → karaoke backing track |

---

## Step 1 — Container build (preferred)

```bash
docker compose build audio-processor karaoke-engine
```

---

## Step 2 — Run locally alongside ASP.NET Core

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

---

## Step 3 — Verify health endpoints

```
GET http://localhost:10000/api/podcast-audio/health  → { "upstream": "ok" }
GET http://localhost:10000/api/karaoke/health        → { "upstream": "ok" }
```

---

## Step 4 — DigitalOcean deployment (when ready)

1. Add `AUDIO_SERVICE_BASE_URL` and `KARAOKE_SERVICE_BASE_URL` as DO App secrets.
2. Deploy each Python service as a **DO App Platform Worker** or a separate Droplet.
3. The internal URLs (e.g. `http://audio-processor.internal:8001`) go in those secrets.
4. `.do/app.yaml` already has the env key stubs — just set the values.

---

## ⚠️ Licensing reminder — Karaoke

- **Public domain / UltraStar community songs** → safe to use now.
- **User-uploaded songs (songs they own)** → safe to process.
- **Mainstream commercial catalogue** → requires a commercial KTV API licence
  (Singa, Agora ZEGO) before going live with those tracks.

---

Activation validated on local site endpoints:
- `http://localhost:10000/api/podcast-audio/health`
- `http://localhost:10000/api/karaoke/health`
