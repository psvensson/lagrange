# Examples

Three example families live here, ordered by how much infrastructure they
need. Each has its own README with exact commands.

## [distributed-sql/](distributed-sql/README.md)

Copyable partition-callback examples (basic iterator through WASM and
MovieLens affinity), run against a live node by a manifest-driven runner.

- **Prerequisites**: a running Lagrange node (`npm start` from the repo root).
- The per-example `index.js` files are callback modules loaded by the runner,
  not standalone programs — `node index.js` does nothing on its own.

## [movielens-access-affinity/](movielens-access-affinity/README.md)

Benchmark comparing a classic fetch-rows-into-the-app pattern (3-node
Postgres baseline) against Lagrange partition-callback execution on the
MovieLens 100k dataset.

- **Prerequisites**: a running Docker daemon (the baseline pulls
  `postgres:16`) and outbound internet access to `files.grouplens.org` for
  the dataset download.
- The callback it measures is `distributed-sql/07-movielens-access-affinity`
  — the same example from the family above, driven end-to-end with data
  loading and a baseline to compare against.

## [kubernetes-endpoint-sync-controller/](kubernetes-endpoint-sync-controller/README.md)

A controller that mirrors Lagrange cluster membership into a Kubernetes
EndpointSlice, with a Helm chart.

- **Prerequisites**: none for rendering the chart (`helm template`); a
  running Lagrange node plus Kubernetes credentials for the live modes (see
  its README).
