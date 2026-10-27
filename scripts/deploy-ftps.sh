#!/usr/bin/env bash
set -euo pipefail
# Do not enable tracing; the password stays in the process environment.
cd "$(dirname "$0")/.."
for command in node lftp; do
  command -v "$command" >/dev/null || { echo "Deployværktøj mangler: $command" >&2; exit 1; }
done
umask 077
task_deploy_tmp="$(mktemp -d)"
trap 'rm -rf "$task_deploy_tmp"' EXIT
if [[ "${1:-}" == "--diagnose" ]]; then
  node scripts/ftps-plan.mjs "$task_deploy_tmp/plan" --diagnose
elif [[ -z "${1:-}" ]]; then
  node scripts/ftps-plan.mjs "$task_deploy_tmp/plan"
else
  echo 'Ugyldig kørselsmåde' >&2
  exit 1
fi
# Connection details must be explicitly configured; no account is assumed.
FTPS_HOST="${FTPS_HOST:?FTPS_HOST mangler}"
FTPS_USERNAME="${FTPS_USERNAME:?FTPS_USERNAME mangler}"
FTPS_PORT="${FTPS_PORT:?FTPS_PORT mangler}"
# The plan sets mandatory TLS+certificate+hostname verification before the first request.
# ftp:// plus AUTH TLS is explicit FTPS on port 21 (not implicit FTPS on port 990).
# --env-password keeps credentials out of arguments, files and generated command plans.
LFTP_PASSWORD="$FTPS_PASSWORD" lftp --env-password -u "$FTPS_USERNAME" -p "$FTPS_PORT" "ftp://$FTPS_HOST" < "$task_deploy_tmp/plan"
if [[ "${1:-}" == "--diagnose" ]]; then
  echo 'FTPS-login, TLS og offentlig kontorod kontrolleret. Ingen filer er overført.'
else
  echo 'De fire offentlige kodefiler er overført. Kontrollér HTTPS-adressen og log ind.'
fi
