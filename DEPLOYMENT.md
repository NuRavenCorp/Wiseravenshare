# Wiseravenshare Deployment Checklist

This checklist covers local validation and IONOS production deployment.

## 1) Local Container Validation

Run from repository root:

```powershell
docker compose up --build -d
```

Verify services:

```powershell
docker compose ps
```

Expected state:
- `wiseravenshare-api` is `Up` and mapped to `10000:10000`.
- `wiseravenshare_db` is `Up` and `(healthy)`.

Smoke test endpoints:

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:10000/health | Select-Object -ExpandProperty Content
Invoke-WebRequest -UseBasicParsing http://localhost:10000/health/db | Select-Object -ExpandProperty Content
Invoke-WebRequest -UseBasicParsing http://localhost:10000/WeatherForecast | Select-Object -ExpandProperty Content
```

Optional media upload smoke test:

```powershell
$form = @{
  file = Get-Item "./tmp-test-video.mp4"
  publishToYouTube = "false"
  title = "Smoke Upload"
  description = "Compose smoke test"
}
Invoke-RestMethod -Uri "http://localhost:10000/api/media/upload" -Method Post -Form $form
```

Stop stack:

```powershell
docker compose down
```

## 2) IONOS Hosting

Use this path when deploying to an IONOS VPS or cloud server.

### Server Preparation

- Install Docker Engine, Docker Compose plugin, Nginx, and Certbot.
- Open inbound ports `80` and `443` on the server firewall.
- Point domain DNS (`A` records for root and `www`) to the IONOS server public IP.

### Deploy Application

Run from repository root on the IONOS server:

```bash
docker compose up --build -d
```

Verify:

```bash
docker compose ps
curl -s http://localhost:10000/health
curl -s http://localhost:10000/health/db
```

### One-Command App Update

After initial setup, use the deploy helper for routine releases:

```bash
cd /opt/wiseravenshare
chmod +x ./scripts/deploy-ionos.sh
./scripts/deploy-ionos.sh
```

Optional overrides:

```bash
BRANCH=main REPO_DIR=/opt/wiseravenshare ./scripts/deploy-ionos.sh
```

### Configure Nginx Reverse Proxy

- Use [wiseravenshare.client/nginx.conf](wiseravenshare.client/nginx.conf) as the server config.
- Ensure `proxy_pass` for `/api/` points to `http://localhost:10000/api/`.
- Place your built frontend at `/var/www/wiseravenshare` (or adjust `root` in Nginx).

### Enable TLS Certificates

```bash
sudo certbot --nginx -d wiseravenshare.com -d www.wiseravenshare.com
```

### Restart Services

```bash
sudo nginx -t
sudo systemctl reload nginx
docker compose restart api
```

## 3) IONOS DNS Records

Create these records in IONOS DNS for your production zone:

| Hostname | Type | Value | Purpose |
| --- | --- | --- | --- |
| `@` | `A` | Your IONOS server public IPv4 address | Canonical site host |
| `www` | `A` | Your IONOS server public IPv4 address | `www` redirect host |
| `api` | `A` | Your IONOS server public IPv4 address | Optional API subdomain if you later split the API off Nginx |

If IONOS gives you an IPv6 address, add matching `AAAA` records for the same hosts.

You do not need separate DNS entries for individual site pages or SPA routes such as `/`, `/login`, `/dashboard`, `/media`, or `/settings`. Those routes are handled by the frontend router and Nginx `try_files` rule on the same apex or `www` host.

Important:
- Use standard DNS records only.
- DNS propagation can take up to 24 hours, but usually completes much sooner.

## 4) Current YouTube Upload Behavior

`IYouTubeService` is currently a stub implementation that returns generated YouTube-like URLs.
No external YouTube credentials are required in the current code.

## 5) Production Readiness Gates

Before promoting:
- Replace placeholder DB credentials with real production Postgres values.
- Confirm CORS `CLIENT_ORIGIN` matches your public site origin.
- Verify `/health` and `/health/db` return 200 on the deployed server.
- Verify one media upload request succeeds in production logs.
- Rotate any temporary credentials used during setup.

Domain go-live checks:
- `https://wiseravenshare.com` resolves and serves the static app over HTTPS.
- `https://www.wiseravenshare.com` redirects to `https://wiseravenshare.com` (or vice versa, pick one canonical host).
- `https://wiseravenshare.com/health` or `https://wiseravenshare.com/api/...` endpoints respond as expected through Nginx.
