---
audience: human
documentClass: current
---

# Start Here

Lagrange is a distributed runtime for data-intensive services: you author one
service — endpoint, partition functions, and reducer together — deploy it as
WASM, and Lagrange runs each part of a request on the nodes holding the
relevant data. Choose the path that matches what you want to do next. None of
these paths requires repository-development or automation documentation.

## Understand The Model

Why one logical service becomes physically distributed execution, and when
that is worth it.

1. Read [The Lagrange Native Programming Model](native-programming-model.md).
2. Read
   [Estimating Performance, Throughput, And Network Cost](performance-and-cost-estimation.md)
   for conservative ranges and calculation methods.
3. Follow [Rewrite A Hot Path For Lagrange](tutorials/rewrite-a-hot-path.md)
   to see a data-intensive operation restated as a partition function plus a
   reducer, with the transfer arithmetic.
4. Read [Process: Data Affinity](../architecture/process-data-affinity.md)
   when you want the placement mechanism rather than the application model.

The call path — a binding-declared data selector, partition-local `run`, and
a coordinated `reduce` — is implemented today and invoked with
`CALL BINDING $1` over an authenticated PostgreSQL-wire session. The richer
selector and pushdown surface remains future work; the programming-model doc
marks the boundary precisely.

## Build A Service

From zero to a deployed, invocable WASM service. Estimated reading and
execution time for the first pass: about one hour.

1. Read the
   [current capabilities and limitations](current-capabilities-and-limitations.md)
   so you know what a running cluster supports.
2. Follow [First Hour With Lagrange](tutorials/first-hour.md): start a node,
   run a SQL round trip, inspect the partition that owns the rows.
3. Learn the exact terms in the [vocabulary map](vocabulary.md).
4. Follow the [service deployment guide](service-deployment-guide.md) for the
   lifecycle SQL: `INSTALL SERVICE`, `CREATE BINDING`,
   `CONFIGURE SERVICE ACCESS`, `CALL BINDING`.
5. Run the
   [js-request-binding-deployment example](../examples/js-request-binding-deployment/README.md)
   to author a component in plain JavaScript and invoke it, or the
   [request-binding-deployment example](../examples/request-binding-deployment/README.md)
   for the same flow against a committed component. For the call path, run
   the
   [call-binding-account-summary example](../examples/call-binding-account-summary/README.md):
   a partition function and reducer authored together, invoked with
   `CALL BINDING $1`, computing an account summary across partitions. The
   [examples index](../examples/README.md) tracks what exists.
6. Read [Execution Semantics](execution-semantics.md) for the contract your
   service runs under: retries, idempotency, partial failure, budgets, and
   what happens when partitions move.
7. Read
   [Minimal Deployment Surface](../architecture/minimal-deployment-surface.md)
   when you need the owner and convergence model behind the lifecycle SQL.

The recommended migration unit is one expensive aggregation, transaction,
enrichment step, validation path, or state transition — not the whole
application.

## Operate A Cluster

Start with:

- [Bootstrap and readiness probes](bootstrap-readiness-probes.md)
- [Listener port model](listener-port-model.md)
- [Storage capacity operations](storage-capacity-operations.md)
- [Runtime resource diagnostics](runtime-resource-diagnostics.md)
- [Admin API reference](admin-api-reference.md)

Keep the
[current capabilities and limitations](current-capabilities-and-limitations.md)
page nearby. It is the implementation-status reference; planning documents are
not a statement of what a running cluster supports.

## How It Works

This path assumes normal application and database experience but no
distributed-systems specialization.

1. [Distributed-Systems Primer](distributed-systems-primer.md)
2. [Vocabulary](vocabulary.md)
3. [The Lagrange System Model](../architecture/system-model.md)
4. [Process: Partitioning](../architecture/process-partitioning.md)
5. [Process: Replication](../architecture/process-replication.md)
6. [Process: Rebalancing](../architecture/process-rebalancing.md)
7. [Process: Request Routing](../architecture/process-request-routing.md)
8. [Process: Data Affinity](../architecture/process-data-affinity.md)

The process documents explain the behavior with diagrams. The rest of the
[architecture index](../architecture/INDEX.md) is reference material to open
when a particular subsystem matters.

## Compatibility And Internals

Material here supports migration and implementation work; it does not define
Lagrange's programming model.

- **Drop-in SQL compatibility.** An unmodified Node.js PostgreSQL application
  can point at Lagrange's pgwire listener — see the
  [service-portability example](../examples/service-portability/README.md).
  PostgreSQL compatibility is bounded, not general.
- **OCI containers.** The `oci_container` runtime kind is registered but
  managed OCI activation is unsupported (scaffold only). The design contract
  lives at `architecture/oci-runtime-host-contract.md` (development-audience).
  OCI workloads would not receive the distributed, function-level, data-local
  execution model in any case.
- **Legacy callback surface.** The
  [distributed-sql example](../examples/distributed-sql/README.md) documents
  the pre-Binding uploaded-callback surface. It is a deliberate historical
  artifact, not the public service-deployment model.
- **Experimental runtimes.** `native_js` is the kernel-internal substrate
  (the SQL engine itself, and the MovieLens demo's service path); it is not a
  public authoring target.
