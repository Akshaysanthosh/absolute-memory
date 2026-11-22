#!/bin/sh
set -eu
am_port=${AM_PORT:-3000}
am_origin=${APP_URL:-http://localhost:$am_port}
am_secret=${AUTH_SECRET:-$(openssl rand -base64 32)}
docker run -d --name absolute-memory -p "127.0.0.1:$am_port:3000" -v absolute-memory-data:/data \
  -e "AUTH_SECRET=$am_secret" -e "APP_URL=$am_origin" absolute-memory:local
