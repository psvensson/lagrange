# Examples

Four example families live here, ordered by how much infrastructure they
need. Each has its own README with exact commands.

## [service-portability/](service-portability/README.md)

Build one immutable Node/`pg` application image and run it unchanged against
stock PostgreSQL and Lagrange's PostgreSQL wire listener. The live comparison
proves a bounded SQL slice, exact result parity, password authentication,
verified TLS, and fail-closed credential/certificate attacks.

- **Prerequisites**: Docker and Node.js 20+.

## [distributed-sql/](distributed-sql/README.md)

Copyable partition-callback examples, from a basic iterator through an internal
JavaScript-envelope lifecycle rehearsal, run against a live node by a
manifest-driven runner.

The current support matrix is
[`docs/service-portability-capabilities.json`](../docs/service-portability-capabilities.json).
**Service portability status:** examples may claim only capabilities marked as
implemented in that matrix.
The rehearsal is not a WebAssembly binary or component. Service deployment is
declared through INSTALL SERVICE and CREATE BINDING (see
[`architecture/minimal-deployment-surface.md`](../architecture/minimal-deployment-surface.md));
no example demonstrates that surface yet.
Managed OCI container execution is not implemented yet, and OCI callback
invocation remains unsupported.

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
