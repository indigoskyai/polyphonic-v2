#!/bin/sh
set -eu

if [ "${ATTACHMENT_SCANNER_DEV_BYPASS:-false}" != "true" ]; then
  freshclam --quiet || echo "freshclam could not refresh signatures; clamd will decide readiness" >&2
  clamd --foreground=false
fi

exec python /app/worker.py
