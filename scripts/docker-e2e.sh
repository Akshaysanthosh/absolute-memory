#!/bin/sh
set -eu
cd "$(dirname "$0")/.."

image=${AM_TEST_IMAGE:-absolute-memory:local}
suite="am-e2e-$$"
port=${AM_E2E_PORT:-3210}
origin="http://127.0.0.1:$port"

cleanup() {
  code=$?
  if [ "$code" -ne 0 ]; then docker logs --tail 80 "$suite-app" >&2 || true; fi
  docker rm -fv "$suite-app" "$suite-provider" "$suite-fixture" >/dev/null 2>&1 || true
  docker network rm "$suite" >/dev/null 2>&1 || true
}
trap cleanup EXIT
trap 'exit 130' INT TERM

docker network create "$suite" >/dev/null
docker run -d --name "$suite-provider" --network "$suite" --network-alias provider \
  -e MOCK_PROVIDER_HOST=0.0.0.0 --entrypoint node \
  --mount "type=bind,source=$PWD/tests/fixtures/mock-provider,target=/app/tests/fixtures/mock-provider,readonly" \
  "$image" --import tsx tests/fixtures/mock-provider/main.ts >/dev/null
docker run -d --name "$suite-fixture" --network "$suite" --network-alias fixture --entrypoint node \
  --mount "type=bind,source=$PWD/tests/fixtures/article-server.mjs,target=/app/article-server.mjs,readonly" \
  "$image" article-server.mjs >/dev/null
docker run -d --name "$suite-app" --network "$suite" -p "127.0.0.1:$port:3000" \
  -e "APP_URL=$origin" -e "AUTH_SECRET=$(openssl rand -base64 32)" -e ALLOW_PRIVATE_NETWORK_FETCH=true -e ALLOW_REMOTE_IMAGES \
  -e AI_BASE_URL=http://provider:4010/v1 -e AI_MODEL=fixture \
  -e EMBEDDINGS_MODEL=fixture -e EMBEDDINGS_DIMENSIONS=8 \
  -e TRANSCRIPTION_BASE_URL=http://provider:4010/v1 -e TRANSCRIPTION_MODEL=fixture \
  "$image" >/dev/null

attempt=0
until curl --silent --fail --max-time 3 "$origin/api/health" >/dev/null; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ]; then exit 1; fi
  sleep 2
done
docker exec "$suite-app" absolute-memory doctor
APP_E2E_URL="$origin" AM_E2E_AI=1 AM_E2E_ARTICLE=http://fixture:4020/article npm run test:e2e
