#!/usr/bin/env bash
# Health and port check for this project's development ecosystem.
#
#   1. do Plane, Outline and Mailpit answer?
#   2. does this ecosystem hold the ports it says it holds?
#   3. has any of its containers taken a port that belongs to the project's own
#      production web server (80/443)?
#
# It knows nothing about any other project on this machine, on purpose: another
# project's stack is not this one's business.
#
#   ./integrations/health.sh          # full report
#   ./integrations/health.sh --brief  # one line per service
#
# Exit status is 0 only when every service answers and every port is accounted for.

set -euo pipefail

# shellcheck source=../lib.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib.sh"

require_cmd curl
load_env

BRIEF=0
[ "${1:-}" = "--brief" ] && BRIEF=1

failures=0

probe() {
  local label="$1" url="$2" code
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "$url" || true)"
  printf '  %-9s %-36s HTTP %s\n' "$label" "$url" "${code:-none}"
  printf '%s' "$code" | grep -q '^[23]'
}

containers_matching() {
  docker ps --format '{{.Names}}' 2>/dev/null | grep -E "$1" || true
}

if [ "$BRIEF" -eq 0 ]; then
  printf '\n%s development ecosystem (slug: %s)\n' "${PROJECT_NAME}" "${PROJECT_SLUG}"
fi

probe "Outline" "$(outline_url)/_health" || failures=$((failures + 1))
probe "Plane"   "$(plane_url)/"          || failures=$((failures + 1))
probe "Mailpit" "$(mailpit_url)/"        || failures=$((failures + 1))

if [ "$BRIEF" -eq 0 ]; then
  messages="?"
  if curl -s --max-time 8 "$(mailpit_url)/api/v1/messages" >/dev/null 2>&1; then
    messages="$(curl -s --max-time 8 "$(mailpit_url)/api/v1/messages" | jq -r '.total // "?"' 2>/dev/null || printf '?')"
  fi
  printf '  %-9s %s message(s) held\n' "" "$messages"

  printf '\nContainers (this ecosystem only)\n'
  printf '  %-9s %s\n' "plane" "$(containers_matching "^${PLANE_COMPOSE_PROJECT}-" | tr '\n' ' ')"
  printf '  %-9s %s\n' "outline" "$(containers_matching "^${OUTLINE_COMPOSE_PROJECT}-" | tr '\n' ' ')"
  printf '  %-9s %s\n' "mail" "$(containers_matching "^${MAILPIT_CONTAINER}$" | tr '\n' ' ')"

  printf '\nPorts\n'
fi

# Every port this ecosystem publishes must be held by this ecosystem's own
# containers. A port held by anything else means two projects are fighting over
# it - which is exactly what the probed port block exists to prevent.
ours="^(${PLANE_COMPOSE_PROJECT}-|${OUTLINE_COMPOSE_PROJECT}-|${MAILPIT_CONTAINER}$)"
for spec in \
  "${PLANE_HTTP_PORT}:Plane web" \
  "${PLANE_HTTPS_PORT}:Plane HTTPS" \
  "${PLANE_SMTP_PORT_25}:Plane intake 25" \
  "${PLANE_SMTP_PORT_465}:Plane intake 465" \
  "${PLANE_SMTP_PORT_587}:Plane intake 587" \
  "${OUTLINE_HTTP_PORT}:Outline" \
  "${MAILPIT_SMTP_PORT}:Mailpit SMTP" \
  "${MAILPIT_HTTP_PORT}:Mailpit inbox" ; do
  port="${spec%%:*}"
  what="${spec#*:}"
  holder="$(port_holder "$port")"
  if [ -z "$holder" ]; then
    [ "$BRIEF" -eq 0 ] && printf '  %-6s %-18s free (not running)\n' "$port" "$what"
    continue
  fi
  if printf '%s' "$holder" | grep -Eq "$ours"; then
    [ "$BRIEF" -eq 0 ] && printf '  %-6s %-18s %s\n' "$port" "$what" "$holder"
    continue
  fi
  printf '  %-6s %-18s TAKEN BY %s\n' "$port" "$what" "$holder"
  failures=$((failures + 1))
done

# 80 and 443 belong to whichever web server fronts the project in production.
if containers_matching "^(${PLANE_COMPOSE_PROJECT}-|${OUTLINE_COMPOSE_PROJECT}-|${MAIL_COMPOSE_PROJECT}-)" | while read -r name; do
  docker ps --filter "name=^${name}$" --format '{{.Ports}}' | grep -qE '(^|,)0\.0\.0\.0:(80|443)->' && echo "$name"
done | grep -q .; then
  printf '  80/443 is published by one of this ecosystem'"'"'s containers - it must not be\n'
  failures=$((failures + 1))
elif [ "$BRIEF" -eq 0 ]; then
  printf '  %-6s %-18s free for the project'"'"'s own web server\n' "80/443" ""
fi

printf '\n'
if [ "$failures" -eq 0 ]; then
  printf 'All three services answer, and every port this ecosystem publishes is its own.\n\n'
  exit 0
fi
printf '%s check(s) failed - see above.\n\n' "$failures" >&2
exit 1
