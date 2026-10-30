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
if [[ "${1:-}" != "--diagnose" ]]; then
  node scripts/ftps-integrity.mjs preflight "$task_deploy_tmp/preflight" "$task_deploy_tmp/existing-index.php"
  LFTP_PASSWORD="$FTPS_PASSWORD" lftp --env-password -u "$FTPS_USERNAME" -p "$FTPS_PORT" "ftp://$FTPS_HOST" < "$task_deploy_tmp/preflight"
  node scripts/ftps-integrity.mjs check-root "$task_deploy_tmp/existing-index.php"
fi
LFTP_PASSWORD="$FTPS_PASSWORD" lftp --env-password -u "$FTPS_USERNAME" -p "$FTPS_PORT" "ftp://$FTPS_HOST" < "$task_deploy_tmp/plan"
if [[ "${1:-}" == "--diagnose" ]]; then
  echo 'FTPS-login, TLS og offentlig kontorod kontrolleret. Ingen filer er overført.'
else
  node scripts/ftps-integrity.mjs verify-plan "$task_deploy_tmp/verify-plan" "$task_deploy_tmp/verified"
  LFTP_PASSWORD="$FTPS_PASSWORD" lftp --env-password -u "$FTPS_USERNAME" -p "$FTPS_PORT" "ftp://$FTPS_HOST" < "$task_deploy_tmp/verify-plan"
  node scripts/ftps-integrity.mjs check-files "$task_deploy_tmp/verified"
  echo 'De offentlige appfiler er overført og genlæst med korrekte SHA-256-kontrolsummer.'
fi
