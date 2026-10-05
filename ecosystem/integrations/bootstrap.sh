#!/usr/bin/env bash
# Bring a freshly installed ecosystem to a working state, without a browser.
#
# After `make install`, three things are still missing that a human would
# normally do by clicking:
#
#   Plane     a workspace, a project, an API token, and its mail settings
#   Outline   the first account, an API token, and this project's collection
#
# This does all of them through the services' own APIs - including the two traps
# that make the browser route painful (Plane's sign-up 500 when
# `is_telemetry_enabled` is sent, and Outline's refusal to offer a sign-in form
# on an instance that has no team yet) - and records what it learns in
# .runtime/secrets/.
#
# Idempotent: every step checks first and says what it skipped. Nothing is
# deleted. A step that cannot be completed prints the exact manual equivalent and
# stops, rather than leaving a half-configured service behind.
#
#   ./integrations/bootstrap.sh            # do everything that is missing
#   ./integrations/bootstrap.sh --status   # report only, change nothing
#   ./integrations/bootstrap.sh --skip-sync  # set up, but do not sync yet
#
# Needs only the services `make install` started. No secret has to exist yet:
# this is what creates them.

set -euo pipefail

# shellcheck source=../lib.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib.sh"

require_cmd curl
require_cmd jq
require_cmd openssl

STATUS_ONLY=0
DO_SYNC=1
while [ $# -gt 0 ]; do
  case "$1" in
    --status) STATUS_ONLY=1; shift ;;
    --skip-sync) DO_SYNC=0; shift ;;
    -h|--help) sed -n '2,26p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown argument: $1 (try --help)" ;;
  esac
done

load_env
require_project

PLANE_SECRETS="${SECRETS_DIR}/plane.env"
OUTLINE_SECRETS="${SECRETS_DIR}/outline.env"
ADMIN_FILE="${SECRETS_DIR}/admin.txt"
ADMIN_EMAIL="${ECOSYSTEM_ADMIN_EMAIL:-admin@example.com}"
PLANE_API="$(plane_url)"
OUTLINE_API="$(outline_url)"
JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT

ensure_dir "$SECRETS_DIR"
chmod 700 "$RUNTIME_DIR" "$SECRETS_DIR" 2>/dev/null || true

# --- helpers ----------------------------------------------------------------

# A fresh CSRF token from the service's own cookie jar. Django (Plane) and
# Outline both hand one out on any GET and require it back on a session write.
csrf_for() {
  # The cookie name matters and is not the same in both services: Django (Plane)
  # uses `csrftoken`, Outline uses `csrfToken`. Getting it wrong does not fail
  # loudly - it yields part of a header as the "token", and the service then
  # rejects the write with a bare 400. Hence the name is a parameter, and the
  # extraction matches case exactly.
  #
  # Never fails either: a service that offers no CSRF cookie gets no token, and
  # the caller then sends no header. Without the `|| true`, `set -o pipefail`
  # aborts the script on the empty match, silently.
  local base="$1" cookie="${2:-csrftoken}"
  curl -s -c "$JAR" -b "$JAR" -o /dev/null -D - "${base}/" 2>/dev/null \
    | grep -i "^set-cookie: ${cookie}=" \
    | sed -E "s/^[Ss]et-[Cc]ookie: ${cookie}=([^;]+).*/\1/" | head -1 || true
}

password_that_passes_zxcvbn() {
  # Plane refuses anything zxcvbn scores below 3, so this is not a formality:
  # a short or dictionary-shaped password fails the sign-up with a redirect the
  # caller has to notice. Mix lengths and character classes.
  printf '%s' "$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-20)A7-z"
}

manual_plane() {
  cat >&2 <<EOF

Finish Plane by hand (README.md, "Finishing Plane by hand"):
  1. open ${PLANE_API} and sign up - that account owns the workspace
  2. create a workspace, then a project with the identifier
     ${PLANE_PROJECT_IDENTIFIER}
  3. Profile -> API tokens, paste the token into ${PLANE_SECRETS} as
     PLANE_API_KEY, with PLANE_WORKSPACE_SLUG and PLANE_PROJECT_ID beside it
  4. /god-mode -> Email: host ${MAILPIT_CONTAINER}, port ${MAILPIT_SMTP_PORT},
     no security, any username/password
  5. re-run: make bootstrap
EOF
}

manual_outline() {
  cat >&2 <<EOF

Finish Outline by hand (README.md, "Finishing Outline by hand"):
  1. open ${OUTLINE_API} and sign in with the magic link it mails to
     $(mailpit_url) - the first account to sign in owns the team
  2. Settings -> API tokens: create one with every scope listed in
     ${OUTLINE_SECRETS}.example and paste it in as OUTLINE_API_TOKEN
  3. re-run: make bootstrap
EOF
}

# --- 1. are the services up? -----------------------------------------------

step "services"
for pair in "Plane:${PLANE_API}" "Outline:${OUTLINE_API}/_health" "Mailpit:$(mailpit_url)"; do
  name="${pair%%:*}"
  url="${pair#*:}"
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "$url" || true)"
  if printf '%s' "$code" | grep -q '^[23]'; then
    log "${name} answers (HTTP ${code})"
  else
    die "${name} did not answer at ${url} (HTTP ${code:-none}) - run: make install"
  fi
done

# --- 2. Plane ---------------------------------------------------------------
# Plane's proxy answers as soon as the single-page app is served, but the API is
# behind the first run's migrations - several hundred of them, which on a slow
# machine takes a quarter of an hour. Everything below talks to the API, so wait
# for the API itself rather than for the proxy.
step "Plane's API"
api_code=""
for i in $(seq 1 540); do
  api_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "${PLANE_API}/api/instances/" || true)"
  case "$api_code" in
    200|401|403) break ;;
  esac
  if [ $((i % 6)) -eq 0 ]; then
    log "still HTTP ${api_code:-none} after $((i * 10))s - first-run migrations take as long as they take; they run one at a time"
  fi
  sleep 10
done
case "$api_code" in
  200|401|403) log "Plane's API answered HTTP ${api_code}" ;;
  *) die "Plane's API did not answer at ${PLANE_API}/api/instances/ (last HTTP ${api_code:-none}).
   Watch the first run finish with:
     docker logs -f \$(docker ps --filter label=com.docker.compose.project=${PLANE_COMPOSE_PROJECT} --format '{{.Names}}' | grep migrator | head -1)" ;;
esac

step "Plane"

plane_key_works() {
  local key="$1"
  curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
    -H "X-API-Key: ${key}" "${PLANE_API}/api/v1/users/me/" | grep -q '^2'
}

# A different endpoint from the one above: `/api/v1/users/me/` needs no scope,
# but a missing token would still answer 401 there, so this is the honest check
# that the recorded token can read the project.
plane_token_reads_project() {
  local key="$1" slug="$2" project="$3"
  curl -s -o /dev/null -w '%{http_code}' --max-time 10 -H "X-API-Key: ${key}" \
    "${PLANE_API}/api/v1/workspaces/${slug}/projects/${project}/issues/?limit=1" | grep -q '^2'
}

existing_key="$(env_get "$PLANE_SECRETS" PLANE_API_KEY)"
existing_ws="$(env_get "$PLANE_SECRETS" PLANE_WORKSPACE_SLUG)"
existing_project="$(env_get "$PLANE_SECRETS" PLANE_PROJECT_ID)"
if [ -n "$existing_key" ] && [ -n "$existing_project" ] \
   && plane_token_reads_project "$existing_key" "$existing_ws" "$existing_project"; then
  log "the recorded API token still reads the project - keeping it"
  plane_bootstrapped=1
else
  plane_bootstrapped=0
fi

if [ "$plane_bootstrapped" -eq 0 ] && [ "$STATUS_ONLY" -eq 0 ]; then
  # Plane's god-mode API - the one a browser uses to sign up, create the first
  # workspace and mint personal API tokens - authenticates with an admin session
  # and a CSRF token whose cookie is HttpOnly, so only Plane's own admin app can
  # read it. It refuses an API key outright, and the sign-up form answers the
  # CSRF failure page to anything that is not that app.
  #
  # So the state a browser would create is created through Plane's own
  # management shell in its own container: the same models, the same database,
  # no browser. Everything after this uses the API token, which needs no session.
  plane_api_container() {
    docker ps --filter "label=com.docker.compose.project=${PLANE_COMPOSE_PROJECT}" \
              --filter "label=com.docker.compose.service=api" --format '{{.Names}}' | head -1
  }

  container="$(plane_api_container)"
  [ -n "$container" ] || {
    warn "could not find Plane's api container (compose project ${PLANE_COMPOSE_PROJECT})"
    manual_plane
    exit 1
  }

  admin_password="$(password_that_passes_zxcvbn)"
  identity="$(docker exec \
    -e PJ_SLUG="$PROJECT_SLUG" -e PJ_NAME="$PROJECT_NAME" \
    -e PJ_IDENTIFIER="$PLANE_PROJECT_IDENTIFIER" -e PJ_EMAIL="$ADMIN_EMAIL" \
    -e PJ_LABEL="${PROJECT_SLUG}-ecosystem" -e PJ_PASSWORD="$admin_password" \
    "$container" python manage.py shell -c '
import os, uuid

from django.contrib.auth.hashers import make_password

from plane.db.models import (
    APIToken,
    Profile,
    Project,
    User,
    Workspace,
    WorkspaceMember,
)
from plane.license.models import Instance, InstanceAdmin

email = os.environ["PJ_EMAIL"]
user, created = User.objects.get_or_create(
    email=email,
    defaults={
        "username": uuid.uuid4().hex,
        "first_name": os.environ["PJ_NAME"],
        "password": make_password(os.environ["PJ_PASSWORD"]),
        "is_password_autoset": False,
    },
)
if created:
    Profile.objects.get_or_create(
        user=user, defaults={"company_name": os.environ["PJ_NAME"]}
    )
instance = Instance.objects.first()
instance.is_setup_done = True
instance.instance_name = os.environ["PJ_NAME"]
instance.save()
InstanceAdmin.objects.get_or_create(user=user, instance=instance)
workspace, _ = Workspace.objects.get_or_create(
    slug=os.environ["PJ_SLUG"],
    defaults={"name": os.environ["PJ_NAME"], "owner": user},
)
WorkspaceMember.objects.get_or_create(
    workspace=workspace, member=user, defaults={"role": 20}
)
project, _ = Project.objects.get_or_create(
    workspace=workspace,
    identifier=os.environ["PJ_IDENTIFIER"],
    defaults={"name": os.environ["PJ_NAME"], "created_by": user},
)
token = APIToken.objects.filter(
    user=user, workspace=workspace, label=os.environ["PJ_LABEL"], is_active=True
).first()
if token is None:
    token = APIToken.objects.create(
        user=user, workspace=workspace, label=os.environ["PJ_LABEL"]
    )
print("TOKEN=" + token.token)
print("WORKSPACE=" + workspace.slug)
print("PROJECT=" + str(project.id))
print("USER_CREATED=" + ("1" if created else "0"))
' 2>&1 | grep -E '^(TOKEN|WORKSPACE|PROJECT|USER_CREATED)=' || true)"

  plane_api_key="$(printf '%s' "$identity" | sed -n 's/^TOKEN=//p')"
  workspace_slug="$(printf '%s' "$identity" | sed -n 's/^WORKSPACE=//p')"
  project_id="$(printf '%s' "$identity" | sed -n 's/^PROJECT=//p')"

  if [ -z "$plane_api_key" ] || [ -z "$project_id" ]; then
    warn "Plane's shell did not return a workspace, project and token"
    warn "$(printf '%s' "$identity" | head -3)"
    manual_plane
    exit 1
  fi

  if printf '%s' "$identity" | grep -q '^USER_CREATED=1'; then
    log "created the instance admin ${ADMIN_EMAIL}"
    printf 'email:    %s\npassword: %s\n' "$ADMIN_EMAIL" "$admin_password" > "$ADMIN_FILE"
    chmod 600 "$ADMIN_FILE"
    log "its password is in .runtime/secrets/admin.txt"
  else
    log "the instance admin already existed - keeping its password"
  fi
  log "workspace ${workspace_slug}, project ${PLANE_PROJECT_IDENTIFIER} (${project_id})"
  log "minted an API token"

  umask 077
  cat > "$PLANE_SECRETS" <<EOF
# Plane API access for integrations/sync-roadmap.sh - written by
# integrations/bootstrap.sh on $(date -Iseconds). Mode 0600; never committed.
PLANE_API_KEY=${plane_api_key}
PLANE_WORKSPACE_SLUG=${workspace_slug}
PLANE_PROJECT_ID=${project_id}
EOF
  chmod 600 "$PLANE_SECRETS"
  log "wrote .runtime/secrets/plane.env"
fi

if [ "$plane_bootstrapped" -eq 1 ] && [ "$STATUS_ONLY" -eq 0 ]; then
  plane_api_key="$existing_key"
fi

# --- mail -------------------------------------------------------------------
# Plane seeds any instance setting that is missing from the environment when its
# api container starts, so the mail wiring is configured by plane/overrides.env
# (applied to variables.env by install.sh) rather than by an API call - the
# god-mode configuration endpoint refuses API keys. All that is left here is to
# report what Plane actually holds.
if [ "$STATUS_ONLY" -eq 0 ] && [ -n "$(plane_api_container 2>/dev/null || true)" ]; then
  mail_state="$(docker exec "$(plane_api_container)" python manage.py shell -c '
from plane.license.models import InstanceConfiguration
keys = ["ENABLE_SMTP", "EMAIL_HOST", "EMAIL_PORT"]
print("MAIL=" + ";".join(
    key + "=" + str(InstanceConfiguration.objects.filter(key=key).values_list("value", flat=True).first())
    for key in keys
))
' 2>/dev/null | grep '^MAIL=' || true)"
  case "$mail_state" in
    *"EMAIL_HOST=${MAILPIT_CONTAINER}"*"EMAIL_PORT=${MAIL_INTERNAL_SMTP_PORT}"*)
      log "Plane's mail settings point at ${MAILPIT_CONTAINER}:${MAIL_INTERNAL_SMTP_PORT}" ;;
    "") log "could not read Plane's mail settings (not fatal: check /god-mode -> Email)" ;;
    *) warn "Plane's mail settings read ${mail_state#MAIL=} - expected ${MAILPIT_CONTAINER}:${MAIL_INTERNAL_SMTP_PORT}" ;;
  esac
fi

# --- 3. Outline -------------------------------------------------------------

step "Outline"

outline_token_works() {
  # Deliberately an endpoint the token has a scope for. `auth.info` would answer
  # 403 for a correctly scoped key (it is not in the scope list), which reads as
  # "the token is broken" and would send every re-run down the sign-in path.
  local tok="$1"
  curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
    -X POST "${OUTLINE_API}/api/collections.list" \
    -H "Authorization: Bearer ${tok}" -H 'Content-Type: application/json' -d '{"limit":1}' \
    | grep -q '^2'
}

existing_token="$(env_get "$OUTLINE_SECRETS" OUTLINE_API_TOKEN)"
if [ -n "$existing_token" ] && outline_token_works "$existing_token"; then
  log "the recorded API token still works - keeping it"
  outline_bootstrapped=1
else
  outline_bootstrapped=0
fi

if [ "$outline_bootstrapped" -eq 0 ] && [ "$STATUS_ONLY" -eq 0 ]; then
  # --- 3a. first run ------------------------------------------------------
  # An instance with no team cannot offer a sign-in: Outline's /auth/email
  # answers 403 until one exists. /api/installation.create is the real first
  # run - it creates the team, the admin and a session, and refuses once a team
  # is present.
  token="$(csrf_for "$OUTLINE_API" csrfToken)"
  csrf_args=()
  [ -n "$token" ] && csrf_args=(-H "x-csrf-token: ${token}")
  reply="$(curl -s -w '\n%{http_code}' -c "$JAR" -b "$JAR" \
    -X POST "${OUTLINE_API}/api/installation.create" \
    -H 'Content-Type: application/json' "${csrf_args[@]}" \
    -d "$(jq -n --arg t "$PROJECT_NAME" --arg u "$ADMIN_EMAIL" \
      '{teamName:$t, userName:$t, userEmail:$u}')")"
  code="${reply##*$'\n'}"
  body="${reply%$'\n'*}"
  case "$code" in
    200|201) log "created the Outline team \"${PROJECT_NAME}\" with ${ADMIN_EMAIL} as owner" ;;
    *)
      # Anything else means an instance that is already installed - it refuses a
      # second first run, which is exactly what happens on a re-run or after
      # somebody has signed in once. Signing in below is the real test.
      log "Outline is already installed (HTTP ${code}) - signing in instead"
      ;;
  esac

  # --- 3b. session --------------------------------------------------------
  # A magic link, picked up from the sink. This is also the proof that Outline's
  # mail wiring works.
  token="$(csrf_for "$OUTLINE_API" csrfToken)"
  csrf_args=()
  [ -n "$token" ] && csrf_args=(-H "x-csrf-token: ${token}")
  curl -s -o /dev/null -c "$JAR" -b "$JAR" -X POST "${OUTLINE_API}/auth/email" \
    -H 'Content-Type: application/json' "${csrf_args[@]}" \
    -d "$(jq -n --arg e "$ADMIN_EMAIL" '{email:$e, client:"web"}')" || true
  sleep 2
  message_id="$(curl -s "$(mailpit_url)/api/v1/messages?limit=1" | jq -r '.messages[0].ID // empty')"
  magic=""
  if [ -n "$message_id" ]; then
    magic="$(curl -s "$(mailpit_url)/api/v1/message/${message_id}" \
      | jq -r '[.Text,.HTML]|map(select(.!=null))|join(" ")' \
      | grep -oE 'https?://[^ "<>]+' | head -1 | sed 's/&amp;/\&/g' \
      | sed -E 's/.*[?&]token=([^&]+).*/\1/' || true)"
  fi
  if [ -z "$magic" ]; then
    warn "no Outline magic link arrived at $(mailpit_url)"
    manual_outline
    exit 1
  fi
  token="$(csrf_for "$OUTLINE_API" csrfToken)"
  csrf_args=()
  [ -n "$token" ] && csrf_args=(-H "x-csrf-token: ${token}")
  curl -s -o /dev/null -c "$JAR" -b "$JAR" -X POST "${OUTLINE_API}/auth/email.callback" \
    -H 'Content-Type: application/json' "${csrf_args[@]}" \
    -d "$(jq -n --arg t "$magic" '{token:$t, follow:"true", client:"web"}')"
  log "signed in to Outline with the magic link from the sink"

  # --- 3c. API token ------------------------------------------------------
  # The five scopes the syncs need. Deliberately NOT documents.delete: nothing
  # in this ecosystem deletes a document, and a key that cannot is a feature.
  token="$(csrf_for "$OUTLINE_API" csrfToken)"
  csrf_args=()
  [ -n "$token" ] && csrf_args=(-H "x-csrf-token: ${token}")
  reply="$(curl -s -w '\n%{http_code}' -c "$JAR" -b "$JAR" \
    -X POST "${OUTLINE_API}/api/apiKeys.create" \
    -H 'Content-Type: application/json' "${csrf_args[@]}" \
    -d "$(jq -n --arg n "${PROJECT_SLUG}-ecosystem" \
      '{name:$n, scope:["collections.list","collections.create","documents.list","documents.create","documents.update"]}')")"
  body="${reply%$'\n'*}"
  outline_token="$(printf '%s' "$body" | jq -r '.data.value // empty' 2>/dev/null || true)"
  if [ -z "$outline_token" ]; then
    warn "Outline API key creation failed: $(printf '%s' "$body" | head -c 300)"
    manual_outline
    exit 1
  fi
  umask 077
  cat > "$OUTLINE_SECRETS" <<EOF
# Outline API access for integrations/publish-docs.sh - written by
# integrations/bootstrap.sh on $(date -Iseconds). Mode 0600; never committed.
OUTLINE_API_TOKEN=${outline_token}
EOF
  chmod 600 "$OUTLINE_SECRETS"
  log "minted an Outline API token and wrote .runtime/secrets/outline.env"
fi

# --- 4. first sync ----------------------------------------------------------

if [ "$STATUS_ONLY" -eq 0 ] && [ "$DO_SYNC" -eq 1 ]; then
  step "first sync"
  "$INFRA_DIR/integrations/publish-docs.sh" --apply
  "$INFRA_DIR/integrations/sync-roadmap.sh" --apply
fi

# --- 5. status --------------------------------------------------------------

step "status"
# Everything needed to *use* this ecosystem, without opening a secret file: the
# wiring an agent or another harness needs in order to drive it.
printf '  %-16s %s\n' "project" "${PROJECT_NAME} (${PROJECT_SLUG})"
printf '  %-16s %s\n' "Plane" "$(plane_url)"
printf '  %-16s %s\n' "Outline" "$(outline_url)"
printf '  %-16s %s\n' "Mailpit" "$(mailpit_url)"
printf '  %-16s %s\n' "Plane workspace" "$(env_get "$PLANE_SECRETS" PLANE_WORKSPACE_SLUG "-")"
printf '  %-16s %s\n' "Plane project" "$(env_get "$PLANE_SECRETS" PLANE_PROJECT_ID "-")  identifier ${PLANE_PROJECT_IDENTIFIER}"
printf '  %-16s %s\n' "Outline set" "${OUTLINE_COLLECTION}"
printf '  %-16s %s\n' "external source" "${PLANE_EXTERNAL_SOURCE}"
printf '  %-16s %s\n' "Plane token" "$(env_get "$PLANE_SECRETS" PLANE_API_KEY | grep -q . && echo "recorded in ${PLANE_SECRETS#"$INFRA_DIR"/}" || echo 'NOT bootstrapped')"
printf '  %-16s %s\n' "Outline token" "$(env_get "$OUTLINE_SECRETS" OUTLINE_API_TOKEN | grep -q . && echo "recorded in ${OUTLINE_SECRETS#"$INFRA_DIR"/}" || echo 'NOT bootstrapped')"
printf '  %-16s %s\n' "admin account" "$([ -f "$ADMIN_FILE" ] && echo "$(head -1 "$ADMIN_FILE" | cut -d' ' -f2-)" || echo 'created by an earlier run, or by hand')"
printf '  %-16s %s\n' "next" "make verify"
