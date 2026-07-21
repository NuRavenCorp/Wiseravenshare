#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DOMAIN:-wise-ravens.com}"
WWW_DOMAIN="${WWW_DOMAIN:-www.wise-ravens.com}"
EXPECTED_CANONICAL_HOST="${EXPECTED_CANONICAL_HOST:-wise-ravens.com}"
EXPECTED_NAMESERVERS_CSV="${EXPECTED_NAMESERVERS_CSV:-ns1.digitalocean.com,ns2.digitalocean.com,ns3.digitalocean.com}"
API_HEALTH_URL="${API_HEALTH_URL:-https://wise-ravens.com/health}"
TIMEOUT_SECS="${TIMEOUT_SECS:-20}"

IFS=',' read -r -a EXPECTED_NAMESERVERS <<< "${EXPECTED_NAMESERVERS_CSV}"

fail_count=0
warn_count=0

declare -a rows

add_row() {
  local check="$1"
  local status="$2"
  local details="$3"
  rows+=("${check}|${status}|${details}")

  if [[ "${status}" == "fail" ]]; then
    fail_count=$((fail_count + 1))
  elif [[ "${status}" == "warn" ]]; then
    warn_count=$((warn_count + 1))
  fi
}

join_by_comma() {
  local IFS=', '
  echo "$*"
}

# NS delegation
if ns_output="$(dig +short NS "${DOMAIN}" 2>/dev/null)" && [[ -n "${ns_output}" ]]; then
  mapfile -t ns_records < <(printf '%s\n' "${ns_output}" | sed 's/\.$//' | sort -u)
  add_row "dns_ns" "ok" "$(join_by_comma "${ns_records[@]}")"

  mapfile -t expected_ns < <(printf '%s\n' "${EXPECTED_NAMESERVERS[@]}" | sed 's/\.$//' | tr '[:upper:]' '[:lower:]' | sort -u)
  mapfile -t actual_ns < <(printf '%s\n' "${ns_records[@]}" | tr '[:upper:]' '[:lower:]' | sort -u)

  if [[ "$(printf '%s\n' "${expected_ns[@]}")" == "$(printf '%s\n' "${actual_ns[@]}")" ]]; then
    add_row "dns_ns_expected" "ok" "Delegation matches expected nameservers"
  else
    add_row "dns_ns_expected" "warn" "Expected: $(join_by_comma "${expected_ns[@]}") | Actual: $(join_by_comma "${actual_ns[@]}")"
  fi
else
  add_row "dns_ns" "fail" "Could not resolve NS records for ${DOMAIN}"
fi

# A / AAAA records
if a_output="$(dig +short A "${DOMAIN}" 2>/dev/null)" && [[ -n "${a_output}" ]]; then
  mapfile -t a_records < <(printf '%s\n' "${a_output}" | sort -u)
  add_row "dns_a" "ok" "$(join_by_comma "${a_records[@]}")"
else
  add_row "dns_a" "fail" "No A record values returned"
fi

if aaaa_output="$(dig +short AAAA "${DOMAIN}" 2>/dev/null)" && [[ -n "${aaaa_output}" ]]; then
  mapfile -t aaaa_records < <(printf '%s\n' "${aaaa_output}" | sort -u)
  add_row "dns_aaaa" "ok" "$(join_by_comma "${aaaa_records[@]}")"
else
  add_row "dns_aaaa" "fail" "No AAAA record values returned"
fi

# WWW CNAME
if cname_output="$(dig +short CNAME "${WWW_DOMAIN}" 2>/dev/null)" && [[ -n "${cname_output}" ]]; then
  cname_clean="$(printf '%s' "${cname_output}" | head -n1 | sed 's/\.$//')"
  add_row "dns_www_cname" "ok" "${WWW_DOMAIN} -> ${cname_clean}"
else
  add_row "dns_www_cname" "warn" "No CNAME found for ${WWW_DOMAIN}"
fi

curl_head() {
  local url="$1"
  curl -I -sS --max-time "${TIMEOUT_SECS}" "${url}" 2>&1
}

# HTTPS checks
if apex_headers="$(curl_head "https://${DOMAIN}")"; then
  apex_code="$(printf '%s\n' "${apex_headers}" | awk '/^HTTP/{print $2}' | tail -n1)"
  add_row "https_apex" "ok" "HTTP ${apex_code:-unknown}"
else
  add_row "https_apex" "fail" "$(printf '%s' "${apex_headers}" | tr '\n' ' ' | sed 's/  */ /g')"
fi

if www_headers="$(curl_head "https://${WWW_DOMAIN}")"; then
  www_code="$(printf '%s\n' "${www_headers}" | awk '/^HTTP/{print $2}' | tail -n1)"
  add_row "https_www" "ok" "HTTP ${www_code:-unknown}"

  location_header="$(printf '%s\n' "${www_headers}" | awk 'BEGIN{IGNORECASE=1}/^Location:/{print $2}' | tr -d '\r' | tail -n1)"
  if [[ -n "${location_header}" ]]; then
    if [[ "${location_header}" == https://${EXPECTED_CANONICAL_HOST}* ]]; then
      add_row "canonical_redirect" "ok" "www redirects to ${location_header}"
    else
      add_row "canonical_redirect" "warn" "Unexpected redirect target: ${location_header}"
    fi
  fi
else
  add_row "https_www" "fail" "$(printf '%s' "${www_headers}" | tr '\n' ' ' | sed 's/  */ /g')"
fi

# Optional API check
if [[ -n "${API_HEALTH_URL}" ]]; then
  if api_headers="$(curl_head "${API_HEALTH_URL}")"; then
    api_code="$(printf '%s\n' "${api_headers}" | awk '/^HTTP/{print $2}' | tail -n1)"
    add_row "api_health" "ok" "HTTP ${api_code:-unknown}"
  else
    add_row "api_health" "fail" "$(printf '%s' "${api_headers}" | tr '\n' ' ' | sed 's/  */ /g')"
  fi
fi

echo "Ops external daily report - $(date -Iseconds)"
printf '%-20s %-8s %s\n' "check" "status" "details"
printf '%-20s %-8s %s\n' "-----" "------" "-------"

for row in "${rows[@]}"; do
  IFS='|' read -r check status details <<< "${row}"
  printf '%-20s %-8s %s\n' "${check}" "${status}" "${details}"
done

echo "Summary: fail=${fail_count} warn=${warn_count}"

if [[ ${fail_count} -gt 0 ]]; then
  exit 2
elif [[ ${warn_count} -gt 0 ]]; then
  exit 1
fi

exit 0
