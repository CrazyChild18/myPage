#!/usr/bin/env bash
set -euo pipefail

SSH_TARGET="${VOYAGEPLANNER_SSH_TARGET:-liyunkai@crazychild.cn}"
SSH_PORT="${VOYAGEPLANNER_SSH_PORT:-2002}"
REMOTE_CONTAINER="${VOYAGEPLANNER_CONTAINER:-voyageplanner}"
REMOTE_DB="${VOYAGEPLANNER_REMOTE_DB:-/data/voyageplanner.db}"
REMOTE_UPLOADS="${VOYAGEPLANNER_REMOTE_UPLOADS:-/data/uploads}"
LOCAL_DB="${VOYAGEPLANNER_LOCAL_DB:-backend/voyageplanner.db}"
LOCAL_UPLOADS="${VOYAGEPLANNER_LOCAL_UPLOADS:-backend/uploads}"
SCP_ARGS=()
if [[ "${VOYAGEPLANNER_SCP_LEGACY:-1}" != "0" ]]; then
  SCP_ARGS+=("-O")
fi

timestamp="$(date +%Y%m%d-%H%M%S)"
remote_tmp="/tmp/voyageplanner-db-${timestamp}.db"
remote_uploads_tmp="/tmp/voyageplanner-uploads-${timestamp}"
local_backup_dir=".runtime/db-backups"
local_uploads_backup_dir=".runtime/upload-backups"

mkdir -p "$(dirname "$LOCAL_DB")" "$local_backup_dir"
mkdir -p "$local_uploads_backup_dir"

if [[ -f "$LOCAL_DB" ]]; then
  cp "$LOCAL_DB" "${local_backup_dir}/voyageplanner.local.${timestamp}.db"
fi

if [[ -d "$LOCAL_UPLOADS" ]]; then
  cp -R "$LOCAL_UPLOADS" "${local_uploads_backup_dir}/uploads.local.${timestamp}"
fi

ssh -p "$SSH_PORT" "$SSH_TARGET" \
  "docker cp ${REMOTE_CONTAINER}:${REMOTE_DB} ${remote_tmp}"

scp "${SCP_ARGS[@]}" -P "$SSH_PORT" "$SSH_TARGET:${remote_tmp}" "$LOCAL_DB"

ssh -p "$SSH_PORT" "$SSH_TARGET" \
  "rm -rf ${remote_uploads_tmp} && docker cp ${REMOTE_CONTAINER}:${REMOTE_UPLOADS} ${remote_uploads_tmp}"

rm -rf "$LOCAL_UPLOADS"
scp "${SCP_ARGS[@]}" -P "$SSH_PORT" -r "$SSH_TARGET:${remote_uploads_tmp}" "$LOCAL_UPLOADS"

ssh -p "$SSH_PORT" "$SSH_TARGET" "rm -f ${remote_tmp} && rm -rf ${remote_uploads_tmp}"

echo "Pulled server database into ${LOCAL_DB}"
echo "Pulled server uploads into ${LOCAL_UPLOADS}"
echo "Review and commit ${LOCAL_DB} and ${LOCAL_UPLOADS} when you want GitHub to match the server data."
