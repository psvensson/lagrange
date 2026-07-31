---
audience: human
documentClass: current
---

# Start Here

Choose the path that matches what you want to accomplish. None of these paths
requires repository-development or automation documentation.

## I Want To Understand Why Lagrange Is Different

1. Read [The Lagrange Native Programming Model](native-programming-model.md).
2. Follow [Rewrite A Hot Path For Lagrange](tutorials/rewrite-a-hot-path.md).
3. Read [Process: Data Affinity](../architecture/process-data-affinity.md) when
   you want the placement mechanism rather than the application model.

This path explains the distinction between deploying an existing WASM or future
OCI artifact and rewriting a data-intensive operation so computation moves to
its current partitions. It also separates the current public component API from
the intended selector, call, pushdown, and reduction surface.

## I Want To Try Lagrange

Estimated reading and execution time: about one hour.

1. Read the [current capabilities and limitations](current-capabilities-and-limitations.md).
2. Follow [First Hour With Lagrange](tutorials/first-hour.md).
3. Run the
   [JavaScript request-binding example](../examples/js-request-binding-deployment/README.md)
   to see the current public component context.
4. Use the [examples index](../examples/README.md) to choose a deeper scenario.

At the end you should have started a node, run a SQL round trip, inspected the
partition that owns the rows, and invoked a genuine WASI request Binding.

## I Want To Build A Service

1. Read [The Lagrange Native Programming Model](native-programming-model.md) so
   you choose the right extraction boundary.
2. Learn the exact terms in the [vocabulary map](vocabulary.md).
3. Follow the [service deployment guide](service-deployment-guide.md).
4. Run the
   [request-binding-deployment example](../examples/request-binding-deployment/README.md),
   or the
   [js-request-binding-deployment example](../examples/js-request-binding-deployment/README.md)
   to author the component in plain JavaScript.
5. Read [Minimal Deployment Surface](../architecture/minimal-deployment-surface.md)
   when you need the owner and convergence model.

The older uploaded callback surface is not the public service-deployment model
and is not part of the public documentation.

## I Want To Rewrite A Hot Path

1. Measure the existing statements, rows, bytes, and latency.
2. Follow [Rewrite A Hot Path For Lagrange](tutorials/rewrite-a-hot-path.md).
3. Run the
   [MovieLens data-affinity example](../examples/service-data-affinity/README.md)
   to compare PostgreSQL grouped SQL, Lagrange distributed SQL, and bounded
   service reduction.
4. Use [Process: Data Affinity](../architecture/process-data-affinity.md) to
   inspect how successful service-issued access becomes placement evidence.
5. Keep [Current Capabilities And Limitations](current-capabilities-and-limitations.md)
   open: the public `call` and `pushdown` invocation adapters are not implemented
   yet, even though their Binding source kinds are accepted.

The recommended migration unit is one expensive aggregation, transaction,
enrichment step, validation path, or state transition — not the whole
application.

## I Want To Understand The System

This path assumes normal application and database experience but no distributed
systems specialization.

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

## I Operate A Cluster

Start with:

- [Bootstrap and readiness probes](bootstrap-readiness-probes.md)
- [Listener port model](listener-port-model.md)
- [Storage capacity operations](storage-capacity-operations.md)
- [Runtime resource diagnostics](runtime-resource-diagnostics.md)
- [Admin API reference](admin-api-reference.md)

Keep the [current capabilities and limitations](current-capabilities-and-limitations.md)
page nearby. It is the implementation-status reference; planning documents are
not a statement of what a running cluster supports.
