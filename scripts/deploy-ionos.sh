#!/usr/bin/env bash
set -euo pipefail

# One-command deploy for IONOS server
# Usage examples:
#   ./scripts/deploy-ionos.sh
#   BRANCH=main REPO_DIR=/opt/wiseravenshare ./scripts/deploy-ionos.sh

REPO_DIR="${REPO_DIR:-/opt/wiseravenshare}"
BRANCH="${BRANCH:-main}"
API_HEALTH_URL="${API_HEALTH_URL:-http://localhost:10000/health}"
API_DB_HEALTH_URL="${API_DB_HEALTH_URL:-http://localhost:10000/health/db}"

if [[ ! -d "${REPO_DIR}" ]]; then
  echo "Repository directory does not exist: ${REPO_DIR}"
  exit 1
fi

cd "${REPO_DIR}"

if [[ ! -d .git ]]; then
  echo "No git repository found in ${REPO_DIR}"
  exit 1
fi

echo "Fetching latest code..."
git fetch --all --prune

echo "Switching to branch: ${BRANCH}"
git checkout "${BRANCH}"

echo "Pulling latest commits..."
git pull --ff-only origin "${BRANCH}"

echo "Rebuilding and starting containers..."
docker compose up --build -d

echo "Container status:"
docker compose ps

echo "Waiting for API to become healthy..."
for i in {1..20}; do
  if curl -fsS "${API_HEALTH_URL}" >/dev/null; then
    break
  fi
  sleep 3
  if [[ "${i}" -eq 20 ]]; then
    echo "API health check failed: ${API_HEALTH_URL}"
    exit 1
  fi
done

echo "Verifying health endpoints..."
curl -fsS "${API_HEALTH_URL}"
echo
curl -fsS "${API_DB_HEALTH_URL}"
echo

echo "Deployment complete."
