#!/usr/bin/env bash
set -euo pipefail

# Installs a systemd service + timer to run external ops checks daily on Ubuntu.
# Usage:
#   sudo REPO_DIR=/opt/wiseravenshare \
#     DOMAIN=wise-ravens.com \
#     WWW_DOMAIN=www.wise-ravens.com \
#     EXPECTED_CANONICAL_HOST=wise-ravens.com \
#     EXPECTED_NAMESERVERS_CSV=ns1.digitalocean.com,ns2.digitalocean.com,ns3.digitalocean.com \
#     API_HEALTH_URL=https://wise-ravens.com/health \
#     ./scripts/install-ops-agent-systemd.sh

REPO_DIR="${REPO_DIR:-/opt/wiseravenshare}"
DOMAIN="${DOMAIN:-wise-ravens.com}"
WWW_DOMAIN="${WWW_DOMAIN:-www.wise-ravens.com}"
EXPECTED_CANONICAL_HOST="${EXPECTED_CANONICAL_HOST:-wise-ravens.com}"
EXPECTED_NAMESERVERS_CSV="${EXPECTED_NAMESERVERS_CSV:-ns1.digitalocean.com,ns2.digitalocean.com,ns3.digitalocean.com}"
API_HEALTH_URL="${API_HEALTH_URL:-https://wise-ravens.com/health}"
TIMEOUT_SECS="${TIMEOUT_SECS:-20}"
RUN_USER="${RUN_USER:-root}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo ./scripts/install-ops-agent-systemd.sh"
  exit 1
fi

if [[ ! -d "${REPO_DIR}" ]]; then
  echo "Repository directory does not exist: ${REPO_DIR}"
  exit 1
fi

if [[ ! -f "${REPO_DIR}/scripts/ops-external-daily.sh" ]]; then
  echo "Missing script: ${REPO_DIR}/scripts/ops-external-daily.sh"
  exit 1
fi

chmod +x "${REPO_DIR}/scripts/ops-external-daily.sh"

if ! command -v dig >/dev/null 2>&1; then
  apt-get update
  apt-get install -y dnsutils
fi

if ! command -v curl >/dev/null 2>&1; then
  apt-get update
  apt-get install -y curl
fi

cat >/etc/systemd/system/wiseravenshare-ops-agent.service <<EOF
[Unit]
Description=Wiseravenshare External Ops Daily Check
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=${RUN_USER}
WorkingDirectory=${REPO_DIR}
Environment=DOMAIN=${DOMAIN}
Environment=WWW_DOMAIN=${WWW_DOMAIN}
Environment=EXPECTED_CANONICAL_HOST=${EXPECTED_CANONICAL_HOST}
Environment=EXPECTED_NAMESERVERS_CSV=${EXPECTED_NAMESERVERS_CSV}
Environment=API_HEALTH_URL=${API_HEALTH_URL}
Environment=TIMEOUT_SECS=${TIMEOUT_SECS}
ExecStart=${REPO_DIR}/scripts/ops-external-daily.sh
StandardOutput=append:/var/log/wiseravenshare-ops-agent.log
StandardError=append:/var/log/wiseravenshare-ops-agent.log
EOF

cat >/etc/systemd/system/wiseravenshare-ops-agent.timer <<EOF
[Unit]
Description=Run Wiseravenshare External Ops Daily Check

[Timer]
OnCalendar=*-*-* 08:00:00
Persistent=true
Unit=wiseravenshare-ops-agent.service

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable wiseravenshare-ops-agent.timer
systemctl restart wiseravenshare-ops-agent.timer

# Run once immediately so there is a baseline log entry.
systemctl start wiseravenshare-ops-agent.service

echo "Installed and started timer: wiseravenshare-ops-agent.timer"
echo "Check status: systemctl status wiseravenshare-ops-agent.timer"
echo "Run manually: systemctl start wiseravenshare-ops-agent.service"
echo "Logs: tail -n 100 /var/log/wiseravenshare-ops-agent.log"
