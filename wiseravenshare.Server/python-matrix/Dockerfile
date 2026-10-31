FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8005 \
    # Workers = (2 × CPU_cores) + 1; override with WEB_CONCURRENCY on the droplet
    WEB_CONCURRENCY=3

COPY wiseravenshare.Server/python-matrix/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY wiseravenshare.Server/python-matrix/ ./

EXPOSE 8005

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=5 \
  CMD python -c "from urllib.request import urlopen; urlopen('http://127.0.0.1:8005/health').read()" || exit 1

# gunicorn manages worker restarts and graceful reloads; each worker runs via
# the UvicornWorker class so the event loop (uvloop) stays active per worker.
CMD ["sh", "-c", "exec gunicorn main:app \
  --worker-class uvicorn.workers.UvicornWorker \
  --workers ${WEB_CONCURRENCY} \
  --bind 0.0.0.0:${PORT} \
  --timeout 120 \
  --keepalive 10 \
  --max-requests 1000 \
  --max-requests-jitter 100 \
  --access-logfile - \
  --error-logfile - \
  --log-level warning"]
