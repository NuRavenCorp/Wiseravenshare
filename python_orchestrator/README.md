# Python Orchestrator Backend — Microservice for Python-based operations

Central HTTP API that coordinates all Python-based services for the WiseRavenShare platform.

## Architecture

```
┌─────────────────────────────────────┐
│     React Frontend (Browser)        │
└──────────────────┬──────────────────┘
                   │
┌──────────────────v──────────────────┐
│   ASP.NET Core MVC Backend (C#)     │
│  - HTTP API for UI                  │
│  - Delegates Python work via HTTP   │
└──────────────────┬──────────────────┘
                   │ HTTP POST/GET
┌──────────────────v──────────────────┐
│  Python Orchestrator (FastAPI) ←――← This service
│  ├─ Speech-to-Text (STT)            │
│  ├─ Text-to-Speech (TTS)            │
│  ├─ Audio Processing                │
│  ├─ Karaoke Scoring                 │
│  ├─ Lyrics Extraction               │
│  └─ Storage Proxy (Presigned URLs)  │
└─────────────────────────────────────┘
                   │ Streams from/to
┌──────────────────v──────────────────┐
│  DigitalOcean Spaces (blob storage) │
└─────────────────────────────────────┘
```

## Running

```bash
# Install dependencies
pip install -r requirements.txt

# Run orchestrator (development)
python orchestrator.py

# Run orchestrator (production with gunicorn)
gunicorn -w 4 -k uvicorn.workers.UvicornWorker orchestrator:app --bind 0.0.0.0:8888
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PYTHON_ORCHESTRATOR_HOST` | `0.0.0.0` | Bind address |
| `PYTHON_ORCHESTRATOR_PORT` | `8888` | Listen port |
| `PYTHON_TEMP_DIR` | `/tmp/wiseravenshare` | Temp file storage |
| `PYTHON_ENV` | `production` | Environment (development enables reload) |
| `Storage__Blob__*` | (from env) | DO Spaces credentials |

## Available Services

### GET `/health`
Service health probe.

```bash
curl http://localhost:8888/health
```

### GET `/api/services`
List all available services.

```bash
curl http://localhost:8888/api/services
```

### GET `/api/services/{service_id}`
Get info about a specific service.

```bash
curl http://localhost:8888/api/services/stt
```

### POST `/api/audio/process`
Process audio (normalize, compress, apply effects).

```bash
curl -X POST http://localhost:8888/api/audio/process \
  -H "Content-Type: application/json" \
  -d '{
    "source_url": "https://nyc3.digitaloceanspaces.com/bucket/track.mp3",
    "output_format": "mp3",
    "normalize": true,
    "compression_ratio": 4.0,
    "effects": ["reverb"]
  }'
```

### POST `/api/karaoke/score`
Score a karaoke performance against reference audio.

```bash
curl -X POST http://localhost:8888/api/karaoke/score \
  -H "Content-Type: application/json" \
  -d '{
    "reference_audio_url": "https://...",
    "performance_audio_url": "https://...",
    "scoring_method": "correlation"
  }'
```

### POST `/api/lyrics/extract`
Extract and synchronize lyrics from audio.

```bash
curl -X POST http://localhost:8888/api/lyrics/extract \
  -H "Content-Type: application/json" \
  -d '{
    "audio_url": "https://...",
    "sync_timing": true,
    "language": "auto"
  }'
```

### POST `/api/stt/transcribe`
Transcribe audio to text.

```bash
curl -X POST http://localhost:8888/api/stt/transcribe \
  -H "Content-Type: application/json" \
  -d '{
    "audio_url": "https://...",
    "language": "en-US",
    "format": "text"
  }'
```

### POST `/api/tts/synthesize`
Generate speech from text.

```bash
curl -X POST http://localhost:8888/api/tts/synthesize \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello world",
    "language": "en-US",
    "voice": "default",
    "rate": 1.0
  }'
```

### GET `/api/storage/stream?file={filename}`
Stream a temporary file (used by TTS, audio processing, etc).

```bash
curl http://localhost:8888/api/storage/stream?file=tts_output.mp3 > output.mp3
```

### POST `/api/storage/proxy`
Generate presigned URL for DigitalOcean Spaces object.

```bash
curl -X POST http://localhost:8888/api/storage/proxy \
  -H "Content-Type: application/json" \
  -d '{
    "bucket_name": "bucket-wrs-01010",
    "object_key": "music/track.mp3",
    "expires_in": 3600
  }'
```

## Integration with ASP.NET Core Backend

The C# backend can delegate Python work by calling orchestrator endpoints:

```csharp
// In a C# controller:
using HttpClient client = new HttpClient();
var response = await client.PostAsJsonAsync(
    "http://python-orchestrator:8888/api/stt/transcribe",
    new { audio_url = presignedUrl, language = "en-US" }
);
var result = await response.Content.ReadAsAsync<TranscriptionResult>();
```

## Performance Considerations

- **Concurrency**: FastAPI handles multiple requests concurrently via async/await
- **Temp Files**: Automatically cleaned up after 1 hour (TODO: implement cleanup task)
- **Large Files**: Stream responses to avoid memory issues
- **Error Handling**: All endpoints return consistent error JSON with timestamp
- **Logging**: All operations logged with timestamps for debugging

## Future Enhancements

- [ ] WebSocket support for long-running operations (karaoke scoring, audio processing)
- [ ] Task queuing with Celery for CPU-intensive operations
- [ ] Caching layer for frequently requested services
- [ ] GraphQL API in addition to REST
- [ ] Authentication/Authorization (API keys, JWT tokens)
- [ ] Rate limiting per service
- [ ] Metrics collection (Prometheus-compatible)
- [ ] Health checks for dependent services (STT engine, TTS engine, etc)

## Support

Issues or questions? Contact: support@wiseravenshare.com
