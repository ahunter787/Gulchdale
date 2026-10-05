#!/usr/bin/env bash
# Stop this ecosystem and delete the data it generated.
#
# Three things are separate on purpose:
#
#   containers and volumes   removed here (Plane's and Outline's databases)
#   Plane's bind-mounted data  removed here too - it is written by container
#                              users, so a plain `rm -rf` in the project cannot
#                              delete it; this does it from a container
#   secrets, env and sync state  KEPT, because they are what lets a re-install
#                              reattach without redoing the bootstrap. Pass
#                              --all to remove those as well.
#
# Every step is explicit and confirmed, because this destroys work.
#
#   ./integrations/teardown.sh          # stop, delete volumes and bind data
#   ./integrations/teardown.sh --all    # and the secrets, env and sync state

set -euo pipefail

# shellcheck source=../lib.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib.sh"

require_cmd docker
load_env

REMOVE_ALL=0
[ "${1:-}" = "--all" ] && REMOVE_ALL=1
[ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ] && { sed -n '2,21p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0; }

cat <<EOF

This stops ${PROJECT_NAME}'s ecosystem and deletes:
  - its containers, its network and its Docker volumes
  - .runtime/plane-app/ (Plane's vendor bundle, database files and uploads)
$([ "$REMOVE_ALL" -eq 1 ] && echo "  - .runtime/secrets, .runtime/env and .runtime/state" || echo "  (keeping .runtime/secrets, .runtime/env and .runtime/state)")
EOF
printf "Type 'yes' to continue: " && read -r ans && [ "$ans" = "yes" ] || { echo "aborted"; exit 1; }

step "stopping the services"
COMPOSE="docker compose"
for file in mail/docker-compose.yml outline/docker-compose.yml; do
  $COMPOSE --env-file "$ENV_FILE" -f "${INFRA_DIR}/${file}" down -v >/dev/null 2>&1 || true
  log "removed the $(dirname "$file") project and its volumes"
done
if [ -f "${PLANE_DIR}/variables.env" ]; then
  ( cd "$PLANE_DIR" && $COMPOSE --env-file variables.env down -v >/dev/null 2>&1 ) || true
  log "removed the Plane project and its volumes"
fi
docker network rm "$SHARED_NETWORK" >/dev/null 2>&1 || true

step "removing Plane's bind-mounted data"
if [ -d "$PLANE_DIR" ]; then
  # Container users own these files, so root inside a container is the only
  # reliable way to remove them without escalating on the host.
  docker run --rm -v "${RUNTIME_DIR}":/rt alpine rm -rf /rt/plane-app
  log "removed .runtime/plane-app"
else
  log "nothing to remove"
fi

if [ "$REMOVE_ALL" -eq 1 ]; then
  step "removing the generated configuration"
  docker run --rm -v "${RUNTIME_DIR}":/rt alpine rm -rf /rt/secrets /rt/state /rt/env /rt/outline.env /rt/backups
  log "removed .runtime/secrets, .runtime/state, .runtime/env and .runtime/backups"
fi

step "left behind"
printf '  %s\n' "$(ls -A "$RUNTIME_DIR" 2>/dev/null | tr '\n' ' ')"
cat <<EOF

The workspace can now be deleted normally. To build it again:
  make install && make bootstrap
EOF
