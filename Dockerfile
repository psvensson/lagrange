# ---- builder: toolchain present only as a native-prebuild fallback ----
FROM node:22-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./

RUN apt-get update && \
  apt-get install -y --no-install-recommends python3 make g++ && \
  rm -rf /var/lib/apt/lists/* && \
  npm ci --omit=dev --no-audit --no-fund && \
  rm -rf node_modules/node-sql-parser/umd \
         node_modules/node-sql-parser/build \
         node_modules/node-sql-parser/*.map && \
  find node_modules/leveldown/prebuilds -mindepth 1 -maxdepth 1 \
         ! -name 'linux-x64' -exec rm -rf {} + && \
  rm -rf node_modules/better-sqlite3/deps \
         node_modules/better-sqlite3/src \
         node_modules/better-sqlite3/binding.gyp

# ---- runtime: distroless (no shell/apt/npm), node is the entrypoint ----
FROM gcr.io/distroless/nodejs22-debian12 AS runtime

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
COPY src/ ./src/

# Release provenance, set by release.yml (--build-arg VERSION/VCS_REF/
# BUILD_DATE). OCI labels are the only per-tag metadata surface registries
# show (Docker Hub tag view, Codeberg package UI, `docker inspect`); the
# per-release prose lives on the Codeberg release page and the Docker Hub
# repository description, both generated from CHANGELOG.md. Declared after
# the COPY layers so per-release build-args don't invalidate their cache.
ARG VERSION=dev
ARG VCS_REF=unknown
ARG BUILD_DATE=unknown
LABEL org.opencontainers.image.title="Lagrange" \
  org.opencontainers.image.description="Distributed SQL database and compute-near-data runtime: partitioned, Raft-replicated SQL tables with JS/WASM services running on the node that owns the data they read." \
  org.opencontainers.image.version="${VERSION}" \
  org.opencontainers.image.revision="${VCS_REF}" \
  org.opencontainers.image.created="${BUILD_DATE}" \
  org.opencontainers.image.source="https://codeberg.org/psvensson/lagrange" \
  org.opencontainers.image.url="https://hub.docker.com/r/psvensson/lagrange" \
  org.opencontainers.image.documentation="https://codeberg.org/psvensson/lagrange/src/branch/main/CHANGELOG.md" \
  org.opencontainers.image.licenses="AGPL-3.0-only"

# REST API, admin WS, transport WS (REST+2). Nothing listens on the old 9080.
EXPOSE 8080 8081 8082

# distroless ENTRYPOINT is ["/nodejs/bin/node"]; these args are appended to it.
CMD ["--max-old-space-size=1536", "src/index.js"]
