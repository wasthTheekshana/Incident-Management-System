#!/usr/bin/env bash
# Restores CIMS from a backup, REPLACING the current database (and attachments, if an archive is given).
#
#   ./scripts/restore.sh --yes <cims-db-*.dump> [cims-files-*.tar.gz]
#
# Stops the API and web containers, restores, and starts them again. Run ./scripts/restore-test.sh first if you
# only want to check that a backup is usable. Without --yes this script refuses to do anything.
set -euo pipefail

cd "$(dirname "$0")/.."
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
DB_USER="${DB_USER:-cims}"
DB_NAME="${DB_NAME:-cims}"
PROJECT="${COMPOSE_PROJECT_NAME:-$(basename "$PWD" | tr '[:upper:]' '[:lower:]')}"
UPLOADS_VOLUME="${UPLOADS_VOLUME:-${PROJECT}_uploads}"
HELPER_IMAGE="${HELPER_IMAGE:-postgres:16-alpine}"

if [ "${1:-}" != "--yes" ] || [ -z "${2:-}" ]; then
  echo "Usage: $0 --yes <cims-db-*.dump> [cims-files-*.tar.gz]" >&2
  echo "This REPLACES the current database. Pass --yes to confirm." >&2
  exit 2
fi
dump="$2"
files="${3:-}"
[ -s "$dump" ] || { echo "ERROR: $dump not found or empty" >&2; exit 1; }
[ -z "$files" ] || [ -s "$files" ] || { echo "ERROR: $files not found or empty" >&2; exit 1; }

dc() { docker compose -f "$COMPOSE_FILE" "$@"; }

echo "Stopping api and web"
dc stop api web 2> /dev/null || true

echo "Restoring database from $dump"
dc exec -T postgres pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists --no-owner --exit-on-error < "$dump"

if [ -n "$files" ]; then
  echo "Restoring attachments from $files into volume $UPLOADS_VOLUME"
  docker volume create "$UPLOADS_VOLUME" > /dev/null
  MSYS_NO_PATHCONV=1 docker run --rm -i -v "$UPLOADS_VOLUME":/data --entrypoint tar "$HELPER_IMAGE" -C /data -xz < "$files"
fi

echo "Starting api and web"
dc up -d api web
echo "Restore complete."
