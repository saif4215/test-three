#!/bin/sh
# Container start-up. It starts as root for one reason only: a disk mounted by the host (Render, Fly, a Docker volume)
# is often owned by root, which would stop the app saving uploaded pictures. So the pictures folder is made writable
# for the app's own user, and then the app is started as that unprivileged user (never as root).
set -e

APP_USER="${APP_USER:-node}"

if [ "$(id -u)" = "0" ]; then
  dir="${UPLOAD_DIR:-/data/uploads}"
  mkdir -p "$dir"
  # Numeric ids: they work whatever the user's group happens to be called.
  uid="$(id -u "$APP_USER")"
  gid="$(id -g "$APP_USER")"
  # Only the first start on a fresh disk has anything to fix, so a big folder is not walked again on every restart.
  if [ "$(stat -c %u "$dir")" != "$uid" ]; then
    chown -R "$uid:$gid" "$dir" 2>/dev/null || echo "Note: could not make $dir writable for $APP_USER; picture uploads may fail (see Site check in the admin area)." >&2
  fi
  home="$(getent passwd "$APP_USER" | cut -d: -f6)"
  exec env HOME="${home:-/}" setpriv --reuid="$uid" --regid="$gid" --init-groups "$@"
fi

exec "$@"
