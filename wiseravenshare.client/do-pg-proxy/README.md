# DigitalOcean PostgreSQL Proxy

Lightweight HTTP service that bridges HTTP-only backend functions to your DigitalOcean PostgreSQL database. Environments that can only make HTTP connections, not raw TCP, can use this proxy to translate HTTP requests into PostgreSQL queries.

## Deploy on DigitalOcean App Platform

1. Push the `do-pg-proxy/` directory to a GitHub repo (or use the DigitalOcean CLI).
2. In DigitalOcean: **Apps → Create App → choose your repo**.
3. Set environment variables:
   - `DO_PG_CONNECTION_STRING` — your full PostgreSQL connection string
   - `SYNC_API_KEY` — a random secret string you generate (used to authenticate requests from your calling application)
4. Deploy. You'll get a URL like `https://your-app.ondigitalocean.app`.

## Configure Application Secrets

After deploying, configure your application secrets/settings with:

- `DO_PG_PROXY_URL` — the proxy URL (e.g. `https://your-app.ondigitalocean.app`)
- `DO_PG_PROXY_KEY` — the same `SYNC_API_KEY` value you set on the proxy

## Endpoints

- `GET /health` — health check
- `POST /upsert` — body: `{ table, columns, records }` — creates table if needed, upserts all records
- `GET /fetch/:table` — returns all rows from the table

## Shared schema map

- Shared table definitions live in [`schemaMap.js`](./schemaMap.js).
- When a table has a translated schema entry, `POST /upsert` can omit `columns` and the proxy will use the shared column definitions automatically.
- `AdminAccessRequest` is the first translated WiseRavenShare-ready schema. Its source JSONC RLS rules are represented as application-layer authorization notes because this proxy only authenticates service traffic, not end-user claims.