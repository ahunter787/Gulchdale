#!/usr/bin/env bash
# Install or refresh Outline for this project's development ecosystem.
#
# Idempotent: the first run generates secrets and creates the env file; later
# runs keep the secrets and refresh the wiring that comes from the generated env
# (the URL, the mail sink). Data lives in named volumes, so re-running this never
# touches documents.
#
#   ./outline/install.sh          # create/refresh and start

set -euo pipefail

# shellcheck source=../lib.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib.sh"

require_cmd docker
require_cmd curl
load_env

TEMPLATE="${INFRA_DIR}/outline/outline.env.example"
OUTLINE_ENV="${RUNTIME_DIR}/outline.env"
COMPOSE_FILE="${INFRA_DIR}/outline/docker-compose.yml"

step "Outline environment"
ensure_dir "$RUNTIME_DIR"
if [ ! -f "$OUTLINE_ENV" ]; then
  cp "$TEMPLATE" "$OUTLINE_ENV"
  log "created .runtime/outline.env from the template"
else
  log ".runtime/outline.env already exists; keeping its secrets"
fi

# Wiring that must always agree with the generated env.
set_env_var "$OUTLINE_ENV" URL "$(outline_url)"
set_env_var "$OUTLINE_ENV" SMTP_HOST "mailpit"
set_env_var "$OUTLINE_ENV" SMTP_PORT "${MAIL_INTERNAL_SMTP_PORT}"
set_env_var "$OUTLINE_ENV" SMTP_FROM_EMAIL "${MAIL_FROM_OUTLINE}"

# Secrets: generated once, never rotated behind the owner's back.
for key in SECRET_KEY UTILS_SECRET POSTGRES_PASSWORD; do
  if [ "$(env_get "$OUTLINE_ENV" "$key")" = "change-me" ]; then
    set_env_var "$OUTLINE_ENV" "$key" "$(rand_hex 32)"
    log "generated ${key}"
  fi
done

db_password="$(env_get "$OUTLINE_ENV" POSTGRES_PASSWORD)"
set_env_var "$OUTLINE_ENV" DATABASE_URL "postgres://outline:${db_password}@postgres:5432/outline"
chmod 600 "$OUTLINE_ENV"

if grep -q '=change-me' "$OUTLINE_ENV"; then
  die "outline.env still contains a change-me placeholder: $(grep -n '=change-me' "$OUTLINE_ENV" | tr '\n' ' ')"
fi

step "host ports"
check_port_free_or_ours "${OUTLINE_HTTP_PORT}" "Outline" "^${OUTLINE_COMPOSE_PROJECT}-app$"

step "starting Outline"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d

if wait_for_http "$(outline_url)/_health" "Outline" 300; then
  log "Outline is ready at $(outline_url)"
else
  warn "Outline did not answer within 5 minutes - check: make logs S=outline"
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps
  exit 1
fi
