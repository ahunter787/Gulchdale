#!/usr/bin/env bash
# Mirror this project's plan into Plane as work items, idempotently.
#
# What it reads (the repository is the source of truth for the plan):
#   docs/roadmap.md      the phase table      -> one work item per phase
#   docs/extensions.md   the register table   -> one work item per extension
#
# What it writes: Plane work items in the configured project, each carrying a
# stable marker comment (`<!-- ecosystem-key: phase-06 -->`) so a re-run updates the
# existing item instead of creating another one. Items are never deleted, and
# nothing is written back into git: Plane is the ticket system, these documents
# are the specification.
#
# Dry run by default: nothing is written without --apply.
#
#   ./integrations/sync-roadmap.sh              # show what would change
#   ./integrations/sync-roadmap.sh --apply      # write
#   ./integrations/sync-roadmap.sh --print-plan # what was parsed, no credentials needed
#   ./integrations/sync-roadmap.sh --check      # verify the token and the project
#   ./integrations/sync-roadmap.sh --api-version v1
#
# Needs secrets/plane.env with PLANE_API_KEY, PLANE_WORKSPACE_SLUG and
# PLANE_PROJECT_ID (see README.md for where each comes from).

set -euo pipefail

# shellcheck source=../lib.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib.sh"

require_cmd jq
require_cmd sha256sum

APPLY=0
CHECK=0
PRINT_PLAN=0
API_VERSION="auto"
usage() { sed -n '2,25p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1; shift ;;
    --check) CHECK=1; shift ;;
    --print-plan) PRINT_PLAN=1; shift ;;
    --api-version) API_VERSION="${2:?--api-version needs v1 or v2}"; shift 2 ;;
    --api-version=*) API_VERSION="${1#*=}"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown argument: $1 (try --help)" ;;
  esac
done

load_env
require_project

# What this script last wrote, so a re-run that changes nothing writes nothing.
# The alternative - comparing against what Plane returns - does not work: the
# v1 list omits `state` entirely, and Plane wraps every description in a <span>,
# so a comparison would report a difference on every run and patch every item
# forever. The hash is of the exact body this script sends.
STATE_FILE="${STATE_DIR}/plane.json"
ensure_dir "$STATE_DIR"
[ -f "$STATE_FILE" ] || printf '{}\n' > "$STATE_FILE"

# --- Read the plan from the repository --------------------------------------
# Each parser stops at the end of the table it recognises, so the other tables
# in these documents (milestones, open questions) are not mistaken for work.
phases="$(awk '
  /^\| Phase \| Scope \| Status \|/ { in_table = 1; next }
  in_table && /^\|/ {
    if ($0 ~ /^\| *-/) next
    n = split($0, f, "|")
    phase = f[2]; scope = f[3]; status = f[4]
    gsub(/^[ \t]+|[ \t]+$/, "", phase)
    gsub(/^[ \t]+|[ \t]+$/, "", scope)
    gsub(/^[ \t]+|[ \t]+$/, "", status)
    printf "%s\t%s\t%s\n", phase, scope, status
    next
  }
  in_table { exit }
' "$PROJECT_ROOT/docs/roadmap.md")"

extensions="$(awk '
  /^\| # \| What it is \| Kind \| Status \|/ { in_table = 1; next }
  in_table && /^\|/ {
    if ($0 ~ /^\| *-/) next
    n = split($0, f, "|")
    id = f[2]; what = f[3]; kind = f[4]; status = f[5]
    gsub(/^[ \t]+|[ \t]+$/, "", id); gsub(/\*/, "", id)
    gsub(/^[ \t]+|[ \t]+$/, "", what); gsub(/\*/, "", what)
    gsub(/^[ \t]+|[ \t]+$/, "", kind)
    gsub(/^[ \t]+|[ \t]+$/, "", status)
    if (id !~ /^E[0-9]+$/) next
    printf "%s\t%s\t%s\t%s\n", id, what, kind, status
    next
  }
  in_table { exit }
' "$PROJECT_ROOT/docs/extensions.md")"

# An empty table is a legitimate state, not a broken one: the scaffold ships both
# documents with their headers and no rows, so that a project which has not stated
# a plan yet mirrors nothing rather than inventing placeholder work. Only a
# *missing* header means the format has actually changed - saying "has the format
# changed?" about an empty table sends the reader looking for a problem that is
# not there.
roadmap_header='^\|[[:space:]]*Phase[[:space:]]*\|[[:space:]]*Scope[[:space:]]*\|[[:space:]]*Status[[:space:]]*\|'
extensions_header='^\|[[:space:]]*#[[:space:]]*\|[[:space:]]*What it is[[:space:]]*\|[[:space:]]*Kind[[:space:]]*\|[[:space:]]*Status[[:space:]]*\|'

if [ -z "$phases" ]; then
  if grep -qE "$roadmap_header" "$PROJECT_ROOT/docs/roadmap.md" 2>/dev/null; then
    log "the roadmap table is empty - nothing to mirror yet"
  else
    die "no '| Phase | Scope | Status |' table in docs/roadmap.md - has the format changed?"
  fi
fi

if [ -z "$extensions" ]; then
  if grep -qE "$extensions_header" "$PROJECT_ROOT/docs/extensions.md" 2>/dev/null; then
    log "the extensions register is empty - nothing to mirror yet"
  else
    warn "no '| # | What it is | Kind | Status |' table in docs/extensions.md - has the format changed?"
  fi
fi

# A coarse state group, derived from the words the documents already use.
# Plane state names are chosen per project, but the *group* of a state
# (backlog/unstarted/started/completed/cancelled) is stable, so the mapping is
# by group rather than by name.
state_group_for() {
  local status="$1"
  # The documents write `main` in backticks in places ("In `main`"); drop them
  # so the patterns below can match the words rather than the formatting.
  status="${status//\`/}"
  case "$status" in
    *Complete*|*complete*|*Built*|*built*|*"In main"*) printf 'completed' ;;
    *Building*|*building*|*"In progress"*) printf 'started' ;;
    *Next*|*next*) printf 'unstarted' ;;
    *Withdrawn*) printf 'cancelled' ;;
    # A blocked phase is still a phase nobody has started; Plane has no
    # "blocked" group, and the words are in the description either way.
    *) printf 'backlog' ;;
  esac
}

if [ "$PRINT_PLAN" -eq 1 ]; then
  step "parsed from docs/roadmap.md"
  printf '  %-12s %-9s %s\n' "KEY" "STATE" "NAME"
  while IFS="$(printf '\t')" read -r phase scope status; do
    [ -n "$phase" ] || continue
    printf '  %-12s %-9s Phase %s — %s  [%s]\n' \
      "phase-$(printf '%02d' "$phase")" "$(state_group_for "$status")" "$phase" "$scope" "$status"
  done <<EOF
$phases
EOF
  step "parsed from docs/extensions.md"
  printf '  %-12s %-9s %s\n' "KEY" "STATE" "NAME"
  while IFS="$(printf '\t')" read -r id what kind status; do
    [ -n "$id" ] || continue
    printf '  %-12s %-9s %s — %s  [%s: %s]\n' \
      "extension-$(printf '%s' "$id" | tr 'A-Z' 'a-z')" "$(state_group_for "$status")" "$id" "$what" "$kind" "$status"
  done <<EOF
$extensions
EOF
  printf '\n  nothing was written and no credentials were read.\n\n'
  exit 0
fi

require_cmd curl
load_secrets "${SECRETS_DIR}/plane.env" PLANE_API_KEY PLANE_WORKSPACE_SLUG PLANE_PROJECT_ID
PLANE_URL="$(plane_url)"
OUTLINE_URL="$(outline_url)"

# --- Plane API --------------------------------------------------------------
# Plane 3.x exposes both /api/v1/ (issues) and /api/v2/ (work items). The sync
# prefers v1 because v1 returns `description_html`, which is where the
# idempotency marker lives. The v2 work-items API does not return descriptions
# at all - its own `fields` parameter lists the permitted fields and
# description_html is not among them - so on a v2-only instance a re-run can
# only match by item name, and the script says so when that happens.
REPLY_CODE=""
REPLY_BODY=""
api_call() {
  # Not a command substitution: it sets REPLY_CODE/REPLY_BODY, because a
  # `$( )` would run it in a subshell and the caller would see neither.
  local method="$1" path="$2" body="${3:-}" out
  local args=(-sS --max-time 30 -X "$method" "${PLANE_URL}/api/${API_VERSION}${path}"
    -H "X-API-Key: ${PLANE_API_KEY}" -H 'Content-Type: application/json')
  [ -n "$body" ] && args+=(-d "$body")
  out="$(curl "${args[@]}" -w $'\n%{http_code}' || true)"
  REPLY_CODE="${out##*$'\n'}"
  REPLY_BODY="${out%$'\n'*}"
}

# Anything that is not 2xx is a failure, whatever the body says. That is not
# pedantry: a rate-limited response (HTTP 429) carries no "error" key, so a
# check that only looks for one reports success while nothing was written.
check_reply() {
  local what="$1"
  case "$REPLY_CODE" in
    2*) ;;
    429) die "Plane rate-limited the API key while ${what} (HTTP 429).
This instance sets API_KEY_RATE_LIMIT in plane/overrides.env; raise it and
re-apply with: make plane-install" ;;
    401|403) die "Plane refused the API key while ${what} (HTTP ${REPLY_CODE}). Check PLANE_API_KEY in secrets/plane.env." ;;
    "") die "Plane gave no answer while ${what} - is it running? (make health)" ;;
    *) die "Plane returned HTTP ${REPLY_CODE} while ${what}: $(printf '%s' "$REPLY_BODY" | head -c 300)" ;;
  esac
  if printf '%s' "$REPLY_BODY" | jq -e 'type == "object" and (.error != null or .code == "rate_limited" or .code == "invalid_request")' >/dev/null 2>&1; then
    die "Plane rejected ${what}: $(printf '%s' "$REPLY_BODY" | jq -c '.error // .detail // .')"
  fi
}

probe_version() {
  local version path code
  for version in v1 v2; do
    if [ "$version" = v2 ]; then
      path="/workspaces/${PLANE_WORKSPACE_SLUG}/projects/${PLANE_PROJECT_ID}/work-items/"
    else
      path="/workspaces/${PLANE_WORKSPACE_SLUG}/projects/${PLANE_PROJECT_ID}/issues/"
    fi
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "${PLANE_URL}/api/${version}${path}" \
      -H "X-API-Key: ${PLANE_API_KEY}" || true)"
    case "$code" in
      200) printf '%s' "$version"; return 0 ;;
      401|403) die "Plane refused the API key (HTTP ${code}) on /api/${version}. Check PLANE_API_KEY in secrets/plane.env." ;;
    esac
  done
  die "neither /api/v1/issues nor /api/v2/work-items answered 200 for workspace ${PLANE_WORKSPACE_SLUG},
project ${PLANE_PROJECT_ID}. Check the slug and the project id: the slug is the first path segment of
the workspace URL, and the project id is the UUID in the project's settings URL."
}

if [ "$API_VERSION" = "auto" ]; then
  API_VERSION="$(probe_version)"
  log "Plane API version detected: ${API_VERSION}"
fi

ITEMS_PATH="/workspaces/${PLANE_WORKSPACE_SLUG}/projects/${PLANE_PROJECT_ID}/work-items/"
STATES_PATH="/workspaces/${PLANE_WORKSPACE_SLUG}/projects/${PLANE_PROJECT_ID}/states/"
if [ "$API_VERSION" = "v1" ]; then
  ITEMS_PATH="/workspaces/${PLANE_WORKSPACE_SLUG}/projects/${PLANE_PROJECT_ID}/issues/"
fi

if [ "$CHECK" -eq 1 ]; then
  step "check"
  api_call GET "${ITEMS_PATH}?limit=100"
  check_reply "reading the project's work items"
  response="$REPLY_BODY"
  count="$(printf '%s' "$response" | jq -r 'if type=="array" then length elif has("total_count") then .total_count elif .data then (.data|length) elif .results then (.results|length) else "?" end' 2>/dev/null || printf '?')"
  log "Plane ${PLANE_URL} answered on /api/${API_VERSION}; the project holds ${count} work item(s)"
  log "run it without --check (and with --apply) to mirror the plan"
  exit 0
fi

api_call GET "$STATES_PATH"
check_reply "reading the project's states"
states_body="$REPLY_BODY"
state_ids="$(printf '%s' "$states_body" | jq -r '
  (if type == "array" then . else (.results // .data // []) end)
  | .[] | select(.group != null) | "\(.group)\t\(.id)"' 2>/dev/null || true)"

state_id_for_group() {
  local group="$1"
  printf '%s\n' "$state_ids" | awk -F'\t' -v g="$group" '$1 == g { print $2; exit }'
}

# --- Reconcile with what Plane already holds --------------------------------
# Identity is Plane's own `external_id`, which is what the field is for: the
# sync writes `external_source=<slug>-ecosystem` and `external_id=<key>`, and reads
# both back. Two earlier designs failed and are recorded so they are not
# retried: a `<!-- ecosystem-key: ... -->` comment in the description is STRIPPED by
# Plane's HTML sanitiser, so it never persisted; and the v2 work-items API
# returns neither `external_id` nor any description field, so it can only match
# by name. v1 is therefore preferred, and the script says when it is falling
# back.
api_call GET "${ITEMS_PATH}?limit=100"
check_reply "reading the project's work items"
existing="$REPLY_BODY"
existing_items="$(printf '%s' "$existing" | jq -c '(if type == "array" then . else (.results // .data // []) end)' 2>/dev/null || printf '[]')"

# An empty project answers with no items at all, which is not evidence that the
# API omits external_id - and warning about it on a first run is just noise.
have_external_ids=1
if printf '%s' "$existing_items" | jq -e 'length > 0' >/dev/null 2>&1; then
  printf '%s' "$existing_items" | jq -e '.[0] | has("external_id")' >/dev/null 2>&1 \
    || have_external_ids=0
fi

existing_keys="$(printf '%s' "$existing_items" | jq -r '
  .[] | select(.external_id != null and .external_id != "") | "\(.external_id)\t\(.id)"')"
existing_names="$(printf '%s' "$existing_items" | jq -r '.[] | "\(.name)\t\(.id)"')"

existing_id_for() {
  # args: key, name
  local key="$1" name="$2" id
  id="$(printf '%s\n' "$existing_keys" | awk -F'\t' -v k="$key" '$1 == k { print $2; exit }')"
  if [ -z "$id" ] && [ "$have_external_ids" -eq 0 ]; then
    id="$(printf '%s\n' "$existing_names" | awk -F'\t' -v n="$name" '$1 == n { print $2; exit }')"
  fi
  printf '%s' "$id"
}

step "plan"
if [ "$have_external_ids" -eq 0 ]; then
  warn "Plane /api/${API_VERSION} does not return external_id, so this run matches"
  warn "  existing items by NAME. Use --api-version v1: it returns external_id,"
  warn "  which is what makes matching exact when a document is reworded."
fi
if [ "$APPLY" -eq 1 ]; then
  printf '  applying to Plane (project %s)\n\n' "$PLANE_PROJECT_ID"
else
  printf '  dry run - nothing will be written\n\n'
fi

created=0; updated=0; unchanged=0

record_state() {
  # args: key, item id, hash of the body that was written
  local key="$1" id="$2" hash="$3" tmp
  [ -n "$id" ] || return 0
  tmp="$(mktemp)"
  jq --arg k "$key" --arg i "$id" --arg h "$hash" \
     '.[$k] = {id:$i, hash:$h}' "$STATE_FILE" > "$tmp"
  cat "$tmp" > "$STATE_FILE"
  rm -f "$tmp"
}

emit_item() {
  # args: key, name, state-group, description
  local key="$1" name="$2" group="$3" description="$4"
  local item_id state_id body state_field body_hash synced_id synced_hash
  item_id="$(existing_id_for "$key" "$name")"
  state_id="$(state_id_for_group "$group")"
  body="$(jq -n --arg n "$name" --arg d "$description" --arg k "$key" --arg s "$PLANE_EXTERNAL_SOURCE" \
    '{name:$n, description_html:$d, priority:"none", external_source:$s, external_id:$k}')"
  # The two API versions name the same field differently, and both ignore the
  # other's spelling silently (HTTP 200, nothing changed): v1 is `state`,
  # v2 is `state_id`.
  state_field="state_id"
  [ "$API_VERSION" = "v1" ] && state_field="state"
  [ -n "$state_id" ] && body="$(printf '%s' "$body" | jq --arg s "$state_id" --arg f "$state_field" '. + {($f):$s}')"

  body_hash="$(printf '%s' "$body" | sha256sum | cut -d' ' -f1)"
  synced_id="$(jq -r --arg k "$key" '.[$k].id // ""' "$STATE_FILE")"
  synced_hash="$(jq -r --arg k "$key" '.[$k].hash // ""' "$STATE_FILE")"

  if [ -n "$item_id" ] && [ "$synced_id" = "$item_id" ] && [ "$synced_hash" = "$body_hash" ]; then
    printf '  unchanged %-55s %s\n' "$name" "$key"
    unchanged=$((unchanged + 1))
    return 0
  fi

  if [ -n "$item_id" ]; then
    printf '  update   %-56s %s\n' "$name" "$key"
    updated=$((updated + 1))
    if [ "$APPLY" -eq 1 ]; then
      api_call PATCH "${ITEMS_PATH}${item_id}/" "$body"
      check_reply "updating ${key}"
      record_state "$key" "$item_id" "$body_hash"
    fi
  else
    printf '  create   %-56s %s\n' "$name" "$key"
    created=$((created + 1))
    if [ "$APPLY" -eq 1 ]; then
      api_call POST "$ITEMS_PATH" "$body"
      check_reply "creating ${key}"
      record_state "$key" "$(printf '%s' "$REPLY_BODY" | jq -r '.id // ""')" "$body_hash"
    fi
  fi
}

while IFS="$(printf '\t')" read -r phase scope status; do
  [ -n "$phase" ] || continue
  key="phase-$(printf '%02d' "$phase")"
  group="$(state_group_for "$status")"
  description="$(printf '%s\n\n%s\n%s\n%s\n' \
    "**Source:** \`docs/roadmap.md\` — Phase ${phase}, ${scope}." \
    "- Status in the repository: ${status}" \
    "- Documentation: ${OUTLINE_URL}" \
    "_Mirrored by integrations/sync-roadmap.sh — edit docs/roadmap.md, not this description._")"
  emit_item "$key" "Phase ${phase} — ${scope}" "$group" "$description"
done <<EOF
$phases
EOF

while IFS="$(printf '\t')" read -r id what kind status; do
  [ -n "$id" ] || continue
  key="extension-$(printf '%s' "$id" | tr 'A-Z' 'a-z')"
  group="$(state_group_for "$status")"
  description="$(printf '%s\n\n%s\n%s\n%s\n' \
    "**Source:** \`docs/extensions.md\` — ${id}, ${kind}. ${what}" \
    "- Status in the repository: ${status}" \
    "- Documentation: ${OUTLINE_URL}" \
    "_Mirrored by integrations/sync-roadmap.sh — edit docs/extensions.md, not this description._")"
  emit_item "$key" "${id} — ${what}" "$group" "$description"
done <<EOF
$extensions
EOF

step "summary"
if [ "$APPLY" -eq 1 ]; then
  printf '  %s created, %s updated, %s unchanged in Plane (%s)\n\n' \
    "$created" "$updated" "$unchanged" "${PLANE_URL}"
else
  printf '  would create %s, update %s; %s unchanged; dry run, nothing was written\n' \
    "$created" "$updated" "$unchanged"
  printf '  re-run with --apply to write them\n\n'
fi
