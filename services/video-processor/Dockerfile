FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl libsndfile1 ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY services/video-processor/requirements.txt ./
RUN pip install --upgrade pip \
    && pip install -r requirements.txt

COPY services/video-processor/main.py ./

EXPOSE 8004

CMD ["gunicorn", "-k", "uvicorn.workers.UvicornWorker", "-w", "1", "-b", "0.0.0.0:8004", "--timeout", "1800", "--graceful-timeout", "120", "main:app"]
