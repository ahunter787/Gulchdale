#!/usr/bin/env bash
# Back up everything this infrastructure holds, into backups/<timestamp>/.
#
#   - Plane:   PostgreSQL dump, uploaded files (MinIO data), settings/secrets
#   - Outline: PostgreSQL dump, uploaded files, environment/secrets
#   - Mailpit: the message database (so a magic link survives a restore)
#
# The result deliberately contains SECRETS (variables.env, outline.env): without
# them a restore cannot decrypt what Plane encrypted or sign anyone in. Treat
# backups/ as sensitive - it is gitignored, and it should not be copied to
# a machine you would not give the databases to.
#
# An untested backup is not a backup. MANIFEST.txt in each backup names the exact
# restore commands; practise a restore into a scratch project before trusting it.
#
#   ./integrations/backup.sh

set -euo pipefail

# shellcheck source=../lib.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib.sh"

require_cmd docker
load_env

STAMP="$(date +%Y-%m-%d_%H%M%S)"
OUT="${BACKUP_DIR}/${STAMP}"
ensure_dir "$OUT"

PLANE_DIR="${INFRA_DIR}/plane/plane-app"
PLANE_CONTAINERS="plane-app-plane-db-1"
OUTLINE_DB_CONTAINER="${OUTLINE_COMPOSE_PROJECT}-db"

container_running() {
  docker ps --format '{{.Names}}' | grep -qx "$1"
}

dump_postgres() {
  # dump_postgres <container> <dest-file> <label>
  local container="$1" dest="$2" label="$3"
  if ! container_running "$container"; then
    warn "${label}: container ${container} is not running - skipped its database"
    return 0
  fi
  docker exec "$container" sh -c 'pg_dump -U "${POSTGRES_USER:-plane}" -d "${POSTGRES_DB:-plane}" -Fc' > "$dest"
  log "${label}: database -> $(basename "$dest") ($(du -h "$dest" | cut -f1))"
}

archive_path() {
  # archive_path <host-dir> <dest-file> <label>
  local source="$1" dest="$2" label="$3"
  if [ ! -d "$source" ]; then
    warn "${label}: ${source} does not exist - skipped"
    return 0
  fi
  docker run --rm -v "${source}:/src:ro" alpine tar czf - -C /src . > "$dest"
  log "${label}: files -> $(basename "$dest") ($(du -h "$dest" | cut -f1))"
}

archive_volume() {
  # archive_volume <volume-name> <dest-file> <label>
  local volume="$1" dest="$2" label="$3"
  if ! docker volume inspect "$volume" >/dev/null 2>&1; then
    warn "${label}: volume ${volume} does not exist - skipped"
    return 0
  fi
  docker run --rm -v "${volume}:/src:ro" alpine tar czf - -C /src . > "$dest"
  log "${label}: files -> $(basename "$dest") ($(du -h "$dest" | cut -f1))"
}

step "backing up to backups/${STAMP}"

# --- Plane ------------------------------------------------------------------
if [ -f "${PLANE_DIR}/variables.env" ]; then
  dump_postgres "$PLANE_CONTAINERS" "${OUT}/plane-db.dump" "Plane"
  archive_path "${PLANE_DIR}/plane/data/minio" "${OUT}/plane-minio-files.tar.gz" "Plane"
  cp "${PLANE_DIR}/variables.env" "${OUT}/plane-variables.env"
  chmod 600 "${OUT}/plane-variables.env"
  log "Plane: settings -> plane-variables.env (contains secrets)"
else
  warn "Plane is not installed - skipped"
fi

# --- Outline ----------------------------------------------------------------
dump_postgres "$OUTLINE_DB_CONTAINER" "${OUT}/outline-db.dump" "Outline"
archive_volume "${OUTLINE_COMPOSE_PROJECT}_outline-data" "${OUT}/outline-files.tar.gz" "Outline"
if [ -f "${INFRA_DIR}/outline/outline.env" ]; then
  cp "${INFRA_DIR}/outline/outline.env" "${OUT}/outline.env"
  chmod 600 "${OUT}/outline.env"
  log "Outline: settings -> outline.env (contains secrets)"
fi

# --- Mailpit ----------------------------------------------------------------
archive_volume "${MAIL_COMPOSE_PROJECT}_mailpit-data" "${OUT}/mailpit-mail.tar.gz" "Mailpit"

# --- Manifest ---------------------------------------------------------------
cat > "${OUT}/MANIFEST.txt" <<EOF
Development ecosystem backup
created:  $(date -Iseconds)
host:     ${ECOSYSTEM_HOST}
Plane:    ${PLANE_VERSION:-unknown}      (project identifier ${PLANE_PROJECT_IDENTIFIER})
Outline:  ${OUTLINE_VERSION:-unknown}
Mailpit:  ${MAILPIT_VERSION:-unknown}

Contents
  plane-db.dump            Plane PostgreSQL, custom format (-Fc)
  plane-minio-files.tar.gz Plane uploads (MinIO data directory)
  plane-variables.env      Plane settings AND secrets
  outline-db.dump          Outline PostgreSQL, custom format (-Fc)
  outline-files.tar.gz     Outline uploads (outline-data volume)
  outline.env              Outline settings AND secrets
  mailpit-mail.tar.gz      Mailpit message database

Restore (into a stopped stack; this REPLACES the current data)
  # Plane database
  docker exec -i ${PLANE_COMPOSE_PROJECT}-plane-db-1 sh -c \\
    'pg_restore -U "\$POSTGRES_USER" -d "\$POSTGRES_DB" --clean --if-exists' < plane-db.dump
  # Plane files
  docker run --rm -v <abs path to plane/data/minio>:/dst -i alpine \\
    sh -c 'tar xzf - -C /dst' < plane-minio-files.tar.gz
  # Outline database
  docker exec -i ${OUTLINE_DB_CONTAINER} sh -c \\
    'pg_restore -U "\$POSTGRES_USER" -d "\$POSTGRES_DB" --clean --if-exists' < outline-db.dump
  # Outline files
  docker run --rm -v ${OUTLINE_COMPOSE_PROJECT}_outline-data:/dst -i alpine sh -c 'tar xzf - -C /dst' < outline-files.tar.gz

Settings are not in the archives: copy plane-variables.env / outline.env back
into place by hand, because overwriting them with an older copy rotates the
secrets the application is already using.
EOF

step "done"
printf '  %s\n' "${OUT#"$INFRA_DIR"/}"
printf '  total %s\n' "$(du -sh "$OUT" | cut -f1)"
printf '  restore commands: %s/MANIFEST.txt\n\n' "${OUT#"$INFRA_DIR"/}"
