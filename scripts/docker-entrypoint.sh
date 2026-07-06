#!/bin/sh
set -eu

: "${DATABASE_PATH:=/data/voyageplanner.db}"
: "${UPLOAD_DIR:=$(dirname "$DATABASE_PATH")/uploads}"

mkdir -p "$(dirname "$DATABASE_PATH")" "$UPLOAD_DIR"

if [ ! -f "$DATABASE_PATH" ] && [ -f /app/backend/voyageplanner.db ]; then
  cp /app/backend/voyageplanner.db "$DATABASE_PATH"
fi

if [ -d /app/backend/uploads ]; then
  find /app/backend/uploads -type f | while IFS= read -r source_file; do
    relative_path="${source_file#/app/backend/uploads/}"
    target_file="$UPLOAD_DIR/$relative_path"
    target_dir="$(dirname "$target_file")"
    mkdir -p "$target_dir"
    if [ ! -f "$target_file" ]; then
      cp "$source_file" "$target_file"
    fi
  done
fi

exec "$@"
