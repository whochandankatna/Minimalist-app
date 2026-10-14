#!/usr/bin/env sh
# Off-server backup of the SQLite database (run from cron on the server, e.g. 23:45 IST daily).
# The app already writes nightly backups to $DATA/backups (30 kept). This script copies the
# newest one off the server. Set DEST to storage you control (e.g. rclone remote, another host).
set -eu
DATA="${TRADELAB_DATA_DIR:-/var/lib/docker/volumes/deploy_tradelab-data/_data}"
DEST="${DEST:?set DEST, e.g. user@backup-host:/srv/tradelab-backups/}"
LATEST="$(ls -1t "$DATA"/backups/tradelab-*.db | head -n 1)"
sha256sum "$LATEST" > "$LATEST.sha256"
scp "$LATEST" "$LATEST.sha256" "$DEST"
echo "copied $LATEST"
