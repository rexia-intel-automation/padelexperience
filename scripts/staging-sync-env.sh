#!/usr/bin/env bash
# Hostinger's git redeploy recreates the nodejs/ app dir, wiping untracked files:
# the .env is deleted and the SQLite DB is reseeded with a random admin password.
# This script re-injects the env file and resets the DB so the next boot seeds
# with the right credentials. Run after every redeploy, then restart the app
# (hPanel or the hosting_restartNode_jsApplicationV1 API) and hit the site once.
#
# Reads everything from apps/site/.env.staging (gitignored, never committed):
#   SESSION_SECRET / ADMIN_EMAIL / ADMIN_PASSWORD  -> app env
#   STAGING_SSH / STAGING_PORT / STAGING_DIR       -> connection info
set -euo pipefail

ENV_FILE="$(dirname "$0")/../apps/site/.env.staging"
[ -f "$ENV_FILE" ] || { echo "missing $ENV_FILE" >&2; exit 1; }
STAGING_SSH=$(grep '^STAGING_SSH=' "$ENV_FILE" | cut -d= -f2-)
STAGING_PORT=$(grep '^STAGING_PORT=' "$ENV_FILE" | cut -d= -f2-)
STAGING_DIR=$(grep '^STAGING_DIR=' "$ENV_FILE" | cut -d= -f2-)

scp -P "$STAGING_PORT" "$ENV_FILE" "$STAGING_SSH:$STAGING_DIR/.env"
ssh -p "$STAGING_PORT" "$STAGING_SSH" \
  "cd $STAGING_DIR && chmod 600 .env && rm -f apps/site/data/site.db apps/site/data/site.db-shm apps/site/data/site.db-wal"
echo "env injected + db reset; now restart the app and hit the site"
