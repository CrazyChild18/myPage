#!/usr/bin/env bash
set -euo pipefail

SSH_TARGET="${VOYAGEPLANNER_SSH_TARGET:-liyunkai@crazychild.cn}"
SSH_PORT="${VOYAGEPLANNER_SSH_PORT:-2002}"
REMOTE_CONTAINER="${VOYAGEPLANNER_CONTAINER:-voyageplanner}"
REMOTE_DB="${VOYAGEPLANNER_REMOTE_DB:-/data/voyageplanner.db}"
LOCAL_DB="${VOYAGEPLANNER_LOCAL_DB:-backend/voyageplanner.db}"

timestamp="$(date +%Y%m%d-%H%M%S)"
remote_tmp="/tmp/voyageplanner-db-${timestamp}.db"
local_backup_dir=".runtime/db-backups"

mkdir -p "$(dirname "$LOCAL_DB")" "$local_backup_dir"

if [[ -f "$LOCAL_DB" ]]; then
  cp "$LOCAL_DB" "${local_backup_dir}/voyageplanner.local.${timestamp}.db"
fi

ssh -p "$SSH_PORT" "$SSH_TARGET" \
  "docker cp ${REMOTE_CONTAINER}:${REMOTE_DB} ${remote_tmp}"

scp -P "$SSH_PORT" "$SSH_TARGET:${remote_tmp}" "$LOCAL_DB"

ssh -p "$SSH_PORT" "$SSH_TARGET" "rm -f ${remote_tmp}"

echo "Pulled server database into ${LOCAL_DB}"
echo "Local database files are intentionally ignored by Git."
