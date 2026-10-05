FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY orchestrator.py .

# Environment
ENV PYTHON_ORCHESTRATOR_HOST=0.0.0.0
ENV PYTHON_ORCHESTRATOR_PORT=8888
ENV PYTHON_ENV=production

EXPOSE 8888

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:8888/health')" || exit 1

CMD ["python", "orchestrator.py"]
