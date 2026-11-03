# Use an explicit, stable PyTorch base image with pre-configured CUDA runtime layers
FROM nvcr.io/nvidia/pytorch:24.01-py3

WORKDIR /workspace

ARG APP_USER=arnol
ARG APP_UID=1000
ARG APP_GID=1000

# Install system compilation utilities for native performance kernels
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    g++ \
    git \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid ${APP_GID} ${APP_USER} \
    && useradd --uid ${APP_UID} --gid ${APP_GID} --create-home --shell /bin/bash ${APP_USER}

# Copy your production application files into the image footprint
COPY requirements.txt .
COPY model.py .
COPY inference.py .

# Pre-compile performance optimizations using specific pip flags
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install --no-cache-dir flash-attn==2.7.2.post1 --no-build-isolation

RUN chown -R ${APP_UID}:${APP_GID} /workspace

EXPOSE 8000

# Set environment runtime flags optimizing NVIDIA driver integration
ENV NV_CUDNN_DISABLE_CONVOLUTION_BENCHMARK=1
ENV TORCH_CUDNN_V8_API=1
ENV PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True

USER ${APP_USER}

ENTRYPOINT ["python", "inference.py"]
