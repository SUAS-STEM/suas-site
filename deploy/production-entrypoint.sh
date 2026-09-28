#!/bin/sh
set -eu

# The release itself is mounted read-only. The image optimizer cache is a
# separate writable volume, so initialize its ownership before dropping to the
# normal unprivileged application user.
chown 1001:1001 /app/.next/cache
exec setpriv --reuid=1001 --regid=1001 --clear-groups -- node server.js
