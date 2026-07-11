# Examples

Three example families live here, ordered by how much infrastructure they
need. Each has its own README with exact commands.

## [distributed-sql/](distributed-sql/README.md)

Copyable partition-callback examples (basic iterator through WASM), run
against a live node by a manifest-driven runner.

- **Prerequisites**: a running Lagrange node (`npm start` from the repo root).
- The per-example `index.js` files are callback modules loaded by the runner,
  not standalone programs — `node index.js` does nothing on its own.

## [service-data-affinity/](service-data-affinity/README.md)

The unified MovieLens comparison: PostgreSQL grouped SQL, Lagrange
distributed grouped SQL, and a replicated Lagrange service whose
confidence-adjusted ranking code learns and converges toward its data.

- **Prerequisites**: Docker for PostgreSQL and internet access for the
  first dataset download; Lagrange nodes run as local processes.

## [kubernetes-endpoint-sync-controller/](kubernetes-endpoint-sync-controller/README.md)

A controller that mirrors Lagrange cluster membership into a Kubernetes
EndpointSlice, with a Helm chart.

- **Prerequisites**: none for rendering the chart (`helm template`); a
  running Lagrange node plus Kubernetes credentials for the live modes (see
  its README).
