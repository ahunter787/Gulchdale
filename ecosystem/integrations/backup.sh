#!/usr/bin/env bash
# Live project-scoped backup: never stops services or silently skips components.
set -euo pipefail
umask 077
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib.sh"
for command in docker jq git tar sha256sum envsubst; do require_cmd "$command"; done
load_env
PLANE_DB="${PLANE_COMPOSE_PROJECT}-plane-db-1"
PLANE_MINIO="${PLANE_COMPOSE_PROJECT}-plane-minio-1"
OUTLINE_DB="${OUTLINE_COMPOSE_PROJECT}-db"
OUTLINE_APP="${OUTLINE_COMPOSE_PROJECT}-app"
OUTLINE_VOLUME="${OUTLINE_COMPOSE_PROJECT}_outline-data"
MAIL_VOLUME="${MAIL_COMPOSE_PROJECT}_mailpit-data"
MINIO_SOURCE="${PLANE_DIR}/plane/data/minio"
STARTED="$(date -u +%FT%TZ)"

check_container() {
  local name="$1" project="$2" service="$3"
  docker inspect "$name" | jq -e --arg project "$project" --arg service "$service" \
    '.[0] | .State.Running == true and
     .Config.Labels["com.docker.compose.project"] == $project and
     .Config.Labels["com.docker.compose.service"] == $service' >/dev/null \
    || die "Missing, stopped or mismatched source container: ${name}"
}
check_mount() {
  local name="$1" destination="$2" kind="$3" source="$4"
  docker inspect "$name" | jq -e --arg dst "$destination" --arg kind "$kind" --arg src "$source" \
    '.[0].Mounts | any(.Destination == $dst and .Type == $kind and
      (if $kind == "volume" then .Name == $src else .Source == $src end))' >/dev/null \
    || die "Unexpected ${name} storage at ${destination}"
}
check_container "$PLANE_DB" "$PLANE_COMPOSE_PROJECT" plane-db
check_container "$PLANE_MINIO" "$PLANE_COMPOSE_PROJECT" plane-minio
check_container "$OUTLINE_DB" "$OUTLINE_COMPOSE_PROJECT" postgres
check_container "$OUTLINE_APP" "$OUTLINE_COMPOSE_PROJECT" outline
check_container "$MAILPIT_CONTAINER" "$MAIL_COMPOSE_PROJECT" mailpit
check_mount "$PLANE_MINIO" /export bind "${MINIO_SOURCE}/uploads"
check_mount "$PLANE_MINIO" /data bind "${MINIO_SOURCE}/data"
check_mount "$OUTLINE_APP" /var/lib/outline/data volume "$OUTLINE_VOLUME"
check_mount "$MAILPIT_CONTAINER" /data volume "$MAIL_VOLUME"
for volume in "$OUTLINE_VOLUME" "$MAIL_VOLUME"; do docker volume inspect "$volume" >/dev/null; done
for file in "$ENV_FILE" "${RUNTIME_DIR}/outline.env" "${PLANE_DIR}/variables.env" \
  "${PLANE_DIR}/docker-compose.yml" "${SECRETS_DIR}/plane.env" \
  "${SECRETS_DIR}/outline.env" "${SECRETS_DIR}/admin.txt" \
  "${STATE_DIR}/docs.json" "${STATE_DIR}/plane.json"; do
  [ -s "$file" ] || die "Required backup input missing or empty: ${file}"
done
[ -d "$MINIO_SOURCE" ] || die "Missing Plane uploads: ${MINIO_SOURCE}"
# Use cached helpers, pinned by image ID for this run. No pulls/installations.
TAR_IMAGE="$(docker image inspect alpine:latest --format '{{.Id}}')"
NODE_IMAGE="$(docker image inspect node:22-alpine --format '{{.Id}}')"
docker run --rm --pull=never --network=none --read-only "$NODE_IMAGE" \
  node --disable-warning=ExperimentalWarning -e \
  'if(typeof require("node:sqlite").backup!=="function")process.exit(1)'
git -C "$PROJECT_ROOT" check-ignore -q "${BACKUP_DIR}/probe" \
  || die "Backup directory must be ignored by Git"
mkdir -p "$BACKUP_DIR"
OUT="$(mktemp -d "${BACKUP_DIR}/$(date -u +%Y-%m-%d_%H%M%S_UTC).XXXXXX")"
chmod 700 "$OUT"
trap 'printf "Backup incomplete; retain for diagnosis, do not trust: %s\n" "$OUT" >&2' ERR
step "backing up to ${OUT}"

dump_postgres() {
  local container="$1" prefix="$2"
  docker exec "$container" sh -c \
    'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "${OUT}/${prefix}-db.dump"
  [ -s "${OUT}/${prefix}-db.dump" ] || die "Empty ${prefix} database dump"
  docker exec -i "$container" pg_restore --list < "${OUT}/${prefix}-db.dump" \
    > "${OUT}/${prefix}-db.catalog.txt"
  # Decode the entire archive without executing SQL or connecting to a database.
  docker exec -i "$container" pg_restore --file=/dev/null < "${OUT}/${prefix}-db.dump"
  log "${prefix}: catalog and complete archive decoding passed"
}
archive() {
  local kind="$1" source="$2" output="$3"
  shift 3
  docker run --rm --pull=never --network=none --read-only \
    --mount "type=${kind},source=${source},target=/src,readonly" \
    "$TAR_IMAGE" tar czf - "$@" -C /src . > "${OUT}/${output}"
  tar tzf "${OUT}/${output}" >/dev/null
  log "${output}: archive integrity passed"
}
dump_postgres "$PLANE_DB" plane
dump_postgres "$OUTLINE_DB" outline
archive bind "$MINIO_SOURCE" plane-minio-files.tar.gz
archive volume "$OUTLINE_VOLUME" outline-files.tar.gz
# WAL-aware online SQLite backup from a read-only volume, with only tmpfs writes
# in the disposable helper. Verified binary snapshot is streamed to the host.
docker run --rm --pull=never --network=none --read-only --tmpfs /tmp \
  --mount "type=volume,source=${MAIL_VOLUME},target=/source,readonly" \
  --mount "type=bind,source=${INFRA_DIR}/integrations/backup-mailpit.mjs,target=/backup-mailpit.mjs,readonly" \
  "$NODE_IMAGE" node --disable-warning=ExperimentalWarning /backup-mailpit.mjs \
  > "${OUT}/mailpit.db"
[ -s "${OUT}/mailpit.db" ] || die "Empty Mailpit snapshot"
log "Mailpit: SQLite online backup and integrity_check passed"

tar czf "${OUT}/runtime-config.tar.gz" -C "$RUNTIME_DIR" env outline.env secrets state
# Include proxy configuration, TLS material and overrides, even root-owned files.
# Exclude duplicate uploads, raw databases/queues/caches and runtime logs only.
archive bind "$PLANE_DIR" plane-deployment.tar.gz \
  --exclude=./plane/data --exclude=./plane/logs --exclude=./.git
# Preserve exact current tooling/config, including uncommitted backup fixes.
tar czf "${OUT}/ecosystem-deployment.tar.gz" -C "$INFRA_DIR" --exclude=./.runtime .
for archive_file in runtime-config plane-deployment ecosystem-deployment; do
  tar tzf "${OUT}/${archive_file}.tar.gz" >/dev/null
done
# Whitelist fields: full inspect output contains credentials.
for project in "$PLANE_COMPOSE_PROJECT" "$OUTLINE_COMPOSE_PROJECT" "$MAIL_COMPOSE_PROJECT"; do
  docker ps -aq --filter "label=com.docker.compose.project=${project}"
done > "${OUT}/container-ids.txt"
mapfile -t CONTAINER_IDS < "${OUT}/container-ids.txt"
docker inspect "${CONTAINER_IDS[@]}" | jq \
  '[.[] | {Id,Name,Image,imageReference:.Config.Image,
    project:.Config.Labels["com.docker.compose.project"],
    service:.Config.Labels["com.docker.compose.service"],
    mounts:[.Mounts[] | {Type,Name,Source,Destination,RW}]}]' > "${OUT}/sources.json"
jq -n --arg started "$STARTED" --arg finished "$(date -u +%FT%TZ)" \
  --arg commit "$(git -C "$PROJECT_ROOT" rev-parse HEAD)" \
  --arg tarImage "$TAR_IMAGE" --arg nodeImage "$NODE_IMAGE" \
  '{startedUTC:$started,finishedUTC:$finished,repositoryCommit:$commit,
    helpers:{tar:$tarImage,sqlite:$nodeImage},restoreTested:false,
    checks:["PostgreSQL catalogs and full archive decoding","gzip/tar listings",
      "Mailpit SQLite online backup and integrity_check","SHA256SUMS"],
    consistency:"Live backup: individual DB snapshots, not an atomic cross-service or DB/upload snapshot. Upload changes and in-flight jobs may not align. Redis/RabbitMQ transient queues excluded."}' \
  > "${OUT}/verification.json"
export BACKUP_PLANE_DB="$PLANE_DB" BACKUP_OUTLINE_DB="$OUTLINE_DB"
export BACKUP_MINIO_SOURCE="$MINIO_SOURCE" BACKUP_OUTLINE_VOLUME="$OUTLINE_VOLUME"
export BACKUP_MAIL_VOLUME="$MAIL_VOLUME" BACKUP_TAR_IMAGE="$TAR_IMAGE"
envsubst '${BACKUP_PLANE_DB} ${BACKUP_OUTLINE_DB} ${BACKUP_MINIO_SOURCE} ${BACKUP_OUTLINE_VOLUME} ${BACKUP_MAIL_VOLUME} ${BACKUP_TAR_IMAGE}' \
  < "${INFRA_DIR}/integrations/backup-manifest.txt" > "${OUT}/MANIFEST.txt"
(cd "$OUT" && find . -maxdepth 1 -type f ! -name SHA256SUMS -print0 \
  | sort -z | xargs -0 sha256sum > SHA256SUMS && sha256sum --check --quiet SHA256SUMS)
check_container "$PLANE_DB" "$PLANE_COMPOSE_PROJECT" plane-db
check_container "$PLANE_MINIO" "$PLANE_COMPOSE_PROJECT" plane-minio
check_container "$OUTLINE_DB" "$OUTLINE_COMPOSE_PROJECT" postgres
check_container "$OUTLINE_APP" "$OUTLINE_COMPOSE_PROJECT" outline
check_container "$MAILPIT_CONTAINER" "$MAIL_COMPOSE_PROJECT" mailpit
trap - ERR
step "verified backup complete (restore not tested)"
printf '  %s\n' "$OUT"
du -sh "$OUT"
