#!/usr/bin/env bash
# Hostinger's git redeploy recreates the nodejs/ app dir, wiping untracked
# files — including the .env. This script re-injects it. Run after every
# redeploy, then restart the app (hPanel or hosting_restartNode_jsApplicationV1).
# The database is remote MySQL and persists across redeploys.
#
# Reads everything from apps/site/.env.staging (gitignored, never committed):
#   SESSION_SECRET / ADMIN_EMAIL / ADMIN_PASSWORD / DB_*  -> app env
#   STAGING_SSH / STAGING_PORT / STAGING_DIR              -> connection info
set -euo pipefail

ENV_FILE="$(dirname "$0")/../apps/site/.env.staging"
[ -f "$ENV_FILE" ] || { echo "missing $ENV_FILE" >&2; exit 1; }
STAGING_SSH=$(grep '^STAGING_SSH=' "$ENV_FILE" | cut -d= -f2-)
STAGING_PORT=$(grep '^STAGING_PORT=' "$ENV_FILE" | cut -d= -f2-)
STAGING_DIR=$(grep '^STAGING_DIR=' "$ENV_FILE" | cut -d= -f2-)

scp -P "$STAGING_PORT" "$ENV_FILE" "$STAGING_SSH:$STAGING_DIR/.env"
ssh -p "$STAGING_PORT" "$STAGING_SSH" "cd $STAGING_DIR && chmod 600 .env"
echo "env injected; now restart the app and hit the site"
