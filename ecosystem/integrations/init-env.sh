#!/usr/bin/env bash
# Generate .runtime/env from .env.example.
#
# Fills in this machine's LAN address, a free block of eight consecutive host
# ports (probed, never assumed), and every name derived from the project slug.
# Never overwrites an existing .runtime/env, so it is safe to re-run.
#
#   ./integrations/init-env.sh

set -euo pipefail

# shellcheck source=../lib.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib.sh"

TEMPLATE="${INFRA_DIR}/.env.example"
[ -f "$TEMPLATE" ] || die "missing ${TEMPLATE}"

if [ -f "$ENV_FILE" ]; then
  log ".runtime/env already exists - leaving it untouched"
  exit 0
fi

if grep -qE '@@PROJECT_SLUG@@|@@PROJECT_NAME@@' "$TEMPLATE"; then
  die "${TEMPLATE} still has scaffold placeholders.
This ecosystem was copied by hand rather than scaffolded. Set PROJECT_SLUG and
PROJECT_NAME in ${TEMPLATE}, then re-run. (The other @@...@@ values are filled
in below.)"
fi

slug="$(env_get "$TEMPLATE" PROJECT_SLUG)"
name="$(env_get "$TEMPLATE" PROJECT_NAME "$slug")"
# The scaffold fills the admin address in; a hand-copied seed still gets a default.
admin_email="$(env_get "$TEMPLATE" ECOSYSTEM_ADMIN_EMAIL)"
case "$admin_email" in ""|*'@@'*) admin_email="admin@example.com" ;; esac
# Plane wants a short identifier; strip anything a project identifier cannot hold
# and keep it recognisable.
identifier="$(printf '%s' "$slug" | tr '[:lower:]' '[:upper:]' | tr -cd 'A-Z0-9' | cut -c1-10)"

host="$(hostname -I 2>/dev/null | awk '{print $1}')"
[ -n "$host" ] || host=localhost
base="$(find_free_port_block 8100 8)"
log "host ${host}; ports ${base}-$((base + 7)) are free"

# sed replacement text must not treat & or the delimiter specially.
esc() { printf '%s' "$1" | sed -e 's/[&|\\]/\\&/g'; }

ensure_dir "$RUNTIME_DIR"
sed \
  -e "s|^ECOSYSTEM_HOST=.*|ECOSYSTEM_HOST=$(esc "$host")|" \
  -e "s|^PLANE_HTTP_PORT=.*|PLANE_HTTP_PORT=$((base + 0))|" \
  -e "s|^PLANE_HTTPS_PORT=.*|PLANE_HTTPS_PORT=$((base + 1))|" \
  -e "s|^PLANE_SMTP_PORT_25=.*|PLANE_SMTP_PORT_25=$((base + 2))|" \
  -e "s|^PLANE_SMTP_PORT_465=.*|PLANE_SMTP_PORT_465=$((base + 3))|" \
  -e "s|^PLANE_SMTP_PORT_587=.*|PLANE_SMTP_PORT_587=$((base + 4))|" \
  -e "s|^OUTLINE_HTTP_PORT=.*|OUTLINE_HTTP_PORT=$((base + 5))|" \
  -e "s|^MAILPIT_SMTP_PORT=.*|MAILPIT_SMTP_PORT=$((base + 6))|" \
  -e "s|^MAILPIT_HTTP_PORT=.*|MAILPIT_HTTP_PORT=$((base + 7))|" \
  -e "s|@@PROJECT_SLUG@@|$(esc "$slug")|g" \
  -e "s|@@PROJECT_NAME@@|$(esc "$name")|g" \
  -e "s|@@ECOSYSTEM_ADMIN_EMAIL@@|$(esc "$admin_email")|g" \
  -e "s|@@ECOSYSTEM_HOST@@|$(esc "$host")|g" \
  -e "s|@@SHARED_NETWORK@@|$(esc "${slug}-infra")|g" \
  -e "s|@@PLANE_COMPOSE_PROJECT@@|$(esc "${slug}-plane")|g" \
  -e "s|@@MAIL_COMPOSE_PROJECT@@|$(esc "${slug}-infra")|g" \
  -e "s|@@OUTLINE_COMPOSE_PROJECT@@|$(esc "${slug}-outline")|g" \
  -e "s|@@MAILPIT_CONTAINER@@|$(esc "${slug}-infra-mailpit")|g" \
  -e "s|@@PLANE_PROJECT_IDENTIFIER@@|$(esc "$identifier")|g" \
  -e "s|@@OUTLINE_COLLECTION@@|$(esc "$name")|g" \
  -e "s|@@PLANE_EXTERNAL_SOURCE@@|$(esc "${slug}-ecosystem")|g" \
  "$TEMPLATE" > "$ENV_FILE"
chmod 600 "$ENV_FILE"

step "wrote .runtime/env"
log "project ${name} (${slug}); Plane identifier ${identifier}"
log "Outline collection: ${name}"
log "next: make install  (bring the three services up), then make bootstrap"
