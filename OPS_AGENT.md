# Wiseraven External Ops Agent

This runbook defines the day-to-day operating model for wise-ravens.com when DNS is managed with delegated nameservers.

## 1) Mission

Operate the production edge from outside the application host by validating:
- DNS delegation and records
- HTTPS edge availability for apex and www
- Canonical redirects
- API health endpoint (optional)

## 2) Daily Operations (10 minutes)

Run from repository root:

```powershell
pwsh -File ./scripts/ops-external-daily.ps1 \
  -Domain wise-ravens.com \
  -WwwDomain www.wise-ravens.com \
  -ExpectedCanonicalHost wise-ravens.com \
  -ExpectedNameservers ns1.digitalocean.com,ns2.digitalocean.com,ns3.digitalocean.com \
  -ApiHealthUrl https://wise-ravens.com/health
```

Ubuntu direct-connect command:

```bash
DOMAIN=wise-ravens.com \
WWW_DOMAIN=www.wise-ravens.com \
EXPECTED_CANONICAL_HOST=wise-ravens.com \
EXPECTED_NAMESERVERS_CSV=ns1.digitalocean.com,ns2.digitalocean.com,ns3.digitalocean.com \
API_HEALTH_URL=https://wise-ravens.com/health \
bash ./scripts/ops-external-daily.sh
```

Exit codes:
- 0: all checks passed
- 1: warning state (non-critical drift)
- 2: critical failure

## 3) Weekly Operations (30 minutes)

- Review DNS records in registrar and ensure no duplicate apex A/AAAA records exist in other providers.
- Confirm edge certificate in your CDN provider covers both hosts:
  - wise-ravens.com
  - www.wise-ravens.com
- Verify canonical policy is stable:
  - one host should 301 to the canonical host
- Run one synthetic user test (login/upload/core flow).

## 4) Incident Playbook

### Symptom: Cloudflare Error 1001

Likely causes:
- invalid target hostname behind a proxied record
- stale/missing record in authoritative DNS
- mixed DNS ownership between registrar and CDN

Response:
1. Run the daily script and capture the output.
2. Validate delegated NS match intended provider.
3. Validate apex A/AAAA and www CNAME resolve publicly.
4. Fix bad target records and wait for TTL.
5. Re-test HTTPS and redirects.

### Symptom: ERR_SSL_VERSION_OR_CIPHER_MISMATCH on apex only

Likely causes:
- edge certificate missing apex hostname
- TLS edge config active for www but not apex
- redirect from working host to broken host

Response:
1. Confirm https://www.wise-ravens.com and https://wise-ravens.com independently.
2. In CDN SSL/TLS settings, verify certificate status is Active and includes both hosts.
3. Temporarily avoid redirecting users from working host to broken host.
4. Re-enable canonical redirect only after both hosts complete TLS handshake.

## 5) Change Management Rules

- Never change DNS and TLS at the same time unless incident severity requires it.
- Keep TTL low (300) during cutover, then raise (3600) after stabilization.
- Record all changes in a simple ops log with timestamp, owner, and rollback path.

## 6) Ubuntu Automation (systemd)

Install timer/service on your DigitalOcean Ubuntu host:

```bash
sudo REPO_DIR=/opt/wiseravenshare \
  DOMAIN=wise-ravens.com \
  WWW_DOMAIN=www.wise-ravens.com \
  EXPECTED_CANONICAL_HOST=wise-ravens.com \
  EXPECTED_NAMESERVERS_CSV=ns1.digitalocean.com,ns2.digitalocean.com,ns3.digitalocean.com \
  API_HEALTH_URL=https://wise-ravens.com/health \
  bash ./scripts/install-ops-agent-systemd.sh
```

Operational commands:
- `systemctl status wiseravenshare-ops-agent.timer`
- `systemctl start wiseravenshare-ops-agent.service`
- `journalctl -u wiseravenshare-ops-agent.service -n 100 --no-pager`
- `tail -n 100 /var/log/wiseravenshare-ops-agent.log`

## 7) Optional Windows Automation

Use Windows Task Scheduler if you also want local operator checks from your workstation.
