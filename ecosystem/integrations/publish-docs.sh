#!/usr/bin/env bash
# Publish this project's engineering documents into Outline, one Outline
# document per repository file, idempotently.
#
# How it stays idempotent:
#   - every published document starts with an HTML comment naming its source
#     file (`<!-- ecosystem-source: docs/architecture.md -->`), which is how a
#     lost state file is recovered;
#   - .runtime/state/docs.json remembers file -> document id and a hash of the
#     text last published, so an unchanged file is not re-published and an edited
#     file updates its existing document instead of creating a second one;
#   - nothing is ever deleted. A document whose file disappeared from the
#     repository is reported and left alone.
#
# The collection is ${OUTLINE_COLLECTION} from the generated env file, and the
# path prefixes in DOCS_EXCLUDE are left out (the ecosystem's own documentation
# is excluded by default: it describes the tooling, not the project).
#
# Dry run by default: nothing is written without --apply.
#
#   ./integrations/publish-docs.sh                 # show what would change
#   ./integrations/publish-docs.sh --apply         # publish
#   ./integrations/publish-docs.sh --apply --collection "Another Collection"
#
# Needs the Outline API token in .runtime/secrets/outline.env, which the
# bootstrap writes (README.md has the manual path).

set -euo pipefail

# shellcheck source=../lib.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib.sh"

require_cmd curl
require_cmd jq
require_cmd sha256sum

APPLY=0
COLLECTION_OVERRIDE=""
usage() { sed -n '2,29p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1; shift ;;
    --collection) COLLECTION_OVERRIDE="${2:?--collection needs a name}"; shift 2 ;;
    --collection=*) COLLECTION_OVERRIDE="${1#*=}"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown argument: $1 (try --help)" ;;
  esac
done

load_env
require_project
load_secrets "${SECRETS_DIR}/outline.env" OUTLINE_API_TOKEN
COLLECTION="${COLLECTION_OVERRIDE:-$OUTLINE_COLLECTION}"
OUTLINE_URL="$(outline_url)"
STATE_FILE="${STATE_DIR}/docs.json"
ensure_dir "$STATE_DIR"
[ -f "$STATE_FILE" ] || printf '{}\n' > "$STATE_FILE"

api() {
  # api <resource.method> <json-body>
  local resource="$1" body="${2:-{\}}" response
  response="$(curl -sS --max-time 30 -X POST "${OUTLINE_URL}/api/${resource}" \
    -H "Authorization: Bearer ${OUTLINE_API_TOKEN}" \
    -H 'Content-Type: application/json' \
    -d "$body" || true)"
  if [ -z "$response" ]; then
    die "Outline did not answer ${resource} at ${OUTLINE_URL} - is it running? (make health)"
  fi
  if [ "$(printf '%s' "$response" | jq -r '.ok // true' 2>/dev/null)" = "false" ]; then
    local message
    message="$(printf '%s' "$response" | jq -r '.error // .message // "unknown error"')"
    if printf '%s' "$message" | grep -qi 'authorization\|permission\|scope'; then
      die "${resource} was refused: ${message}
The API token is missing a scope. Recreate it in Outline (Settings -> API tokens) with:
  collections.list  collections.create  documents.list  documents.create  documents.update"
    fi
    die "${resource} failed: ${message}"
  fi
  printf '%s' "$response"
}

step "Project documents"
documents="$(git -C "$PROJECT_ROOT" ls-files '*.md' | sort)"
count="$(printf '%s\n' "$documents" | grep -c . || true)"
log "${count} tracked markdown file(s) in ${PROJECT_ROOT}"

# Path prefixes in DOCS_EXCLUDE are not published. The ecosystem's own
# documentation is excluded by default: it describes the tooling, not the
# project, and publishing it would put this runbook in the project's wiki.
if [ -n "${DOCS_EXCLUDE:-}" ]; then
  exclude_re=""
  for prefix in $DOCS_EXCLUDE; do
    [ -n "$prefix" ] || continue
    exclude_re="${exclude_re:+$exclude_re|}^${prefix}"
  done
  if [ -n "$exclude_re" ]; then
    before="$(printf '%s\n' "$documents" | grep -c . || true)"
    documents="$(printf '%s\n' "$documents" | grep -Ev "$exclude_re" || true)"
    after="$(printf '%s\n' "$documents" | grep -c . || true)"
    if [ "$before" -gt "$after" ]; then
      log "left out $((before - after)) file(s) matching DOCS_EXCLUDE=${DOCS_EXCLUDE}"
    fi
  fi
fi
count="$(printf '%s\n' "$documents" | grep -c . || true)"

step "Outline collection"
collection_id="$(api collections.list '{"limit":100}' \
  | jq -r --arg name "$COLLECTION" '.data[] | select(.name == $name) | .id' | head -1)"
if [ -n "$collection_id" ]; then
  log "using existing collection \"${COLLECTION}\" (${collection_id})"
elif [ "$APPLY" -eq 1 ]; then
  collection_id="$(api collections.create "$(jq -n --arg n "$COLLECTION" \
    '{name:$n, description:"Engineering documentation for this project, published from its checkout by integrations/publish-docs.sh in its development ecosystem."}')" \
    | jq -r '.data.id')"
  log "created collection \"${COLLECTION}\" (${collection_id})"
else
  log "collection \"${COLLECTION}\" does not exist yet - it would be created (dry run)"
fi

# Existing documents in the collection, as two small maps: id -> title, and
# ecosystem-source marker -> id. The documents' full text is deliberately NOT
# accumulated: passing it back through jq as an argument overflows the kernel's
# argument limit once the collection holds a couple of dozen documents
# ("jq: Argument list too long"), which is how the second publish of 25 files
# failed the first time it was tried.
existing_titles=""
existing_markers=""
if [ -n "$collection_id" ]; then
  offset=0
  while :; do
    page="$(api documents.list "$(jq -n --arg c "$collection_id" --argjson o "$offset" '{collectionId:$c, limit:100, offset:$o}')")"
    n="$(printf '%s' "$page" | jq '.data | length')"
    existing_titles+="$(printf '%s' "$page" | jq -r '.data[] | "\(.id)\t\(.title)"')"$'\n'
    existing_markers+="$(printf '%s' "$page" | jq -r '
      .data[] | .id as $id | (.text // "") as $t
      | "\($id)\t" + (if ($t | test("ecosystem-source: "))
                      then ($t | capture("ecosystem-source: (?<p>[A-Za-z0-9._/-]+)").p)
                      else "" end)' 2>/dev/null || true)"$'\n'
    [ "$n" -lt 100 ] && break
    offset=$((offset + 100))
  done
  log "Outline holds $(printf '%s\n' "$existing_titles" | grep -c .) document(s) in this collection"
fi

# Documents whose source file is gone from the checkout. Nothing is deleted
# automatically - a page is a deliberate thing - but a stale page has to be
# REPORTED, or a superseded document sits in the collection looking current.
# That is exactly what happened once: the ADR-015 written for the in-repo
# infrastructure kept its page after that work was extracted elsewhere, leaving
# two documents numbered ADR-015 side by side.
stale_lines=""
while IFS="$(printf '\t')" read -r stale_id stale_path; do
  [ -n "$stale_id" ] || continue
  [ -n "$stale_path" ] || continue
  printf '%s\n' "$documents" | grep -qxF "$stale_path" \
    || stale_lines="${stale_lines}  stale      ${stale_path}  (${stale_id})"$'\n'
done <<EOF
$existing_markers
EOF
stale_count="$(printf '%s\n' "$stale_lines" | grep -c . || true)"

step "plan"
created=0; updated=0; unchanged=0; found=0
plan_lines=""
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  file="${PROJECT_ROOT}/${rel}"
  [ -f "$file" ] || continue
  title="$(grep -m1 -E '^# ' "$file" | sed 's/^# //' || true)"
  [ -n "$title" ] || title="$(basename "$file" .md)"
  marker="<!-- ecosystem-source: ${rel} -->"
  text="$(printf '%s\n\n' "$marker"; cat "$file")"
  hash="$(printf '%s' "$text" | sha256sum | cut -d' ' -f1)"

  state_hash="$(jq -r --arg p "$rel" '.[$p].hash // ""' "$STATE_FILE")"
  doc_id="$(jq -r --arg p "$rel" '.[$p].id // ""' "$STATE_FILE")"
  # A remembered id is only trusted while it still exists in the collection.
  if [ -z "$doc_id" ] || ! printf '%s\n' "$existing_titles" | awk -F'\t' -v id="$doc_id" '$1 == id { found = 1 } END { exit !found }'; then
    doc_id="$(printf '%s\n' "$existing_markers" | awk -F'\t' -v p="$rel" '$2 == p { print $1; exit }')"
  fi
  found=$((found + 1))

  if [ -n "$doc_id" ] && [ "$state_hash" = "$hash" ]; then
    unchanged=$((unchanged + 1))
    plan_lines="${plan_lines}  unchanged  ${rel}\n"
    continue
  fi

  if [ -z "$collection_id" ]; then
    plan_lines="${plan_lines}  create     ${rel}  (collection pending)\n"
    created=$((created + 1))
    continue
  fi

  if [ -n "$doc_id" ]; then
    plan_lines="${plan_lines}  update     ${rel}  -> ${doc_id}\n"
    updated=$((updated + 1))
    if [ "$APPLY" -eq 1 ]; then
      api documents.update "$(jq -n --arg id "$doc_id" --arg t "$title" --arg x "$text" '{id:$id, title:$t, text:$x}')" >/dev/null
    fi
  else
    plan_lines="${plan_lines}  create     ${rel}  \"${title}\"\n"
    created=$((created + 1))
    if [ "$APPLY" -eq 1 ]; then
      new_id="$(api documents.create "$(jq -n --arg t "$title" --arg x "$text" --arg c "$collection_id" '{title:$t, text:$x, collectionId:$c, publish:true}')" | jq -r '.data.id')"
      doc_id="$new_id"
    fi
  fi

  if [ "$APPLY" -eq 1 ] && [ -n "$doc_id" ]; then
    tmp="$(mktemp)"
    jq --arg p "$rel" --arg id "$doc_id" --arg h "$hash" '.[$p] = {id:$id, hash:$h}' "$STATE_FILE" > "$tmp"
    cat "$tmp" > "$STATE_FILE"
    rm -f "$tmp"
  fi
done <<EOF
$documents
EOF

printf '%b' "$plan_lines"
if [ "$stale_count" -gt 0 ]; then
  printf '\n'
  printf '%b' "$stale_lines"
  warn "${stale_count} document(s) in Outline have no source file any more."
  warn "  Nothing is deleted automatically: decide each one by hand - delete the"
  warn "  page in Outline (Settings is not needed; the document menu has Delete),"
  warn "  or restore the file it came from."
fi

step "summary"
if [ "$APPLY" -eq 1 ]; then
  printf '  %s document(s) in the repository, %s created, %s updated, %s unchanged\n' \
    "$found" "$created" "$updated" "$unchanged"
  printf '  state: %s\n' "${STATE_FILE#"$INFRA_DIR"/}"
  printf '  Outline: %s\n\n' "$OUTLINE_URL"
else
  printf '  %s document(s) in the repository; would create %s and update %s\n' \
    "$found" "$created" "$updated"
  printf '  dry run - nothing was written. Re-run with --apply.\n\n'
fi
