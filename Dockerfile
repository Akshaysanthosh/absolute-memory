# syntax=docker/dockerfile:1
ARG NODE_BASE=node:22.23.1-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3
FROM ${NODE_BASE} AS media
ARG TARGETARCH
RUN apt-get update && apt-get install -y --no-install-recommends build-essential ca-certificates curl pkg-config xz-utils \
    && rm -rf /var/lib/apt/lists/*
COPY docker/build-media.sh /build-media.sh
RUN sh /build-media.sh "$TARGETARCH"

FROM ${NODE_BASE} AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
COPY vendor/xlsx-0.20.3.tgz ./vendor/
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build
RUN npm prune --omit=dev --no-audit --no-fund \
    && rm -rf node_modules/next node_modules/@next/swc-* node_modules/lucide-react node_modules/@astryxdesign \
       node_modules/@fontsource* node_modules/@stylexjs node_modules/react-force-graph-2d node_modules/three \
    && mkdir /runtime \
    && cp -a .next/standalone/. /runtime/ \
    && cp -a node_modules/. /runtime/node_modules/ \
    && rm -rf /runtime/node_modules/sharp /runtime/node_modules/@img/sharp-* \
       /runtime/node_modules/@typescript /runtime/node_modules/typescript /runtime/node_modules/playwright* \
       /runtime/node_modules/@napi-rs/*-musl /runtime/node_modules/@img/*linuxmusl* \
    && find /runtime/node_modules -type f \( -name '*.map' -o -name '*.d.ts' -o -name '*.d.mts' -o -name '*.d.cts' \) -delete \
    && cp -a .next/static /runtime/.next/static \
    && cp -a db packages public scripts src tsconfig.json /runtime/

FROM ${NODE_BASE} AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 DATA_DIR=/data
COPY --from=build --chown=node:node /runtime/ /app/
COPY --from=media /opt/media/bin/ /usr/local/bin/
COPY --from=media /opt/media/notices/ /usr/share/doc/absolute-memory-media/
COPY docker/entrypoint.sh /usr/local/bin/absolute-memory-entrypoint
RUN install -d -m 0700 -o node -g node /data \
    && ln -s /app/packages/cli/cli.mjs /usr/local/bin/absolute-memory \
    && chmod 0755 /usr/local/bin/absolute-memory-entrypoint
USER node
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=15s --timeout=8s --start-period=35s --retries=4 CMD ["node", "--import", "tsx", "scripts/health.ts"]
ENTRYPOINT ["/usr/local/bin/absolute-memory-entrypoint"]
