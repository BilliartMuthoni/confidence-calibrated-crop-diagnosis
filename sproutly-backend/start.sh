#!/bin/sh
# How the container starts (Dockerfile CMD).
set -e

# Photos go where Azure keeps them across restarts and redeploys (UPLOAD_DIR=/home/uploads).
UPLOAD_DIR="${UPLOAD_DIR:-uploads}"
mkdir -p "$UPLOAD_DIR"
if ! touch "$UPLOAD_DIR/.write-test" 2>/dev/null; then
    echo "Cannot write to $UPLOAD_DIR. On Azure, set WEBSITES_ENABLE_APP_SERVICE_STORAGE=true and UPLOAD_DIR=/home/uploads." >&2
    exit 1
fi
rm -f "$UPLOAD_DIR/.write-test"

# Bring the database up to date, then fill the advice library if it is still empty.
alembic upgrade head
python -m app.scripts.import_advice data/advice.csv --if-empty

# One process: the models take about 650 MB each time they are loaded, and one copy fits the
# B1 plan's 1.75 GB. Azure ends HTTPS in front of the container, so its forwarded headers are
# trusted (sign-in links are then built with https).
exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers 1 --proxy-headers --forwarded-allow-ips "*"
