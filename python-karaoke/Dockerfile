FROM python:3.11-slim

# System deps: ffmpeg (required by audio-separator + demucs-onnx + autolrc/wispr)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    git \
    curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install CLI tools needed for LRC alignment
RUN pip install --no-cache-dir autolrc-tools wispr-lrc

COPY main.py .

# Models and job output live in named volumes on the host
RUN mkdir -p /app/models_cache /tmp/karaoke_jobs

EXPOSE 8002

HEALTHCHECK --interval=30s --timeout=8s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8002/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8002", "--workers", "2"]
