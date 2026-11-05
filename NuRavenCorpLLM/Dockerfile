FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY main.py /app/main.py

ENV NURAVENCORP_PORT=5011
EXPOSE 5011

HEALTHCHECK --interval=10s --timeout=5s --retries=12 CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:5011/health', timeout=4).read()"

CMD ["python", "main.py"]
