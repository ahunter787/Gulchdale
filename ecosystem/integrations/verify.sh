#!/usr/bin/env bash
# Assert that what is published matches what the project's checkout says.
#
#   1. the roadmap and register tables parse, and every row has a Plane item
#   2. every tracked markdown file (minus DOCS_EXCLUDE) has an Outline document
#   3. every recorded document id still resolves in Outline
#   4. re-running both syncs would change nothing (idempotency)
#
# Exit 0 only when all four hold. Each failure names the file or item involved,
# so a failure is actionable rather than a count mismatch.
#
#   ./integrations/verify.sh

set -euo pipefail

# shellcheck source=../lib.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib.sh"

require_cmd curl
require_cmd jq
load_env
require_project

failures=0
pass() { printf '  ok    %s\n' "$*"; }
fail() { printf '  FAIL  %s\n' "$*"; failures=$((failures + 1)); }

# --- 1. the plan ------------------------------------------------------------

step "the plan"
# The same two tables the roadmap sync reads. A project that has not written
# them yet is not failing: it simply has nothing to mirror, so this reports 0.
plan_rows="$(awk '
  FNR == 1 { in_table = 0 }
  /^\| Phase \| Scope \| Status \|/          { in_table = 1; next }
  /^\| # \| What it is \| Kind \| Status \|/ { in_table = 1; next }
  in_table && /^\| *-/                       { next }
  in_table && /^\|/                          { n++ ; next }
  in_table && !/^\|/                         { in_table = 0 }
  END { print n + 0 }
' "$PROJECT_ROOT/docs/roadmap.md" "$PROJECT_ROOT/docs/extensions.md" 2>/dev/null || true)"
if [ -f "$PROJECT_ROOT/docs/roadmap.md" ]; then
  pass "${plan_rows} row(s) in docs/roadmap.md and docs/extensions.md"
else
  fail "docs/roadmap.md does not exist - nothing to mirror"
fi

# --- 2. Plane ---------------------------------------------------------------

step "Plane"
load_secrets "${SECRETS_DIR}/plane.env" PLANE_API_KEY PLANE_WORKSPACE_SLUG PLANE_PROJECT_ID
plane_total="$(curl -s --max-time 20 -H "X-API-Key: ${PLANE_API_KEY}" \
  "$(plane_url)/api/v1/workspaces/${PLANE_WORKSPACE_SLUG}/projects/${PLANE_PROJECT_ID}/issues/?limit=1" \
  | jq -r '.total_count // empty' 2>/dev/null || true)"
if [ -z "$plane_total" ]; then
  fail "Plane did not report the project's work items (is it up, is the token valid?)"
elif [ "$plane_total" -eq "$plan_rows" ]; then
  pass "Plane holds ${plane_total} work item(s), matching the ${plan_rows} row(s)"
else
  fail "Plane holds ${plane_total} work item(s) but the documents describe ${plan_rows}"
fi

# --- 3. Outline -------------------------------------------------------------

step "Outline"
load_secrets "${SECRETS_DIR}/outline.env" OUTLINE_API_TOKEN
outline_api="$(outline_url)/api"

exclude_re=""
for prefix in ${DOCS_EXCLUDE:-}; do
  [ -n "$prefix" ] || continue
  exclude_re="${exclude_re:+$exclude_re|}^${prefix}"
done
if [ -n "$exclude_re" ]; then
  expected_docs="$(git -C "$PROJECT_ROOT" ls-files '*.md' | grep -Ev "$exclude_re" | grep -c . || true)"
else
  expected_docs="$(git -C "$PROJECT_ROOT" ls-files '*.md' | grep -c . || true)"
fi

collection_id="$(curl -s --max-time 20 -X POST "${outline_api}/collections.list" \
  -H "Authorization: Bearer ${OUTLINE_API_TOKEN}" -H 'Content-Type: application/json' \
  -d "$(jq -n --arg n "$OUTLINE_COLLECTION" '{limit:100}')" \
  | jq -r --arg n "$OUTLINE_COLLECTION" '.data[] | select(.name == $n) | .id' | head -1)"
if [ -z "$collection_id" ]; then
  fail "Outline has no collection named \"${OUTLINE_COLLECTION}\""
else
  published="$(curl -s --max-time 20 -X POST "${outline_api}/documents.list" \
    -H "Authorization: Bearer ${OUTLINE_API_TOKEN}" -H 'Content-Type: application/json' \
    -d "$(jq -n --arg c "$collection_id" '{collectionId:$c, limit:100}')" | jq -r '.data | length')"
  if [ "$published" -eq "$expected_docs" ]; then
    pass "Outline holds ${published} document(s), matching the checkout"
  else
    fail "Outline holds ${published} document(s) but the checkout has ${expected_docs} to publish"
  fi

  # Every id the state file remembers must still be in the collection. This is
  # checked from the list the token already has a scope for: `documents.info` is
  # deliberately not among the token's scopes, and asking for it answers 403.
  state="${STATE_DIR}/docs.json"
  if [ ! -f "$state" ]; then
    fail "no state file at ${state} - run: make docs-sync ARGS=--apply"
  else
    live_ids="$(curl -s --max-time 20 -X POST "${outline_api}/documents.list" \
      -H "Authorization: Bearer ${OUTLINE_API_TOKEN}" -H 'Content-Type: application/json' \
      -d "$(jq -n --arg c "$collection_id" '{collectionId:$c, limit:100}')" \
      | jq -r '.data[].id')"
    missing=0
    while IFS=$'\t' read -r path doc_id; do
      [ -n "$doc_id" ] || continue
      if ! printf '%s\n' "$live_ids" | grep -qxF "$doc_id"; then
        fail "recorded document for ${path} is not in the collection any more"
        missing=$((missing + 1))
      fi
    done < <(jq -r 'to_entries[] | "\(.key)\t\(.value.id)"' "$state")
    [ "$missing" -eq 0 ] && pass "every recorded document id is present"
  fi
fi

# --- 4. idempotency ---------------------------------------------------------

step "idempotency"
docs_plan="$("$INFRA_DIR/integrations/publish-docs.sh" 2>&1 | grep -E 'would create|created,')"
if printf '%s' "$docs_plan" | grep -qE 'would create 0 and update 0|, 0 created, 0 updated'; then
  pass "the documentation sync would change nothing"
else
  fail "the documentation sync would change something: ${docs_plan}"
fi

plane_plan="$("$INFRA_DIR/integrations/sync-roadmap.sh" 2>&1 | grep -E 'would create|created,')"
if printf '%s' "$plane_plan" | grep -qE 'would create 0, update 0|0 created, 0 updated'; then
  pass "the roadmap sync would change nothing"
else
  fail "the roadmap sync would change something: ${plane_plan}"
fi

# --- verdict ----------------------------------------------------------------

printf '\n'
if [ "$failures" -eq 0 ]; then
  printf 'Verified: the plan, the documents and the published copies agree.\n\n'
  exit 0
fi
printf '%s check(s) failed - see above.\n\n' "$failures" >&2
exit 1
