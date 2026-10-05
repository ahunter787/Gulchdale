#!/usr/bin/env bash
# Create the shared Docker network this project's three service groups join.
#
# A script rather than a couple of lines in the Makefile on purpose: the network
# name lives in the generated env file, and make resolves its variables *before*
# any recipe runs. On a first run, `make install` creates that file in its first
# step, so a recipe that read the name from a make variable would get an empty
# string - and try to create a network with no name.
#
#   ./integrations/ensure-network.sh

set -euo pipefail

# shellcheck source=../lib.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib.sh"

require_cmd docker
load_env

if docker network inspect "$SHARED_NETWORK" >/dev/null 2>&1; then
  log "network ${SHARED_NETWORK} already exists"
else
  docker network create "$SHARED_NETWORK" >/dev/null
  log "created network ${SHARED_NETWORK}"
fi
docker network inspect "$SHARED_NETWORK" --format '{{.Name}}: {{.Id}}' | cut -c1-40
