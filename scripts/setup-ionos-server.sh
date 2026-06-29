#!/usr/bin/env bash
set -euo pipefail

# IONOS Ubuntu server bootstrap for Wiseravenshare
# Usage:
#   sudo DOMAIN=wiseravenshare.com WWW_DOMAIN=www.wiseravenshare.com EMAIL=admin@example.com ./scripts/setup-ionos-server.sh

DOMAIN="${DOMAIN:-wiseravenshare.com}"
WWW_DOMAIN="${WWW_DOMAIN:-www.wiseravenshare.com}"
EMAIL="${EMAIL:-admin@${DOMAIN}}"
REPO_DIR="${REPO_DIR:-/opt/wiseravenshare}"
WEB_ROOT="${WEB_ROOT:-/var/www/wiseravenshare}"
NGINX_SITE="/etc/nginx/sites-available/wiseravenshare"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo ./scripts/setup-ionos-server.sh"
  exit 1
fi

apt-get update
apt-get install -y ca-certificates curl gnupg lsb-release nginx certbot python3-certbot-nginx

install -m 0755 -d /etc/apt/keyrings
if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
fi

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" > /etc/apt/sources.list.d/docker.list

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

mkdir -p "${WEB_ROOT}"
mkdir -p "${REPO_DIR}"

cat > "${NGINX_SITE}" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} ${WWW_DOMAIN};

    root ${WEB_ROOT};
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://localhost:10000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /ws/ {
        proxy_pass http://localhost:10000/ws/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
EOF

ln -sf "${NGINX_SITE}" /etc/nginx/sites-enabled/wiseravenshare
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx
systemctl reload nginx

certbot --nginx -d "${DOMAIN}" -d "${WWW_DOMAIN}" --non-interactive --agree-tos -m "${EMAIL}" --redirect

systemctl enable docker
systemctl start docker

echo "Bootstrap complete."
echo "Next steps:"
echo "1) Deploy the repository into ${REPO_DIR}"
echo "2) Run: cd ${REPO_DIR} && docker compose up --build -d"
echo "3) Verify: curl -s http://localhost:10000/health"
