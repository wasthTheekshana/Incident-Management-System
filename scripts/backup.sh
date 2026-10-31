#!/usr/bin/env bash
# Daily backup of the CIMS database and uploaded attachments (NFR-9).
#
#   ./scripts/backup.sh
#
# Writes cims-db-<UTC timestamp>.dump (pg_dump custom format) and cims-files-<timestamp>.tar.gz to BACKUP_DIR,
# then deletes backups older than RETENTION_DAYS (default 30). Run it from cron, e.g.:
#   15 1 * * *  cd /opt/cims && ./scripts/backup.sh >> /var/log/cims-backup.log 2>&1
#
# Environment (all optional):
#   COMPOSE_FILE    compose file that defines the `postgres` service   (default docker-compose.prod.yml)
#   BACKUP_DIR      where backups are written                           (default ./backups)
#   RETENTION_DAYS  how long to keep them                               (default 30)
#   DB_USER/DB_NAME database credentials inside the container           (default cims/cims)
#   UPLOADS_VOLUME  docker volume holding attachments                   (default <project>_uploads)
#   HELPER_IMAGE    any image with tar + gzip, used to read the volume  (default postgres:16-alpine)
set -euo pipefail
umask 077 # backups contain personal data: owner-only permissions

cd "$(dirname "$0")/.."
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
DB_USER="${DB_USER:-cims}"
DB_NAME="${DB_NAME:-cims}"
PROJECT="${COMPOSE_PROJECT_NAME:-$(basename "$PWD" | tr '[:upper:]' '[:lower:]')}"
UPLOADS_VOLUME="${UPLOADS_VOLUME:-${PROJECT}_uploads}"
HELPER_IMAGE="${HELPER_IMAGE:-postgres:16-alpine}"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
db_file="$BACKUP_DIR/cims-db-$stamp.dump"
files_file="$BACKUP_DIR/cims-files-$stamp.tar.gz"
mkdir -p "$BACKUP_DIR"

# Write to a .partial name and rename on success so an interrupted run never leaves a believable-looking file.
echo "[$(date -u +%FT%TZ)] dumping database $DB_NAME"
docker compose -f "$COMPOSE_FILE" exec -T postgres pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc > "$db_file.partial"
[ -s "$db_file.partial" ] || { echo "ERROR: database dump is empty" >&2; rm -f "$db_file.partial"; exit 1; }
mv "$db_file.partial" "$db_file"

if docker volume inspect "$UPLOADS_VOLUME" > /dev/null 2>&1; then
  echo "[$(date -u +%FT%TZ)] archiving attachments from volume $UPLOADS_VOLUME"
  MSYS_NO_PATHCONV=1 docker run --rm -v "$UPLOADS_VOLUME":/data:ro --entrypoint tar "$HELPER_IMAGE" -C /data -cz . > "$files_file.partial"
  mv "$files_file.partial" "$files_file"
else
  echo "WARNING: volume $UPLOADS_VOLUME not found; attachments were NOT backed up" >&2
fi

find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'cims-db-*.dump' -o -name 'cims-files-*.tar.gz' \) -mtime +"$RETENTION_DAYS" -print -delete \
  | sed 's/^/pruned: /'

echo "[$(date -u +%FT%TZ)] backup complete: $db_file"
