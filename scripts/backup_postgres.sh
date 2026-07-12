#!/bin/sh
set -eu

if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

backup_dir="${POSTGRES_BACKUP_DIR:-./backups}"
timestamp="$(date +%Y%m%d-%H%M%S)"
target="$backup_dir/voyageplanner-$timestamp.dump"

mkdir -p "$backup_dir"
docker compose exec -T postgres sh -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > "$target"

test -s "$target"
echo "$target"
