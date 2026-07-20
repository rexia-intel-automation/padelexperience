#!/usr/bin/env bash
# Dumps the remote MySQL database (Hostinger) to a timestamped .sql file under
# backups/. Run manually before risky migrations/deploys; not scheduled.
#
# Reads DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD from
# apps/site/.env.staging (gitignored, never committed) — same file used by
# scripts/staging-sync-env.sh.
set -euo pipefail

ENV_FILE="$(dirname "$0")/../apps/site/.env.staging"
[ -f "$ENV_FILE" ] || { echo "missing $ENV_FILE" >&2; exit 1; }
DB_HOST=$(grep '^DB_HOST=' "$ENV_FILE" | cut -d= -f2-)
DB_PORT=$(grep '^DB_PORT=' "$ENV_FILE" | cut -d= -f2-)
DB_NAME=$(grep '^DB_NAME=' "$ENV_FILE" | cut -d= -f2-)
DB_USER=$(grep '^DB_USER=' "$ENV_FILE" | cut -d= -f2-)
DB_PASSWORD=$(grep '^DB_PASSWORD=' "$ENV_FILE" | cut -d= -f2-)

BACKUP_DIR="$(dirname "$0")/../backups"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
OUT_FILE="$BACKUP_DIR/padel-$TIMESTAMP.sql"

mysqldump -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" > "$OUT_FILE"
echo "backup written to $OUT_FILE"
