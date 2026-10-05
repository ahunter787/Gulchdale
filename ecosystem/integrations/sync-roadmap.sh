#!/usr/bin/env bash
# One-way idempotent Plane mirror. No deletes. --print-plan requires no credentials.
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib.sh"
require_cmd node
load_env
require_project
export PROJECT_ROOT STATE_DIR
if [[ " $* " != *" --print-plan "* ]]; then
  load_secrets "${SECRETS_DIR}/plane.env" PLANE_API_KEY PLANE_WORKSPACE_SLUG PLANE_PROJECT_ID
  export PLANE_URL="$(plane_url)"
fi
exec node "$INFRA_DIR/integrations/plane-sync.mjs" "$@"
