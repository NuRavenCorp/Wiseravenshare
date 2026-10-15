FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8005

COPY wiseravenshare.Server/python-matrix/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY wiseravenshare.Server/python-matrix/ ./

EXPOSE 8005

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=5 \
  CMD python -c "from urllib.request import urlopen; urlopen('http://127.0.0.1:8005/health').read()" || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8005"]
