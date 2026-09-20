#!/usr/bin/env bash
set -euo pipefail

INTERVAL="${CRAWL_INTERVAL_SECONDS:-1800}"
if ! [[ "$INTERVAL" =~ ^[0-9]+$ ]] || [[ "$INTERVAL" -lt 60 ]]; then
  echo "[crawler-scheduler] Invalid CRAWL_INTERVAL_SECONDS=${INTERVAL}; defaulting to 1800"
  INTERVAL=1800
fi

echo "[crawler-scheduler] Starting loop with interval ${INTERVAL}s"

while true; do
  /opt/crawler/trigger-crawl.sh || echo "[crawler-scheduler] Trigger failed; retrying on next interval"
  sleep "$INTERVAL"
done
