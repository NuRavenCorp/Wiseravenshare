# Docker Deployment Guide

## Overview

WiseRavenShare is containerized as a single unified application:
- **API Server**: .NET 10 running on port 10000, serves both API and static React frontend
- **Database**: PostgreSQL 16 (optional, can use managed service)
- **Optional Services**: Ollama (AI), Redis (cache), MinIO (object storage), Stripe CLI

## Quick Start

### 1. Local Development (with all services)

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your settings (optional - defaults are fine for local dev)
# nano .env

# Build and run with all optional services enabled
docker-compose --profile local-db --profile with-ai --profile with-cache --profile with-storage up --build
```

The app will be available at: `http://localhost:10000`

### 2. Minimal Setup (API only)

```bash
# Build and run API only (no database, requires external DB connection)
docker-compose up --build api
```

Set `EXTERNAL_POSTGRES_CONNECTION` environment variable to connect to external database.

### 3. Production Setup

```bash
# Using production configuration with managed services
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

In production:
- Database: Use DigitalOcean Managed PostgreSQL, AWS RDS, or similar
- Storage: Use DigitalOcean Spaces, AWS S3, or similar
- Cache: Use DigitalOcean Managed Redis, AWS ElastiCache, or similar
- Set `EXTERNAL_POSTGRES_CONNECTION` and appropriate S3 credentials

## Docker Compose Files

### `docker-compose.yml` (Main)
Base configuration with all services defined but optional services disabled by default.

**Services:**
- `api`: Main application (builds and serves both backend + frontend)
- `postgres`: PostgreSQL database (profile: `local-db`)
- `ollama`: AI assistant (profile: `with-ai`)
- `redis`: Cache (profile: `with-cache`)
- `minio`: S3-compatible storage (profile: `with-storage`)
- `minio-init`: Initializes MinIO buckets (profile: `with-storage`)
- `stripe-cli`: Webhook forwarder (profile: `with-stripe`)

### `docker-compose.dev.yml`
Development overrides - enables all optional services and relaxes some constraints.

```bash
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

### `docker-compose.prod.yml`
Production overrides - disables local services that should be managed externally.

```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## Profiles

Profiles allow selective service startup:

```bash
# Enable local database
--profile local-db

# Enable AI assistant
--profile with-ai

# Enable Redis cache
--profile with-cache

# Enable MinIO storage
--profile with-storage

# Enable Stripe webhook forwarding (local testing)
--profile with-stripe

# Combine multiple profiles
docker-compose --profile local-db --profile with-ai --profile with-cache up
```

## Environment Variables

Copy `.env.example` to `.env` and customize:

```bash
cp .env.example .env
nano .env
```

### Key Variables

**Application:**
- `ASPNETCORE_ENVIRONMENT`: Development, Staging, or Production
- `API_PORT`: Port for API (default: 10000)
- `CLIENT_ORIGIN`: CORS origins for the frontend

**Database:**
- `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`
- `EXTERNAL_POSTGRES_CONNECTION`: Use managed database (production)

**AI (Ollama):**
- `OLLAMA_BASE_URL`: Ollama service URL
- `OLLAMA_DEFAULT_MODEL`: Model to use (default: llama3.2)

**Cache (Redis):**
- `REDIS_CONNECTION_STRING`: Redis connection URL

**Storage (S3/MinIO):**
- `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`
- `BLOB_BUCKET_NAME`: Bucket for files

**Stripe:**
- `STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`

## Building

### Build the Docker image locally

```bash
docker-compose build
```

### Build with specific build args

```bash
docker-compose build \
  --build-arg VITE_API_URL=https://api.example.com \
  --build-arg VITE_RAVENSIGHT_API_URL=https://api.example.com/api/ravensight
```

## Troubleshooting

### Logs

```bash
# View all logs
docker-compose logs

# Follow logs for specific service
docker-compose logs -f api

# View logs from last 100 lines
docker-compose logs --tail=100 api
```

### Shell into container

```bash
docker-compose exec api sh
docker-compose exec postgres psql -U wiseravenshare_user -d wiseravenshare-db
```

### Health checks

```bash
# Check service status
docker-compose ps

# Test API health
curl http://localhost:10000/health

# Test database
docker-compose exec postgres pg_isready -U wiseravenshare_user
```

### Clean up

```bash
# Stop all containers
docker-compose down

# Remove all containers, networks, and volumes
docker-compose down -v

# Force remove everything
docker-compose down -v --remove-orphans
```

## Deployment to DigitalOcean

### Using App Platform

1. Connect your GitHub repository to DigitalOcean App Platform
2. Create `.do/app.yaml` with your configuration
3. Deploy: The container will be built and deployed automatically

### Using Docker Compose on Droplet

```bash
# On DigitalOcean Droplet:
git clone <repo>
cd Wiseravenshare
cp .env.example .env

# Edit .env with production settings
nano .env

# Start services
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# View logs
docker-compose logs -f api
```

## Networking

Services communicate through the `wiseravenshare-net` Docker network:
- `api` container is accessible as `http://api:10000` to other containers
- `postgres` is accessible as `postgres:5432`
- `ollama` is accessible as `http://ollama:11434`
- `redis` is accessible as `redis:6379`
- `minio` is accessible as `http://minio:9000`

## Volumes

Data persists in named volumes:
- `postgres-data`: PostgreSQL database files
- `ollama-models`: Downloaded Ollama models
- `minio-data`: MinIO object storage

Volumes are created automatically and survive container restarts.

## Port Mappings

| Service | Internal | External | Usage |
|---------|----------|----------|-------|
| API | 10000 | 10000 | Application frontend & API |
| PostgreSQL | 5432 | 5432 | Database (dev only) |
| Ollama | 11434 | 11434 | AI assistant (dev only) |
| Redis | 6379 | 6379 | Cache (dev only) |
| MinIO API | 9000 | 9000 | Object storage (dev only) |
| MinIO Console | 9001 | 9001 | MinIO admin UI (dev only) |

## Security Notes

- **Development**: Self-signed certificates, default credentials
- **Production**: 
  - Use proper SSL certificates
  - Change all default credentials
  - Use managed services (don't run databases in containers)
  - Enable health checks
  - Set proper resource limits
  - Use private Docker registries
  - Implement rate limiting and WAF

## Health Checks

Services include health checks:

```bash
# Check API health
curl http://localhost:10000/health

# Check in docker-compose
docker-compose ps
```

Unhealthy services will show status like: `Up (unhealthy)`

## Multi-stage Build Benefits

The Dockerfile uses multi-stage builds:
1. **Stage 1**: Build React frontend (Node.js)
2. **Stage 2**: Build .NET backend (SDK)
3. **Stage 3**: Runtime only (runtime image is smaller)

This produces a single container with both frontend and backend, reducing complexity and improving startup time.
