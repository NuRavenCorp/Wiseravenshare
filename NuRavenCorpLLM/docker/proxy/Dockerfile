FROM python:3.11-slim

WORKDIR /app

ARG APP_USER=arnol
ARG APP_UID=1000
ARG APP_GID=1000

RUN groupadd --gid ${APP_GID} ${APP_USER} \
    && useradd --uid ${APP_UID} --gid ${APP_GID} --create-home --shell /bin/bash ${APP_USER}

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY inference.py ./
COPY model.py ./

RUN chown -R ${APP_UID}:${APP_GID} /app

ENV PYTHONUNBUFFERED=1
ENV PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True

USER ${APP_USER}

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "inference:app", "--host", "0.0.0.0", "--port", "8000"]
