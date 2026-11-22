#!/bin/sh
set -eu
case "${ROLE:-all}" in
  all|web|worker) ;;
  *) echo 'Set ROLE to all, web or worker.' >&2; exit 1 ;;
esac
if [ "${MIGRATE_ON_START:-true}" = true ]; then
  node --import tsx scripts/migrate.ts
fi
case "${ROLE:-all}" in
  worker) exec node --import tsx scripts/worker.ts ;;
  *) exec node server.js ;;
esac
