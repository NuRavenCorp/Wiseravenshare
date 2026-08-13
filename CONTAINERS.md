# Container Architecture for Wiseravenshare

This stack gives you a containerized runtime for app + data dependencies while still allowing managed DigitalOcean services.

## What can and cannot be containerized

- You can containerize:
  - API and web app
  - PostgreSQL (local dev)
  - Redis (local dev)
  - Blob-compatible storage via MinIO (local dev)
  - Stripe webhook forwarding via stripe-cli
- You cannot containerize DigitalOcean managed control planes themselves (Managed DB, Spaces, Managed Redis, App Platform).
  - You connect to those managed services from containers using credentials and endpoints.

## Files

- docker-compose.container.yml
- .env.container.example

## Quick start (full local)

1. Copy env template:
   - cp .env.container.example .env.container
2. Start local full stack:
   - docker compose --env-file .env.container -f docker-compose.container.yml --profile local-db --profile local-cache --profile local-blob --profile stripe up -d
3. Web and API:
   - Web: http://localhost:8088
   - API: http://localhost:10000
   - MinIO Console: http://localhost:9001

## Hybrid mode (managed DO PostgreSQL + local app)

1. Set EXTERNAL_POSTGRES_CONNECTION in .env.container to your DigitalOcean managed DB connection string.
2. Do not enable local-db profile.
3. Start app + optional local cache/blob only:
   - docker compose --env-file .env.container -f docker-compose.container.yml --profile local-cache --profile local-blob up -d

## About "feeding DO DB credentials to postgres docker pull"

- docker pull postgres only downloads the image; credentials are not used there.
- Credentials are consumed at container runtime by your app connection string, e.g. ConnectionStrings__DefaultConnection.
- If you want to clone managed DO data into local Postgres, use pg_dump/pg_restore (outside image pull).
