#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: npm run docker:restore -- ./backups/storepoint-YYYYMMDDTHHMMSSZ.db" >&2
  exit 2
fi

source_dir="$(cd "$(dirname "$1")" && pwd)"
source="$source_dir/$(basename "$1")"
if [[ ! -s "$source" ]]; then
  echo "Backup file not found or empty: $source" >&2
  exit 1
fi

running="$(docker compose ps -q --status running web sync-worker 2>/dev/null || true)"
if [[ -n "$running" ]]; then
  echo "Refusing to restore while Docker services are running." >&2
  echo "Run: docker compose down" >&2
  exit 1
fi

rollback_filename="storepoint-pre-restore-$(date -u +%Y%m%dT%H%M%SZ).db"
rollback="$source_dir/$rollback_filename"
if [[ -e "$rollback" ]]; then
  echo "Refusing to overwrite existing rollback backup: $rollback" >&2
  exit 1
fi
# Create the destination as the invoking user so the root container process
# cannot leave a host-owned backup behind.
umask 077
touch "$rollback"

echo "Creating pre-restore rollback backup: $rollback"
docker compose run --rm --no-deps -T --user 0:0 \
  -v "$source:/restore/source.db:ro" \
  -v "$source_dir:/backup" \
  web sh -eu -c '
    test -s /app/data/storepoint.db
    sqlite3 /app/data/storepoint.db ".backup /backup/'"$rollback_filename"'"
  '
test -s "$rollback"

echo "Validating backup: $source"
docker compose run --rm --no-deps -T --user 0:0 \
  -v "$source:/restore/source.db:ro" \
  web sh -eu -c '
    integrity="$(sqlite3 /restore/source.db "PRAGMA integrity_check;")"
    if [ "$integrity" != "ok" ]; then
      echo "Backup integrity check failed: $integrity" >&2
      exit 1
    fi

    rm -f /app/data/storepoint.db.restored \
      /app/data/storepoint.db.restored-wal \
      /app/data/storepoint.db.restored-shm
    sqlite3 /restore/source.db ".backup /app/data/storepoint.db.restored"
    mv /app/data/storepoint.db.restored /app/data/storepoint.db
    rm -f /app/data/storepoint.db-wal /app/data/storepoint.db-shm
    chown node:node /app/data/storepoint.db
  '

echo "Restore complete. Rollback backup: $rollback"
echo "Start the stack with: docker compose up -d"
