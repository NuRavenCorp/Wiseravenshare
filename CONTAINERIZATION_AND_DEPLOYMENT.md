# Containerization Audit & DigitalOcean Deployment Guide

---

## 1. Container Inventory & Cataloging Strategy

### Total Container Count: **7 Containers**

| # | Container Name | Service Type | Image / Dockerfile Source | Default Port(s) | Profile / Strategy |
|---|---|---|---|---|---|
| **1** | `wiseravenshare-api` | Application API | `./Wiseravenshare.Server/Dockerfile` | `10000` | Always Active |
| **2** | `wiseravenshare-web` | Frontend Web (Nginx) | `./wiseravenshare.client/Dockerfile` | `8088` (maps to `8080`) | Always Active |
| **3** | `wiseravenshare-postgres` | Database | `postgres:16-alpine` | `5432` | `local-db` |
| **4** | `wiseravenshare-redis` | Cache Store | `redis:7-alpine` | `6379` | `local-cache` |
| **5** | `wiseravenshare-minio` | Object Storage | `minio/minio:latest` | `9000`, `9001` | `local-blob` |
| **6** | `wiseravenshare-minio-init` | Bucket Provisioner | `minio/mc:latest` | Ephemeral | `local-blob` |
| **7** | `wiseravenshare-stripe-cli` | Payment Webhooks | `stripe/stripe-cli:latest` | Internal | `stripe` |

---

### Cataloging Architecture Diagram

```text
+-------------------------------------------------------------------+
|                        APPLICATION TIER                           |
|  • wiseravenshare-api   (Port 10000) -> ASP.NET Core 10 Web API   |
|  • wiseravenshare-web   (Port 8088)  -> React/Vite SPA on Nginx   |
+---------------------------------+---------------------------------+
                                  |
+---------------------------------+---------------------------------+
|                    PERSISTENCE & CACHE TIER                       |
|  • wiseravenshare-postgres (Port 5432)  [Profile: local-db]       |
|  • wiseravenshare-redis    (Port 6379)  [Profile: local-cache]    |
+---------------------------------+---------------------------------+
                                  |
+---------------------------------+---------------------------------+
|                     MEDIA & STORAGE TIER                          |
|  • wiseravenshare-minio      (Ports 9000/9001) [Profile: local-blob]
|  • wiseravenshare-minio-init (One-time S3 Bucket Creator)         |
+---------------------------------+---------------------------------+
                                  |
+---------------------------------+---------------------------------+
|                    INTEGRATIONS & TESTING                         |
|  • wiseravenshare-stripe-cli (Stripe Webhook Listener)            |
+-------------------------------------------------------------------+
```

---

## 2. Docker Compose Quick Reference Commands

### Start Only Core App (API + Web against managed cloud services)
```bash
docker compose -f Wiseravenshare/docker-compose.container.yml up -d
```

### Start Full Stack (App + Local Postgres + Local Redis + Local MinIO)
```bash
docker compose -f Wiseravenshare/docker-compose.container.yml --profile local-db --profile local-cache --profile local-blob up -d
```

### Stop All Containers & Clean Up
```bash
docker compose -f Wiseravenshare/docker-compose.container.yml down
```

---

## 3. DigitalOcean Deployment Options for Your Website

For hosting **Wiseravenshare** on DigitalOcean (`wise-ravens.com`), choose from **3 choices**:

---

### Choice A: DigitalOcean App Platform — Decoupled Two-Component Setup (Recommended for Scale)

* **How It Works**:
  * **`web` Component**: Nginx serving the compiled React Vite frontend at `wise-ravens.com`.
  * **`api` Component**: ASP.NET Core 10 backend container mapped to `wise-ravens.com/api/*`.
  * **Database**: DigitalOcean Managed PostgreSQL database.
  * **Storage**: DigitalOcean Spaces (S3 compatible) for video uploads.

#### DigitalOcean App Spec (`.do/app.live.yaml`):

```yaml
name: wiseravenshare
region: nyc
domains:
  - domain: wise-ravens.com
    type: PRIMARY
  - domain: www.wise-ravens.com
    type: ALIAS

databases:
  - engine: PG
    name: wiseravenshare-db
    version: "16"

ingress:
  rules:
    - component:
        name: api
        preserve_path_prefix: true
      match:
        path:
          prefix: /api
    - component:
        name: api
        preserve_path_prefix: true
      match:
        path:
          prefix: /health
    - component:
        name: web
      match:
        path:
          prefix: /

services:
  - name: api
    dockerfile_path: Wiseravenshare.Server/Dockerfile
    http_port: 10000
    instance_count: 1
    instance_size_slug: basic-xs
    health_check:
      http_path: /health
      initial_delay_seconds: 20
      period_seconds: 30
    envs:
      - key: ASPNETCORE_ENVIRONMENT
        value: Production
      - key: ASPNETCORE_URLS
        value: http://0.0.0.0:10000
      - key: CLIENT_ORIGIN
        value: ${web.PUBLIC_URL}

  - name: web
    dockerfile_path: wiseravenshare.client/Dockerfile
    http_port: 8080
    instance_count: 1
    instance_size_slug: basic-xxs
```

---

### Choice B: Single-Container Unified Build (Lowest Cost Deployment)

* **How It Works**:
  * Leverages `Wiseravenshare.Server/Dockerfile` multi-stage build.
  * Multi-stage build compiles React/Vite in Stage 1, copies `dist/` directly into `.NET`'s `/wwwroot` folder in Stage 3.
  * ASP.NET Core serves both Web API endpoints (`/api/*`) and React static assets (`/`) from a **single container**.

#### Pros & Cons:
* **Cost**: ~$5/month (runs on 1 container or droplet).
* **CORS**: Zero CORS issues (frontend and backend run on same domain/port).
* **Deploy Command via DigitalOcean CLI (`doctl`)**:

```bash
doctl apps create --spec Wiseravenshare/.do/app.live.yaml
```

---

### Choice C: DigitalOcean Droplet + Docker Compose (Maximum Control)

* **How It Works**:
  * Spin up a $6 - $12/month DigitalOcean Ubuntu Droplet.
  * Install Docker & Docker Compose.
  * Run `docker-compose.container.yml` directly on the droplet behind Caddy or Nginx.

#### Quick Setup Commands on Droplet:

```bash
# 1. Clone repository
git clone https://github.com/your-org/Wiseravenshare.git
cd Wiseravenshare

# 2. Launch application + local database + cache
docker compose -f Wiseravenshare/docker-compose.container.yml --profile local-db --profile local-cache up -d
```

---

### Comparison Matrix

| Option | Monthly Cost | Scalability | Complexity | Recommended For |
|---|---|---|---|---|
| **Choice A** (DO App Platform Decoupled) | ~$20 - $35/mo | High | Low (Fully Managed) | Production with growth |
| **Choice B** (DO App Platform Single Container) | ~$5 - $12/mo | Medium | Lowest | MVP / Low budget |
| **Choice C** (DO Droplet + Docker Compose) | ~$6 - $12/mo | Manual | Medium (Self-Managed) | Developer control |

---

## 4. Choice A Initiation & Execution Guide

### Overview
Choice A provisions a decoupled production environment on **DigitalOcean App Platform** with:
1. `api` Service (.NET 10 Container)
2. `web` Service (Nginx React Vite Container)
3. `wiseravenshare-db` (Managed PostgreSQL 16)
4. Domain binding to `wise-ravens.com` and `www.wise-ravens.com`

---

### Step-by-Step Option A Deployment

#### Step 1: Login & Verify DigitalOcean CLI (`doctl`)
```powershell
doctl auth init
doctl account get
```

#### Step 2: Ensure DOCR (DigitalOcean Container Registry) Access
```powershell
doctl registry login
```

#### Step 3: Build & Push Production Images to DOCR
```powershell
# 1. Build and push API container
docker build -t registry.digitalocean.com/wiseravenshare/wiseravenshare-web:api-direct-20260725-videolibrary-fix -f Wiseravenshare/Wiseravenshare.Server/Dockerfile Wiseravenshare
docker push registry.digitalocean.com/wiseravenshare/wiseravenshare-web:api-direct-20260725-videolibrary-fix

# 2. Build and push Web container
docker build -t registry.digitalocean.com/wiseravenshare/wiseravenshare-web:direct-20260725-videolibrary-fix -f Wiseravenshare/wiseravenshare.client/Dockerfile Wiseravenshare
docker push registry.digitalocean.com/wiseravenshare/wiseravenshare-web:direct-20260725-videolibrary-fix
```

#### Step 4: Create or Update App on DigitalOcean App Platform
```powershell
# Create new app from app.live.yaml spec
doctl apps create --spec Wiseravenshare/.do/app.live.yaml
```

If the app already exists, retrieve its ID and update it:
```powershell
# List existing apps to get APP_ID
doctl apps list

# Update existing app
doctl apps update <YOUR_APP_ID> --spec Wiseravenshare/.do/app.live.yaml
```

#### Step 5: Monitor Deployment & Health
```powershell
# List active deployments
doctl apps list-deployments <YOUR_APP_ID>

# Follow live deployment logs
doctl apps logs <YOUR_APP_ID> --type deploy --follow
```

#### Step 6: Configure DNS Records for `wise-ravens.com`
Add the following CNAME records at your DNS provider (e.g., Cloudflare, Namecheap, or DigitalOcean DNS):

| Type | Host / Name | Value / Target | TTL |
|---|---|---|---|
| **CNAME** | `@` | `wiseravenshare-XXXXX.ondigitalocean.app` | Auto / 300 |
| **CNAME** | `www` | `wiseravenshare-XXXXX.ondigitalocean.app` | Auto / 300 |

---

## 5. NuRavenCorpLLM Cross-Site Intelligence Pipeline

NuRavenCorpLLM should run as a dedicated containerized intelligence service that receives behavioral and content signals from:

- `wiseravenshare.com`
- `voterallianceus.com`
- `wiseravenstream.com`

### 5.1 What NuRavenCorpLLM Ingests

Each site sends structured events to NuRavenCorpLLM:

1. **User search intent** (query text, filters, result clicks, follow-up actions)
2. **Post interaction signals** (views, likes, comments, shares, dwell time)
3. **Journey context** (entry page, navigation path, feature usage sequence)
4. **Publisher activity** (post creation/edit/delete and moderation outcomes)
5. **Crawler/web-grounding evidence** (cross-site crawl outputs for internet clarity)

### 5.2 Required Privacy & Safety Guardrails

Before data leaves any product boundary:

1. Strip direct PII (email, phone, full name) unless explicit legal basis exists.
2. Use stable pseudonymous user IDs for cross-site behavior analytics.
3. Enforce consent and retention policies per site jurisdiction settings.
4. Mark every event with `sourceSite` and `consentState`.
5. Block tenant leakage: no data from one product can be returned to another without an explicit policy rule.

### 5.3 Container Topology (DigitalOcean)

```text
[wiseravenshare-api] ----\
[voter-alliance-api] -----+----> [nuravencorpllm-ingestor-api] ---> [nuravencorpllm-db + vector index]
[wiseravenstream-api] ----/                 |
                                            +--> [web-grounding/crawler workers]
                                            +--> [model inference service]
```

- Website APIs stay in their own repos and domains.
- NuRavenCorpLLM is the central learning plane.
- Crawler workers feed grounded internet context back to NuRavenCorpLLM.

### 5.4 Runtime Environment Contract

Configure each website API container with outbound collector settings:

```env
LLM_COLLECTOR__ENABLED=true
LLM_COLLECTOR__BASE_URL=https://nuravencorpllm-api.<your-domain>
LLM_COLLECTOR__API_KEY=<secret>
LLM_COLLECTOR__SOURCE_SITE=wiseravenshare.com
LLM_COLLECTOR__BATCH_SIZE=100
LLM_COLLECTOR__FLUSH_INTERVAL_SECONDS=15
```

Configure NuRavenCorpLLM service with inbound trust and web-grounding:

```env
COLLECTOR__REQUIRE_SIGNED_EVENTS=true
COLLECTOR__ALLOWED_SOURCES=wiseravenshare.com,voterallianceus.com,wiseravenstream.com
COLLECTOR__MAX_EVENT_BYTES=262144
RAG__WEB_GROUNDING_ENABLED=true
RAG__CRAWL_SEED_URLS=https://wiseravenshare.com,https://voterallianceus.com,https://wiseravenstream.com
```

### 5.5 Deployment Pattern

1. Deploy each site API normally from its repo (`Wiseravenshare`, `Voter-Alliance`, `wiseravenstream`).
2. Deploy `NuRavenCorpLLM.Server` as a separate API container in the same DigitalOcean region/VPC.
3. Store collector keys as App Platform secrets in each site.
4. Enable cross-site crawler schedule for web clarity (`CRAWL_START_URLS`).
5. Validate ingestion lag, event acceptance rate, and tenant-isolation checks before promoting.

### 5.6 Minimum API Surface for NuRavenCorpLLM

Implement and expose these endpoints in NuRavenCorpLLM:

- `POST /api/intel/events/batch` (user/search/post behavior ingestion)
- `POST /api/intel/crawl/report` (crawler findings ingestion)
- `POST /api/intel/feedback` (human corrections and moderation outcomes)
- `GET /api/intel/health` (collector and pipeline health)

### 5.7 Administrator Language Intelligence Output

NuRavenCorpLLM must monitor activity across all connected sites and convert metrics into plain human language for the administrator's selected locale.

1. Monitor all major activity dimensions: searches, posting patterns, engagement shifts, moderation actions, referral paths, and cross-site behavior changes.
2. Compute normalized metrics and trend deltas (hourly/daily/weekly) so activity can be compared consistently across all three domains.
3. Generate narrative summaries that explain **what changed**, **why it likely changed**, and **recommended next actions**.
4. Translate narrative output to the admin language preference (`en`, `es`, `fr`, etc.) while preserving numeric accuracy.

Recommended runtime settings:

```env
ADMIN_INTEL__ENABLE_ACTIVITY_MONITORING=true
ADMIN_INTEL__ENABLE_NARRATIVE_TRANSLATION=true
ADMIN_INTEL__DEFAULT_LANGUAGE=en
ADMIN_INTEL__SUPPORTED_LANGUAGES=en,es,fr,pt
ADMIN_INTEL__SUMMARY_WINDOW_HOURS=24
ADMIN_INTEL__METRIC_EXPLANATION_LEVEL=detailed
```

Recommended endpoints:

- `GET /api/intel/admin/summary?language=en&windowHours=24`
- `GET /api/intel/admin/metrics?from=<iso>&to=<iso>`
