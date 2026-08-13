#!/usr/bin/env bash
set -euo pipefail

backup_dir="${1:-./backups}"
mkdir -p "$backup_dir"
backup_dir="$(cd "$backup_dir" && pwd)"
filename="storepoint-$(date -u +%Y%m%dT%H%M%SZ).db"
target="$backup_dir/$filename"
uid_gid="$(id -u):$(id -g)"

if [[ -e "$target" ]]; then
  echo "Refusing to overwrite existing backup: $target" >&2
  exit 1
fi

echo "Creating SQLite backup: $target"
docker compose run --rm --no-deps -T --user "$uid_gid" \
  -v "$backup_dir:/backup" \
  web sh -eu -c "
    test -s /app/data/storepoint.db
    sqlite3 /app/data/storepoint.db \".backup '/backup/$filename'\"
  "

test -s "$target"
echo "Backup complete: $target"
