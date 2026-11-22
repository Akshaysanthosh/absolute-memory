#!/bin/sh
set -eu
cd "$(dirname "$0")/.."

npm ci --no-audit --no-fund
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run docker:build
sh scripts/docker-e2e.sh
npm run extension:zip
npm run check:hygiene
npm run check:licenses
npm run docs:check
