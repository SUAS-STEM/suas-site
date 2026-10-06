#!/bin/sh
set -eu

# The release itself is mounted read-only. The image optimizer cache is a
# separate writable volume mounted at /var/cache. The standalone artifact's
# .next/cache is a symlink to this directory, so the app remains read-only.
chown 1001:1001 /var/cache
chown 1001:1001 /run/suas-deploy-trigger
chmod 0700 /run/suas-deploy-trigger
exec setpriv --reuid=1001 --regid=1001 --clear-groups --no-new-privs -- node server.js
