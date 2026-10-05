#!/usr/bin/env bash
# Install or update Plane for this project's development ecosystem.
#
# What it does, in order:
#   1. downloads Plane's own pinned config bundle (docker-compose.yml +
#      variables.env) from the public setup endpoint;
#   2. keeps the existing variables.env if there is one, absorbing any keys a
#      newer release added;
#   3. applies plane/overrides.env - ports, URLs, disabled extras;
#   4. generates every secret Plane ships a placeholder for, and rebuilds the
#      connection URLs derived from them;
#   5. copies in the Compose override that joins the shared network;
#   6. starts the stack and waits for the UI to answer.
#
# Idempotent. Secrets are generated once and kept: rotating them would
# invalidate sessions and encrypted values. Data lives under
# .runtime/plane-app/plane/ and is never touched by this script.
#
#   ./plane/install.sh

set -euo pipefail

# shellcheck source=../lib.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib.sh"

require_cmd docker
require_cmd curl
require_cmd unzip
require_cmd openssl
load_env

PLANE_DIR="${PLANE_DIR:?lib.sh must be sourced first}"
COMPOSE_FILE="${PLANE_DIR}/docker-compose.yml"
PLANE_ENV="${PLANE_DIR}/variables.env"
OVERRIDES="${INFRA_DIR}/plane/overrides.env"
OVERRIDE_COMPOSE="${INFRA_DIR}/plane/docker-compose.override.yaml"
BUNDLE_URL="https://prime.plane.so/api/v2/setup/?version=${PLANE_VERSION}"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

# Secrets Plane ships with a working default for. Each is replaced on first
# install with a locally generated value; `ARGUS_FINGERPRINT_SECRET` in
# particular must never keep a shared default (Plane's own comment in
# variables.env says so).
SECRET_KEYS="MACHINE_SIGNATURE SECRET_KEY SILO_HMAC_SECRET_KEY AES_SECRET_KEY
LIVE_SERVER_SECRET_KEY PI_INTERNAL_SECRET CURSOR_WEBHOOK_SECRET
ARGUS_FINGERPRINT_SECRET POSTGRES_PASSWORD RABBITMQ_PASSWORD
WEBHOOK_SECRET MINIO_ROOT_PASSWORD"

step "host ports"
# All five ports are published by Plane's own proxy container, so a re-run
# finds them held by us and updates in place.
check_port_free_or_ours "${PLANE_HTTP_PORT}" "Plane web" "^${PLANE_COMPOSE_PROJECT}-"
check_port_free_or_ours "${PLANE_HTTPS_PORT}" "Plane HTTPS" "^${PLANE_COMPOSE_PROJECT}-"
check_port_free_or_ours "${PLANE_SMTP_PORT_25}" "Plane email intake (25)" "^${PLANE_COMPOSE_PROJECT}-"
check_port_free_or_ours "${PLANE_SMTP_PORT_465}" "Plane email intake (465)" "^${PLANE_COMPOSE_PROJECT}-"
check_port_free_or_ours "${PLANE_SMTP_PORT_587}" "Plane email intake (587)" "^${PLANE_COMPOSE_PROJECT}-"
log "ports ${PLANE_HTTP_PORT}/${PLANE_HTTPS_PORT} and the intake ports are accounted for"

step "downloading Plane ${PLANE_VERSION} config bundle"
curl -fsSL "$BUNDLE_URL" -o "$TMP_DIR/plane.zip" \
  || die "could not download the Plane ${PLANE_VERSION} bundle - check the network and PLANE_VERSION in ${ENV_FILE}"
unzip -q -o "$TMP_DIR/plane.zip" -d "$TMP_DIR"
[ -f "$TMP_DIR/docker-compose.yml" ] || die "the downloaded bundle has no docker-compose.yml"
[ -f "$TMP_DIR/variables.env" ] || die "the downloaded bundle has no variables.env"
log "downloaded $(env_get "$TMP_DIR/variables.env" APP_RELEASE_VERSION) ($(wc -c < "$TMP_DIR/variables.env") bytes of settings)"

ensure_dir "$PLANE_DIR"

previous_version="$(env_get "$PLANE_ENV" APP_RELEASE_VERSION)"
if [ -f "$PLANE_ENV" ] && [ -n "$previous_version" ] && [ "$previous_version" != "$PLANE_VERSION" ]; then
  log "upgrading from ${previous_version} to ${PLANE_VERSION}: existing secrets are kept"
fi

# Keep the existing settings file; take the new release's keys for anything it
# added. A brand-new install just uses the downloaded file as-is.
if [ -f "$PLANE_ENV" ]; then
  required="$(mktemp)"
  while IFS= read -r line; do
    case "$line" in
      \#*|"") continue ;;
    esac
    key="${line%%=*}"
    if ! grep -qE "^${key}=" "$PLANE_ENV"; then
      printf '%s\n' "$line" >> "$required"
      printf '%s=%s\n' "$key" "${line#*=}" >> "$PLANE_ENV"
    fi
  done < "$TMP_DIR/variables.env"
  if [ -s "$required" ]; then
    added="$(cut -d= -f1 "$required" | tr '\n' ' ')"
    log "new settings added by this release: ${added}"
    if grep -qE '^[A-Z_]*(SECRET|PASSWORD|TOKEN|KEY)[A-Z_]*=.+' "$required"; then
      warn "a new release shipped defaults for what look like secrets - review before going further:"
      grep -E '^[A-Z_]*(SECRET|PASSWORD|TOKEN|KEY)[A-Z_]*=.+' "$required" | sed 's/=.*/=<value>/' | sed 's/^/    /' >&2
    fi
  fi
  rm -f "$required"
else
  cp "$TMP_DIR/variables.env" "$PLANE_ENV"
  log "created variables.env from the ${PLANE_VERSION} bundle"
fi

cp "$TMP_DIR/docker-compose.yml" "$COMPOSE_FILE"
cp "$OVERRIDE_COMPOSE" "${PLANE_DIR}/docker-compose.override.yaml"

step "applying plane/overrides.env"
# shellcheck disable=SC1090
. "$OVERRIDES"
for key in $PLANE_OVERRIDE_KEYS; do
  set_env_var "$PLANE_ENV" "$key" "${!key}"
done
log "applied $(printf '%s\n' $PLANE_OVERRIDE_KEYS | wc -l) settings"

step "generating secrets"
generated=0
for key in $SECRET_KEYS; do
  current="$(env_get "$PLANE_ENV" "$key")"
  shipped="$(env_get "$TMP_DIR/variables.env" "$key")"
  if [ -z "$current" ] || [ "$current" = "$shipped" ]; then
    set_env_var "$PLANE_ENV" "$key" "$(rand_hex 32)"
    log "generated ${key}"
    generated=$((generated + 1))
  fi
done
if [ "$generated" -eq 0 ]; then
  log "all secrets already present; none were changed"
fi

minio_user="$(env_get "$PLANE_ENV" MINIO_ROOT_USER)"
if [ "$minio_user" = "access-key" ] || [ -z "$minio_user" ]; then
  minio_user="plane$(rand_hex 4)"
  set_env_var "$PLANE_ENV" MINIO_ROOT_USER "$minio_user"
  set_env_var "$PLANE_ENV" AWS_ACCESS_KEY_ID "$minio_user"
  log "generated MINIO_ROOT_USER"
fi
set_env_var "$PLANE_ENV" AWS_SECRET_ACCESS_KEY "$(env_get "$PLANE_ENV" MINIO_ROOT_PASSWORD)"

# Connection strings that embed a generated password must be rebuilt from it,
# or Plane would keep trying the password the bundle shipped.
#
# DATABASE_URL is the trap: the bundle ships it EMPTY and its compose reads
# `${DATABASE_URL:-postgresql://plane:plane@plane-db/plane}`. An empty value
# counts as unset for `:-`, so leaving it empty silently falls back to the
# public `plane:plane` password while PostgreSQL was initialised with the
# generated one - and every API request fails with "password authentication
# failed for user plane".
pg_user="$(env_get "$PLANE_ENV" POSTGRES_USER plane)"
pg_db="$(env_get "$PLANE_ENV" POSTGRES_DB plane)"
pg_password="$(env_get "$PLANE_ENV" POSTGRES_PASSWORD)"
mq_user="$(env_get "$PLANE_ENV" RABBITMQ_USER plane)"
mq_vhost="$(env_get "$PLANE_ENV" RABBITMQ_VHOST plane)"
mq_password="$(env_get "$PLANE_ENV" RABBITMQ_PASSWORD)"

# The RabbitMQ name trap. Plane's variables.env defines RABBITMQ_DEFAULT_USER
# and RABBITMQ_DEFAULT_PASS, but its compose reads RABBITMQ_USER and
# RABBITMQ_PASSWORD (falling back to `plane`). Generating only the *_DEFAULT_*
# names leaves the broker on the shipped password while the application
# connects with the generated one, and every publish fails with
# "ACCESS_REFUSED - Login was refused". Keep the unused names in step so
# nothing reading them is surprised, but the compose-read names are canonical.
if [ -z "$mq_user" ]; then
  mq_user="$(env_get "$PLANE_ENV" RABBITMQ_DEFAULT_USER plane)"
fi
set_env_var "$PLANE_ENV" RABBITMQ_USER "$mq_user"
set_env_var "$PLANE_ENV" RABBITMQ_DEFAULT_USER "$mq_user"
set_env_var "$PLANE_ENV" RABBITMQ_DEFAULT_PASS "$mq_password"
mq_vhost="$(env_get "$PLANE_ENV" RABBITMQ_DEFAULT_VHOST plane)"
set_env_var "$PLANE_ENV" RABBITMQ_VHOST "$mq_vhost"
set_env_var "$PLANE_ENV" DATABASE_URL "postgresql://${pg_user}:${pg_password}@plane-db/${pg_db}"
set_env_var "$PLANE_ENV" PLANE_PI_DATABASE_URL "postgresql://${pg_user}:${pg_password}@plane-db/plane_pi"
set_env_var "$PLANE_ENV" FOLLOWER_POSTGRES_URI "postgresql://${pg_user}:${pg_password}@plane-db/${pg_db}"
set_env_var "$PLANE_ENV" AMQP_URL "amqp://${mq_user}:${mq_password}@plane-mq:5672/${mq_vhost}"

chmod 600 "$PLANE_ENV"

step "starting Plane"
( cd "$PLANE_DIR" && docker compose --env-file variables.env up -d )

if wait_for_http "$(plane_url)/" "Plane" 900; then
  log "Plane is ready at $(plane_url)"
else
  warn "Plane did not answer within 15 minutes - check: make logs S=plane"
  ( cd "$PLANE_DIR" && docker compose --env-file variables.env ps )
  exit 1
fi

cat <<EOF

Plane is starting at $(plane_url).

Next: create the workspace, the project, an API token and the mail settings. Run

    make bootstrap

from $(INFRA_DIR) - it does all four through Plane's own API and records what it
learns in .runtime/secrets/plane.env, which is what the sync scripts read.

If the bootstrap cannot finish a step it prints the manual equivalent, which is
also in README.md ("Finishing Plane by hand"). The short version:

  1. Sign up with an e-mail address and password - that account owns the
     workspace. No mail server is needed for this step.
  2. Create the workspace, then a project whose identifier is
     ${PLANE_PROJECT_IDENTIFIER}.
  3. /god-mode -> Email: host "${MAILPIT_CONTAINER}", port ${MAILPIT_SMTP_PORT},
     no security, any username/password. Messages then appear at $(mailpit_url).
  4. Profile -> API tokens, and put the token in
     .runtime/secrets/plane.env so the roadmap can be mirrored.

EOF
