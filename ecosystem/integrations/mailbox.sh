#!/usr/bin/env bash
# Show what the local mail sink is holding, and pull out any links in it.
#
# Nothing in this infrastructure sends real mail: Plane's invitations and
# password resets, and Outline's magic sign-in link, all land in Mailpit. The
# web inbox is at http://<host>:8025, but the sign-in link is the one thing you
# need from it, so this prints it ready to open.
#
#   ./integrations/mailbox.sh                  # latest 10, links included
#   ./integrations/mailbox.sh --limit 30
#   ./integrations/mailbox.sh --search outline  # Mailpit's search syntax
#   ./integrations/mailbox.sh --links-only      # just the URLs
#
# If Outline's link is missing, request one first:
#   open http://<host>:8090 and enter an address, or ask Plane to send an
#   invitation - then run this again.

set -euo pipefail

# shellcheck source=../lib.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib.sh"

require_cmd curl
require_cmd jq

LIMIT=10
SEARCH=""
LINKS_ONLY=0
usage() { sed -n '2,18p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

while [ $# -gt 0 ]; do
  case "$1" in
    --limit) LIMIT="${2:?--limit needs a number}"; shift 2 ;;
    --limit=*) LIMIT="${1#*=}"; shift ;;
    --search) SEARCH="${2:?--search needs a query}"; shift 2 ;;
    --search=*) SEARCH="${1#*=}"; shift ;;
    --links-only) LINKS_ONLY=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown argument: $1 (try --help)" ;;
  esac
done

load_env
BASE="$(mailpit_url)"

if ! curl -sS -o /dev/null --max-time 8 "${BASE}/" 2>/dev/null; then
  die "Mailpit is not answering at ${BASE} - start it with: make mail-up"
fi

if [ -n "$SEARCH" ]; then
  encoded="$(printf '%s' "$SEARCH" | jq -sRr @uri)"
  payload="$(curl -sS --max-time 15 "${BASE}/api/v1/search?query=${encoded}")"
else
  payload="$(curl -sS --max-time 15 "${BASE}/api/v1/messages?limit=${LIMIT}")"
fi

total="$(printf '%s' "$payload" | jq -r '.total // (.messages | length)')"
ids="$(printf '%s' "$payload" | jq -r --argjson n "$LIMIT" '.messages[:$n][] | .ID' 2>/dev/null || true)"

if [ -z "$ids" ]; then
  printf '\nMailpit at %s holds no matching message.\n' "$BASE"
  if [ -n "$SEARCH" ]; then
    printf 'Nothing matched "%s".\n\n' "$SEARCH"
  else
    cat <<EOF
To make some arrive:
  - Outline sign-in: open $(outline_url), enter an address, and it mails a link here
  - Plane invitation: invite somebody in Plane (its god-mode Email must point at
    mailpit:${MAILPIT_SMTP_PORT})
  - a test message: printf 'Subject: test\\n\\nhello' | curl -s --mail-from a@b \\
      --mail-rcpt c@d smtp://127.0.0.1:${MAILPIT_SMTP_PORT}

EOF
  fi
  exit 0
fi

[ "$LINKS_ONLY" -eq 0 ] && printf '\nMailpit at %s - %s message(s), showing %s\n\n' \
  "$BASE" "$total" "$(printf '%s\n' "$ids" | grep -c .)"

links_shown=0
while IFS= read -r id; do
  [ -n "$id" ] || continue
  message="$(curl -sS --max-time 15 "${BASE}/api/v1/message/${id}")"
  subject="$(printf '%s' "$message" | jq -r '.Subject // "(no subject)"')"
  from="$(printf '%s' "$message" | jq -r '.From.Address // "?"')"
  to="$(printf '%s' "$message" | jq -r '(.To // []) | map(.Address) | join(", ")')"
  # The list endpoint calls this field Created; the single-message endpoint
  # calls the same value Date. Accept either.
  created="$(printf '%s' "$message" | jq -r '.Date // .Created // ""' | cut -c1-19 | tr 'T' ' ')"

  # Links live in either the text or the HTML part; &amp; is the usual HTML
  # escaping to undo before the URL is usable.
  links="$(printf '%s' "$message" \
    | jq -r '[.Text, .HTML] | map(select(. != null)) | join(" ")' \
    | grep -oE 'https?://[^ "<>]+' \
    | sed -e 's/&amp;/\&/g' -e 's/[.,;]$//' \
    | sort -u | head -3 || true)"

  if [ "$LINKS_ONLY" -eq 1 ]; then
    [ -n "$links" ] && printf '%s\n' "$links"
  else
    printf '  %s  %s -> %s\n' "$created" "$from" "$to"
    printf '    %s\n' "$subject"
    if [ -n "$links" ]; then
      printf '%s\n' "$links" | sed 's/^/    link: /'
      links_shown=$((links_shown + 1))
    fi
    printf '\n'
  fi
done <<EOF
$ids
EOF

if [ "$LINKS_ONLY" -eq 0 ]; then
  if [ "$links_shown" -eq 0 ]; then
    printf '  No links in these messages. The Outline sign-in link appears after you\n'
    printf '  request one at %s.\n\n' "$(outline_url)"
  else
    printf '  Open a link above to finish signing in. Outline has no password login:\n'
    printf '  the magic link is the only way in, and it is valid once.\n\n'
  fi
fi
