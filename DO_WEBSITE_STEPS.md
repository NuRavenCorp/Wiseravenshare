DigitalOcean Website Steps for Wiseravenshare Containers

Current app in your active account:
- App name: wiseravenshare
- App ID: 29b375ab-404f-42c4-898c-ba5a6666ebd1

Current PostgreSQL clusters found:
- wiseravenshare-db (pg16, sfo3)
- db-pgsql-sfo3-49872 (pg16, sfo3)
- db-pgsql-nyc1-08272 (pg16, nyc1)

Goal
Run the app in containers while connecting to managed DigitalOcean services.

1) PostgreSQL in DigitalOcean
- Open DigitalOcean dashboard.
- Go to Databases.
- Open cluster wiseravenshare-db.
- Open Connection Details.
- Copy host, port, database, username, password.
- Ensure your machine IP is in Trusted Sources.
- Put values into EXTERNAL_POSTGRES_CONNECTION in .env.container.

2) Redis or Valkey in DigitalOcean (optional but recommended)
- Dashboard -> Databases -> Create Database Cluster.
- Engine: Redis or Valkey.
- Region: same as app if possible.
- After creation, copy connection URI.
- Put it in REDIS_CONNECTION_STRING.

3) Spaces in DigitalOcean for blobs
- Dashboard -> Spaces Object Storage.
- Create or open your space.
- Region: sfo3 if matching current stack.
- Create Spaces access key + secret.
- Fill S3_ACCESS_KEY and S3_SECRET_KEY.
- Set S3_ENDPOINT like https://sfo3.digitaloceanspaces.com
- Set BLOB_BUCKET_NAME to your Space name.

4) Stripe values
- Stripe Dashboard -> Developers -> API keys and Webhooks.
- Fill STRIPE_PUBLISHABLE_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET.

5) Prepare local env file
- Copy .env.container.do.example to .env.container.
- Replace all REPLACE_ values.

6) Start hybrid container stack locally
- docker compose --env-file .env.container -f docker-compose.container.yml --profile local-cache --profile local-blob up -d

7) Deploy images to DO App Platform
- Run scripts/deploy-do-direct.ps1
- This script builds and pushes api/web images and updates App Spec tags.

8) Confirm live deployment in DO website
- Dashboard -> Apps -> wiseravenshare.
- Deployments tab: latest should be Active.
- Settings/Components: verify image tags are latest direct-YYYYMMDD-HHMMSS and api-direct-YYYYMMDD-HHMMSS.
- Domains: test /health endpoint.

Troubleshooting
- If deployment fails with 404 app id, verify you are in the correct DO team/project and app id is 29b375ab-404f-42c4-898c-ba5a6666ebd1.
- If API cannot connect to database, re-check Trusted Sources and SSL parameters in EXTERNAL_POSTGRES_CONNECTION.
- If blob uploads fail, verify Spaces keys and endpoint region are correct.
