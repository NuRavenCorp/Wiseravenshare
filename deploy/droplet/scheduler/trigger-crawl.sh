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

resolve_start_urls() {
  local raw="${CRAWL_START_URLS:-${CRAWL_START_URL:-}}"
  if [[ -z "${raw// }" ]]; then
    echo "[crawler-scheduler] Missing required env var: CRAWL_START_URLS or CRAWL_START_URL" >&2
    exit 2
  fi

  printf '%s' "$raw" | tr ',' '\n' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' | awk 'NF'
}

extract_host() {
  local url="$1"
  printf '%s' "$url" | sed -E 's#^[a-zA-Z][a-zA-Z0-9+.-]*://##; s#/.*$##'
}

wait_for_job_completion() {
  local job_id="$1"
  local target_url="$2"
  local poll_seconds="${CRAWL_JOB_POLL_SECONDS:-30}"
  local timeout_seconds="${CRAWL_JOB_TIMEOUT_SECONDS:-0}"
  local elapsed=0

  while true; do
    local job_response status
    if ! job_response=$(curl -fsS "${API_BASE_URL%/}/api/site-crawler/jobs/${job_id}" \
      -H "Authorization: Bearer ${token}"); then
      echo "[crawler-scheduler] Failed to poll crawl job ${job_id} for ${target_url}" >&2
      return 1
    fi
    status=$(printf '%s' "$job_response" | jq -r '.status // empty' | tr '[:upper:]' '[:lower:]')

    case "$status" in
      completed)
        echo "[crawler-scheduler] Crawl job ${job_id} for ${target_url} completed"
        return 0
        ;;
      failed|cancelled)
        echo "[crawler-scheduler] Crawl job ${job_id} for ${target_url} ended with status ${status}" >&2
        return 1
        ;;
      running|pending|paused)
        ;;
      *)
        echo "[crawler-scheduler] Crawl job ${job_id} for ${target_url} returned unexpected status: ${status:-unknown}" >&2
        return 1
        ;;
    esac

    if [[ "$timeout_seconds" -gt 0 && "$elapsed" -ge "$timeout_seconds" ]]; then
      echo "[crawler-scheduler] Crawl job ${job_id} for ${target_url} timed out after ${timeout_seconds}s" >&2
      return 1
    fi

    sleep "$poll_seconds"
    elapsed=$((elapsed + poll_seconds))
  done
}

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
  if ! jobs_response=$(curl -fsS "${API_BASE_URL%/}/api/site-crawler/jobs?all=true" \
    -H "Authorization: Bearer ${token}"); then
    echo "[crawler-scheduler] Failed to query active crawl jobs; continuing with trigger" >&2
    jobs_response="[]"
  fi

  running_count=$(printf '%s' "$jobs_response" | jq '[.[] | select((.status // "") | ascii_downcase == "running")] | length')
  if [[ "$running_count" != "0" ]]; then
    echo "[crawler-scheduler] Skipping trigger because ${running_count} crawl job(s) are currently running."
    exit 0
  fi
fi

job_name_prefix="${CRAWL_JOB_NAME_PREFIX:-Scheduled Full Site Crawl}"
overall_failure=0

while IFS= read -r start_url; do
  [[ -n "$start_url" ]] || continue

  host="$(extract_host "$start_url")"
  job_name="${job_name_prefix} - ${host} $(date -u +'%Y-%m-%d %H:%M UTC')"

  crawl_payload=$(jq -n \
    --arg startUrl "$start_url" \
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

  if ! create_response=$(curl -fsS -X POST "${API_BASE_URL%/}/api/site-crawler/jobs" \
    -H "Authorization: Bearer ${token}" \
    -H "Content-Type: application/json" \
    --data "$crawl_payload"); then
    echo "[crawler-scheduler] Failed to trigger crawl job for ${start_url}" >&2
    overall_failure=1
    continue
  fi

  job_id=$(printf '%s' "$create_response" | jq -r '.id // empty')
  if [[ -n "$job_id" ]]; then
    echo "[crawler-scheduler] Triggered crawl job ${job_id} for ${start_url}"
    if ! wait_for_job_completion "$job_id" "$start_url"; then
      overall_failure=1
    fi
  else
    echo "[crawler-scheduler] Triggered crawl job for ${start_url}, response: ${create_response}"
    overall_failure=1
  fi
done < <(resolve_start_urls)

exit "$overall_failure"
