# Wiseravenshare Deployment Checklist

This checklist covers local validation and production deployment on DigitalOcean, with IONOS DNS pointing to the same app.

Note: current authoritative nameservers for `wise-ravens.com` are DigitalOcean (`ns1.digitalocean.com`, `ns2.digitalocean.com`, `ns3.digitalocean.com`). Manage active DNS records in the DigitalOcean DNS zone.

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

## 2) DigitalOcean App Platform (Primary)

Use this as the primary production path for wise-ravens.com.

### App Spec + Deploy

- Keep [.do/app.yaml](.do/app.yaml) as the source of truth for DigitalOcean App Platform.
- Push changes to `main` to trigger deployment (`deploy_on_push: true`).
- Confirm both components are healthy in DO:
  - `api` service (`/health`)
  - `web` static site

### DigitalOcean Custom Domains

- In DigitalOcean App Platform, add both custom domains:
  - `wise-ravens.com` (primary)
  - `www.wise-ravens.com` (alias)
- Wait for DO to show the DNS targets for each host and SSL provisioning status.

## 3) IONOS DNS -> DigitalOcean

Create/update these records in IONOS DNS for `wise-ravens.com`:

| Hostname | Type | Value | Purpose |
| --- | --- | --- | --- |
| `@` | `A` | `162.159.140.98` | DO App Platform static ingress IPv4 #1 |
| `@` | `A` | `172.66.0.96` | DO App Platform static ingress IPv4 #2 |
| `@` | `AAAA` | `2606:4700:7::60` | DO App Platform static ingress IPv6 #1 |
| `@` | `AAAA` | `2a06:98c1:58::60` | DO App Platform static ingress IPv6 #2 |
| `www` | `CNAME` | `@` (or `wise-ravens.com`) | `www` alias to apex |

Notes:
- If IONOS does not allow `CNAME` value as `@`, use `wise-ravens.com` as the target.
- Remove old `api` A/CNAME records unless you intentionally keep a separate `api.wise-ravens.com` hostname.
- Keep TTL at 300 seconds during cutover, then raise to 3600 after validation.

You do not need separate DNS entries for individual site pages or SPA routes such as `/`, `/login`, `/dashboard`, `/media`, or `/settings`. Those routes are handled by the frontend router and Nginx `try_files` rule on the same apex or `www` host.

Important:
- Use standard DNS records only.
- DNS propagation can take up to 24 hours, but usually completes much sooner.

If delegation has already moved to DigitalOcean nameservers, apply equivalent records in the DigitalOcean DNS zone instead of IONOS.

## 4) Optional IONOS VPS Path (Secondary)

If you intentionally deploy on IONOS VPS instead of DO App Platform, use:
- [scripts/setup-ionos-server.sh](scripts/setup-ionos-server.sh)
- [scripts/deploy-ionos.sh](scripts/deploy-ionos.sh)
- [wiseravenshare.client/nginx.conf](wiseravenshare.client/nginx.conf)

## 5) Current YouTube Upload Behavior

`IYouTubeService` is currently a stub implementation that returns generated YouTube-like URLs.
No external YouTube credentials are required in the current code.

## 6) Production Readiness Gates

Before promoting:
- Replace placeholder DB credentials with real production Postgres values.
- Confirm CORS `CLIENT_ORIGIN` matches your public site origin.
- Verify `/health` and `/health/db` return 200 on the deployed server.
- Verify one media upload request succeeds in production logs.
- Rotate any temporary credentials used during setup.

Domain go-live checks:
- `https://wise-ravens.com` resolves and serves the static app over HTTPS.
- `https://www.wise-ravens.com` redirects to `https://wise-ravens.com` (or vice versa, pick one canonical host).
- `https://wise-ravens.com/health` or `https://wise-ravens.com/api/...` endpoints respond as expected through Nginx.

## 7) External Day-to-Day Ops Agent

For daily external operations and incident response, use:
- [OPS_AGENT.md](OPS_AGENT.md)
- [scripts/ops-external-daily.ps1](scripts/ops-external-daily.ps1)

Run daily check:

```powershell
pwsh -File ./scripts/ops-external-daily.ps1 \
  -Domain wise-ravens.com \
  -WwwDomain www.wise-ravens.com \
  -ExpectedCanonicalHost wise-ravens.com \
  -ExpectedNameservers ns1.digitalocean.com,ns2.digitalocean.com,ns3.digitalocean.com \
  -ApiHealthUrl https://wise-ravens.com/health
```

Interpretation:
- Exit code `0`: pass
- Exit code `1`: warning (drift)
- Exit code `2`: critical failure

Ubuntu direct-connect (DigitalOcean droplet):

```bash
DOMAIN=wise-ravens.com \
WWW_DOMAIN=www.wise-ravens.com \
EXPECTED_CANONICAL_HOST=wise-ravens.com \
EXPECTED_NAMESERVERS_CSV=ns1.digitalocean.com,ns2.digitalocean.com,ns3.digitalocean.com \
API_HEALTH_URL=https://wise-ravens.com/health \
bash ./scripts/ops-external-daily.sh

sudo REPO_DIR=/opt/wiseravenshare \
  DOMAIN=wise-ravens.com \
  WWW_DOMAIN=www.wise-ravens.com \
  EXPECTED_CANONICAL_HOST=wise-ravens.com \
  EXPECTED_NAMESERVERS_CSV=ns1.digitalocean.com,ns2.digitalocean.com,ns3.digitalocean.com \
  API_HEALTH_URL=https://wise-ravens.com/health \
  bash ./scripts/install-ops-agent-systemd.sh
```

## 8) Auth Security Checks

Use [SECURITY.md](SECURITY.md) for authentication configuration and production guardrails.

Run regression checks after each deployment:

```powershell
pwsh -File ./scripts/auth-regression-check.ps1 -BaseUrl https://wise-ravens.com
```

Optional allowlisted user verification:

```powershell
$cred = Get-Credential
pwsh -File ./scripts/auth-regression-check.ps1 -BaseUrl https://wise-ravens.com -ValidCredential $cred
```
