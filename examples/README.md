# Examples

Six runnable examples, ordered by how much infrastructure they need. Each
directory has its own README with step-by-step commands.

Before choosing one, distinguish two questions:

1. **How do I package and deploy code?** Use the request-binding examples to
   learn Artifact / Binding / Cell and the current public
   `lagrange:cell/context` API.
2. **What changes when I rewrite work for data locality?** Use the MovieLens
   example to see shard-local policy, bounded reduction, attributed access, and
   placement that converges toward the data.

The conceptual bridge between them is
[The Lagrange Native Programming Model](../docs/native-programming-model.md).
The complete before-and-after walkthrough is
[Rewrite A Hot Path For Lagrange](../docs/tutorials/rewrite-a-hot-path.md).

## Where Each Example Fits

You deploy services through the Artifact / Binding / Cell surface:
`INSTALL SERVICE` and `CREATE BINDING` over the SQL ingress
([`architecture/minimal-deployment-surface.md`](../architecture/minimal-deployment-surface.md),
operator flow in the
[`Service Deployment Guide`](../docs/service-deployment-guide.md)).

The examples cover different layers:

- **request-binding-deployment** installs a source-built WASI component,
  declares its immutable request Binding and table policy, and calls a ready
  Cell over HTTP.
- **js-request-binding-deployment** walks the same public path with a component
  compiled from plain JavaScript by ComponentizeJS. This is the best API
  introduction for service authors today.
- **service-portability** runs one ordinary Node/`pg` application unchanged
  against PostgreSQL and Lagrange. It demonstrates compatibility, not native
  data-local execution.
- **distributed-sql** uses the older partition-callback input that predates
  Bindings.
- **service-data-affinity** compares a strong PostgreSQL grouped-SQL baseline,
  Lagrange distributed SQL, and a Lagrange service that performs shard-local
  application policy and bounded top-N reduction. This is the best proof of the
  native execution shape, but it currently drives the internal `native_js`
  substrate rather than a public `call` or `pushdown` Binding.
- **kubernetes-endpoint-sync-controller** consumes endpoint metadata downstream
  of runtime services.

## [request-binding-deployment/](request-binding-deployment/README.md)

Build a committed WAT component into a reproducible local OCI layout, boot a
disposable local node, deploy it with `INSTALL SERVICE`, `CREATE BINDING`, and
`CONFIGURE SERVICE ACCESS`, then see matched, denied, and unmatched HTTP
requests behave against a ready Cell.

This example answers: **How is a genuine WASI Artifact installed and invoked?**
It does not claim a public fan-out or reduction API.

- **You'll need**: Node.js 22.12+, repository dependencies, and `wasm-tools`
  on `PATH`.

## [js-request-binding-deployment/](js-request-binding-deployment/README.md)

Write a service in plain JavaScript, compile it into a genuine WASI component
with ComponentizeJS, and deploy it through the identical
`INSTALL SERVICE` / `CREATE BINDING` / `CONFIGURE SERVICE ACCESS` sequence.

The component imports only the current public context:

```js
import {read, write} from 'lagrange:cell/context';
```

Its ledger workload demonstrates durable table access, table-slot capability
mapping, successful reads and writes, and a denied undeclared access. The code
contains no database endpoint or node-selection logic.

- **You'll need**: Node.js 22.12+ and repository dependencies; no `wasm-tools`
  binary is required.

## [service-portability/](service-portability/README.md)

Build one immutable Node/`pg` application image and run it unchanged against
stock PostgreSQL and Lagrange's PostgreSQL wire listener: a bounded SQL slice,
exact result parity, password authentication, verified TLS, and fail-closed
credential/certificate attacks.

This is intentionally the compatibility end of the adoption ladder. The same
program and query boundary remain in place.

- **You'll need**: Docker and Node.js 20+.

## [distributed-sql/](distributed-sql/README.md)

Copyable partition-callback examples, from a basic iterator through an internal
JavaScript-envelope lifecycle rehearsal, run against a live node by a
manifest-driven runner.

The [current capabilities and limitations](../docs/current-capabilities-and-limitations.md)
page is the status authority. The rehearsal is not a WebAssembly binary or
component. Service deployment is declared through `INSTALL SERVICE` and
`CREATE BINDING`; the runnable request-binding examples show that surface with
genuine WASI components.

Managed OCI container execution is not implemented, and OCI callback invocation
remains unsupported.

- **You'll need**: a running Lagrange node (`npm start` from the repository
  root).
- The per-example `index.js` files are callback modules loaded by the runner,
  not standalone programs; `node index.js` does nothing on its own.

## [service-data-affinity/](service-data-affinity/README.md)

The MovieLens comparison computes the same top-ten ranking through:

1. PostgreSQL grouped SQL;
2. Lagrange distributed grouped SQL; and
3. a replicated Lagrange service whose ranking code learns and converges toward
   its data.

The third path applies Bayesian confidence-adjusted scoring on disjoint shards.
Each of two service replicas publishes at most ten candidates, so the merge
sees at most twenty rather than one aggregate per movie.

This example answers: **What can disappear when a hot path is rewritten for
partition-local work and bounded reduction?**

It currently uses the kernel-internal `native_js` query-loop module. It proves
the execution, transfer, and affinity shape, not yet an externally installed
`call` or `pushdown` Binding.

- **You'll need**: Docker for PostgreSQL and internet access for the first
  dataset download; Lagrange nodes run as local processes.

## [kubernetes-endpoint-sync-controller/](kubernetes-endpoint-sync-controller/README.md)

A controller that mirrors Lagrange cluster membership into a Kubernetes
EndpointSlice, with a Helm chart.

- **You'll need**: nothing for rendering the chart (`helm template`); a
  running Lagrange node plus Kubernetes credentials for the live modes.
