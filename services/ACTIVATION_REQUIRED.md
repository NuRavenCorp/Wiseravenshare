# WiseRavenShare Audio + Karaoke Services — Activation Checklist

## ⚠️ STATUS: PENDING ACTIVATION

These services are **built and wired** but not yet running.
The workspace owner must complete the steps below to bring them online.

---

## Services Overview

| Service | Port | Purpose |
|---|---|---|
| `audio-processor` | 8001 | Podcast DSP pipeline (DC → noise-reduce → gate → compress → -16 LUFS) |
| `karaoke-engine` | 8002 | Vocal separation via htdemucs_ft → karaoke backing track |

---

## Step 1 — Python environment (do once per machine / container)

```bash
# Audio processor
cd services/audio-processor
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Karaoke engine
cd ../karaoke-engine
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
# NOTE: first run downloads htdemucs_ft model weights (~316 MB)
```

---

## Step 2 — Run locally alongside ASP.NET Core

```bash
# Terminal A
cd services/audio-processor && python main.py   # → http://localhost:8001

# Terminal B  
cd services/karaoke-engine  && python main.py   # → http://localhost:8002

# Terminal C
cd Wiseravenshare.Server && dotnet run           # → http://localhost:5242
```

---

## Step 3 — Verify health endpoints

```
GET http://localhost:5242/api/podcast-audio/health  → { "upstream": "ok" }
GET http://localhost:5242/api/karaoke/health         → { "upstream": "ok" }
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

*Leave this file in place until activation is complete.*
