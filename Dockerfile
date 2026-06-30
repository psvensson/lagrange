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
         ! -name 'linux-x64' -exec rm -rf {} +

# ---- runtime: clean base, no build toolchain ----
FROM node:22-slim AS runtime

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
COPY src/ ./src/

EXPOSE 8080 8081 9080

ENTRYPOINT ["node", "--max-old-space-size=1536", "src/index.js"]
