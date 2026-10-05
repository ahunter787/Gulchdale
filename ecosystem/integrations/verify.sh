#!/usr/bin/env bash
# Verify expected IDs, content hashes, membership and idempotency. Never delete.
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib.sh"
load_env
require_project
"$INFRA_DIR/integrations/sync-roadmap.sh" --verify
load_secrets "${SECRETS_DIR}/outline.env" OUTLINE_API_TOKEN
export PROJECT_ROOT STATE_DIR OUTLINE_URL="$(outline_url)"
node "$INFRA_DIR/integrations/verify-outline.mjs"
plan="$("$INFRA_DIR/integrations/publish-docs.sh")"
printf '%s\n' "$plan"
printf '%s\n' "$plan" | grep -qE 'would create 0 and update 0|0 created, 0 updated'
printf '\nVerified: modules, work items, membership, Outline documents and idempotency.\n'
