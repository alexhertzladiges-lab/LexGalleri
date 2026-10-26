#!/usr/bin/env bash
set -euo pipefail
# Do not enable tracing: credentials are supplied through the environment only.
cd "$(dirname "$0")/.."
for command in node sftp sshpass ssh-keygen; do
  command -v "$command" >/dev/null || { echo "Deployværktøj mangler: $command" >&2; exit 1; }
done
umask 077
task_deploy_tmp="$(mktemp -d)"
trap 'rm -rf "$task_deploy_tmp"' EXIT
node scripts/sftp-plan.mjs "$task_deploy_tmp/batch"
# The plan validated host/user/port before they are used as arguments.
SFTP_PORT="${SFTP_PORT:-22}"
printf '%s\n' "$SFTP_KNOWN_HOSTS" > "$task_deploy_tmp/known_hosts"
if [[ "$SFTP_PORT" == "22" ]]; then
  task_host_pattern="$SFTP_HOST"
else
  task_host_pattern="[$SFTP_HOST]:$SFTP_PORT"
fi
ssh-keygen -F "$task_host_pattern" -f "$task_deploy_tmp/known_hosts" >/dev/null || {
  echo 'SFTP_KNOWN_HOSTS indeholder ikke en nøgle til denne vært og port.' >&2
  exit 1
}
# Only SFTP is used; no remote shell, recursive sync, delete or config upload.
SSHPASS="$SFTP_PASSWORD" sshpass -e sftp \
  -oBatchMode=no \
  -oStrictHostKeyChecking=yes \
  -oUserKnownHostsFile="$task_deploy_tmp/known_hosts" \
  -oGlobalKnownHostsFile=/dev/null \
  -oConnectTimeout=20 \
  -oNumberOfPasswordPrompts=1 \
  -oPreferredAuthentications=password,keyboard-interactive \
  -oPubkeyAuthentication=no \
  -oLogLevel=ERROR \
  -P "$SFTP_PORT" -b "$task_deploy_tmp/batch" "$SFTP_USERNAME@$SFTP_HOST"
echo 'De seks kodefiler er overført. Kontrollér HTTPS-adressen og log ind.'
