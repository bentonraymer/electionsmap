#!/bin/sh
# Bind-mounted data folders are often created root-owned by Docker. When started as root,
# hand /data to the unprivileged "node" user, then drop privileges before starting the app.
set -e
if [ "$(id -u)" = "0" ]; then
  mkdir -p "${DATA_DIR:-/data}"
  chown -R node:node "${DATA_DIR:-/data}"
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi
exec "$@"
