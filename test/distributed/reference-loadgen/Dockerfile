FROM node:22.23.2-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5

WORKDIR /bench

COPY test/distributed/reference-client/package.json ./package.json
COPY test/distributed/reference-client/package-lock.json ./package-lock.json
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && \
    npm cache clean --force

COPY test/distributed/reference-client/tidb-oltp-adapter.js \
  ./test/distributed/reference-client/tidb-oltp-adapter.js
COPY test/distributed/harness/oltp-baseline-dataset.js \
  ./test/distributed/harness/oltp-baseline-dataset.js
COPY test/distributed/harness/oltp-baseline-workload.js \
  ./test/distributed/harness/oltp-baseline-workload.js
COPY scripts/checks/tidb-oltp-loadgen-runner.js \
  ./scripts/checks/tidb-oltp-loadgen-runner.js

ENTRYPOINT ["sleep"]
CMD ["1800"]
