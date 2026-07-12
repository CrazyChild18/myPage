#!/bin/sh
set -eu

: "${UPLOAD_DIR:=/data/uploads}"
mkdir -p "$UPLOAD_DIR"

exec "$@"
