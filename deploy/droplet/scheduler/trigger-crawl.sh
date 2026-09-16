#!/usr/bin/env bash
set -euo pipefail

require_var() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "[crawler-scheduler] Missing required env var: ${name}" >&2
    exit 2
  fi
}

require_var API_BASE_URL
require_var ADMIN_EMAIL
require_var ADMIN_PASSWORD
require_var CRAWL_START_URL

login_payload=$(jq -n \
  --arg email "$ADMIN_EMAIL" \
  --arg password "$ADMIN_PASSWORD" \
  '{email:$email, usernameOrEmail:$email, password:$password}')

login_response=$(curl -fsS -X POST "${API_BASE_URL%/}/api/auth-v2/login" \
  -H "Content-Type: application/json" \
  --data "$login_payload")

token=$(printf '%s' "$login_response" | jq -r '.token // .accessToken // .AccessToken // empty')
if [[ -z "$token" ]]; then
  echo "[crawler-scheduler] Login succeeded but no token was returned." >&2
  echo "$login_response" >&2
  exit 3
fi

if [[ "${CRAWL_SKIP_IF_RUNNING:-true}" == "true" ]]; then
  jobs_response=$(curl -fsS "${API_BASE_URL%/}/api/site-crawler/jobs?all=true" \
    -H "Authorization: Bearer ${token}")

  running_count=$(printf '%s' "$jobs_response" | jq '[.[] | select((.status // "") | ascii_downcase == "running")] | length')
  if [[ "$running_count" != "0" ]]; then
    echo "[crawler-scheduler] Skipping trigger because ${running_count} crawl job(s) are currently running."
    exit 0
  fi
fi

job_name_prefix="${CRAWL_JOB_NAME_PREFIX:-Scheduled Full Site Crawl}"
job_name="${job_name_prefix} $(date -u +'%Y-%m-%d %H:%M UTC')"

crawl_payload=$(jq -n \
  --arg startUrl "$CRAWL_START_URL" \
  --arg jobName "$job_name" \
  --arg scope "${CRAWL_SCOPE:-FullSite}" \
  --argjson maxPages "${CRAWL_MAX_PAGES:-5000}" \
  --argjson maxDepth "${CRAWL_MAX_DEPTH:-10}" \
  --argjson requestsPerSecond "${CRAWL_REQUESTS_PER_SECOND:-5}" \
  --arg renderJavaScript "${CRAWL_RENDER_JAVASCRIPT:-true}" \
  --arg respectRobotsTxt "${CRAWL_RESPECT_ROBOTS_TXT:-true}" \
  --arg followExternalLinks "${CRAWL_FOLLOW_EXTERNAL_LINKS:-false}" \
  --arg captureScreenshots "${CRAWL_CAPTURE_SCREENSHOTS:-false}" \
  '{
    startUrl:$startUrl,
    jobName:$jobName,
    scope:$scope,
    maxPages:$maxPages,
    maxDepth:$maxDepth,
    requestsPerSecond:$requestsPerSecond,
    renderJavaScript:($renderJavaScript == "true"),
    respectRobotsTxt:($respectRobotsTxt == "true"),
    followExternalLinks:($followExternalLinks == "true"),
    captureScreenshots:($captureScreenshots == "true")
  }')

create_response=$(curl -fsS -X POST "${API_BASE_URL%/}/api/site-crawler/jobs" \
  -H "Authorization: Bearer ${token}" \
  -H "Content-Type: application/json" \
  --data "$crawl_payload")

job_id=$(printf '%s' "$create_response" | jq -r '.id // empty')
if [[ -n "$job_id" ]]; then
  echo "[crawler-scheduler] Triggered crawl job ${job_id}"
else
  echo "[crawler-scheduler] Triggered crawl job, response: ${create_response}"
fi
