# Examples

Five runnable examples, ordered by how much infrastructure they need. Each
directory has its own README with step-by-step commands — pick the one that
matches what you want to try.

## Where each example fits

You deploy services to Lagrange through the Artifact / Binding / Cell surface:
`INSTALL SERVICE` and `CREATE BINDING` over the SQL ingress
([`architecture/minimal-deployment-surface.md`](../architecture/minimal-deployment-surface.md),
operator flow in
[`docs/wasm-services-user-guide.md`](../docs/wasm-services-user-guide.md)).
The **request-binding-deployment** example walks that path end to end; the
other examples explore neighbouring layers:

- **request-binding-deployment** installs a source-built WASI component,
  declares its immutable request Binding and table policy, and calls a ready
  Cell over HTTP.
- **service-portability** runs a built-in (axiomatic) runtime service — the
  bootstrap set that exists before any Binding.
- **distributed-sql** uses the partition-callback path (`code`,
  `module_manifests`), an older input that predates Bindings.
- **service-data-affinity** drives the internal placement substrate directly,
  so you can watch the same placement policy that owns Cell capacity at work.
- **kubernetes-endpoint-sync-controller** consumes endpoint metadata
  downstream of any runtime service.

## [request-binding-deployment/](request-binding-deployment/README.md)

Build a committed WAT component into a reproducible local OCI layout, boot a
disposable local node, deploy it with `INSTALL SERVICE`, `CREATE BINDING`, and
`CONFIGURE SERVICE ACCESS`, then see matched, denied, and unmatched HTTP
requests behave against a ready Cell.

- **You'll need**: Node.js 22.12+, repository dependencies, and `wasm-tools`
  on `PATH`.

## [service-portability/](service-portability/README.md)

Build one immutable Node/`pg` application image and run it unchanged against
stock PostgreSQL and Lagrange's PostgreSQL wire listener: a bounded SQL slice,
exact result parity, password authentication, verified TLS, and fail-closed
credential/certificate attacks.

- **You'll need**: Docker and Node.js 20+.

## [distributed-sql/](distributed-sql/README.md)

Copyable partition-callback examples, from a basic iterator through an internal
JavaScript-envelope lifecycle rehearsal, run against a live node by a
manifest-driven runner.

**Service portability status:** the current support matrix is
[`docs/service-portability-capabilities.json`](../docs/service-portability-capabilities.json),
and examples claim only capabilities marked as implemented there. The
rehearsal is not a WebAssembly binary or component. Service deployment is
declared through `INSTALL SERVICE` and `CREATE BINDING` (see
[`architecture/minimal-deployment-surface.md`](../architecture/minimal-deployment-surface.md));
the runnable
[`request-binding-deployment`](request-binding-deployment/README.md) example
shows that surface with a genuine WASI component. Managed OCI container
execution is not implemented yet, and OCI callback invocation remains
unsupported.

- **You'll need**: a running Lagrange node (`npm start` from the repo root).
- The per-example `index.js` files are callback modules loaded by the runner,
  not standalone programs — `node index.js` does nothing on its own.

## [service-data-affinity/](service-data-affinity/README.md)

The MovieLens comparison: the same top-ten ranking computed by PostgreSQL
grouped SQL, Lagrange distributed grouped SQL, and a replicated Lagrange
service whose ranking code learns and converges toward its data.

- **You'll need**: Docker for PostgreSQL and internet access for the first
  dataset download; Lagrange nodes run as local processes.

## [kubernetes-endpoint-sync-controller/](kubernetes-endpoint-sync-controller/README.md)

A controller that mirrors Lagrange cluster membership into a Kubernetes
EndpointSlice, with a Helm chart.

- **You'll need**: nothing for rendering the chart (`helm template`); a
  running Lagrange node plus Kubernetes credentials for the live modes (see
  its README).
