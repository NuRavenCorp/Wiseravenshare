FROM python:3.11-slim

WORKDIR /app

COPY services/karaoke-speech/requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

COPY services/karaoke-speech/. ./

ENV PYTHONUNBUFFERED=1 \
    SHERPA_MODEL_DIR=/app/models

EXPOSE 8003

CMD ["python", "main.py"]
