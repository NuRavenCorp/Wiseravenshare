# Docker Quick Start

## One-Command Start (Local Development)

```bash
# With all optional services (database, AI, cache, storage)
docker-compose --profile local-db --profile with-ai --profile with-cache --profile with-storage up --build
```

Access the app: **http://localhost:10000**

## Individual Service Starts

### Just the API (requires external database)
```bash
docker-compose up --build api
```

### API + Local Database
```bash
docker-compose --profile local-db up --build
```

### API + Database + AI
```bash
docker-compose --profile local-db --profile with-ai up --build
```

### API + Database + All Optional Services
```bash
docker-compose --profile local-db --profile with-ai --profile with-cache --profile with-storage up --build
```

## Usage

| Task | Command |
|------|---------|
| View logs | `docker-compose logs -f api` |
| Stop services | `docker-compose down` |
| Stop & remove volumes | `docker-compose down -v` |
| Shell into API | `docker-compose exec api sh` |
| Database shell | `docker-compose exec postgres psql -U wiseravenshare_user -d wiseravenshare-db` |
| Service status | `docker-compose ps` |
| Check API health | `curl http://localhost:10000/health` |

## Configuration

1. Copy environment template:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` if needed (defaults work for local dev):
   ```bash
   nano .env
   ```

3. All environment variables are optional - defaults provided for development

## Services

| Service | Port | Usage | Profile |
|---------|------|-------|---------|
| **API (Frontend + Backend)** | 10000 | Main app | default |
| PostgreSQL | 5432 | Database | `local-db` |
| Ollama | 11434 | AI assistant | `with-ai` |
| Redis | 6379 | Cache | `with-cache` |
| MinIO API | 9000 | Object storage | `with-storage` |
| MinIO Console | 9001 | Storage admin | `with-storage` |

## Profiles

```bash
# Enable by adding flags to docker-compose command:
--profile local-db       # PostgreSQL database
--profile with-ai        # Ollama AI assistant
--profile with-cache     # Redis cache
--profile with-storage   # MinIO S3-compatible storage
--profile with-stripe    # Stripe webhook forwarder (local testing)
```

## For Production

```bash
# Use production configuration
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

See **DOCKER_GUIDE.md** for comprehensive documentation.
