#!/usr/bin/env bash
# Proves the newest database backup can actually be restored (NFR-9: "restore shall be tested before go-live").
# Restores it into a throw-away database next to the live one, checks the data is there, then drops it.
# The live database is never touched. Safe to run on the production host, e.g. weekly from cron.
#
#   ./scripts/restore-test.sh [path/to/cims-db-*.dump]     (default: newest file in BACKUP_DIR)
set -euo pipefail

cd "$(dirname "$0")/.."
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
DB_USER="${DB_USER:-cims}"
DB_NAME="${DB_NAME:-cims}"
SCRATCH_DB="${DB_NAME}_restore_test"

dump="${1:-$(ls -1t "$BACKUP_DIR"/cims-db-*.dump 2> /dev/null | head -n 1 || true)}"
[ -n "$dump" ] && [ -s "$dump" ] || { echo "ERROR: no database backup found (looked in $BACKUP_DIR)" >&2; exit 1; }

dc() { docker compose -f "$COMPOSE_FILE" "$@"; }
psql_admin() { dc exec -T postgres psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d postgres -q "$@"; }
psql_db() { dc exec -T postgres psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$1" -t -A -c "$2"; }
cleanup() { psql_admin -c "DROP DATABASE IF EXISTS \"$SCRATCH_DB\"" > /dev/null 2>&1 || true; }
trap cleanup EXIT

echo "Restoring $dump into scratch database $SCRATCH_DB"
cleanup
psql_admin -c "CREATE DATABASE \"$SCRATCH_DB\""
dc exec -T postgres pg_restore -U "$DB_USER" -d "$SCRATCH_DB" --no-owner --exit-on-error < "$dump"

status=0
printf '%-20s %10s %10s\n' TABLE RESTORED LIVE
for table in Company User UserCompany Incident IncidentHistory Comment Attachment Notification IncidentTemplate TemplateField; do
  restored="$(psql_db "$SCRATCH_DB" "SELECT count(*) FROM \"$table\"")" || { echo "FAIL: table $table missing in restore" >&2; status=1; continue; }
  live="$(psql_db "$DB_NAME" "SELECT count(*) FROM \"$table\"")"
  printf '%-20s %10s %10s\n' "$table" "$restored" "$live"
done

# The schema migrations table must have come across too, or the restored database could not be upgraded safely.
migrations="$(psql_db "$SCRATCH_DB" 'SELECT count(*) FROM "_prisma_migrations"')"
[ "$migrations" -ge 1 ] || { echo "FAIL: no migration history in restored database" >&2; status=1; }

if [ "$status" -eq 0 ]; then
  echo "RESTORE TEST PASSED (RESTORED may be lower than LIVE if data was added after the backup was taken)"
else
  echo "RESTORE TEST FAILED" >&2
fi
exit "$status"
