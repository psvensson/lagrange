# Lagrange Architecture

Lagrange is a distributed service runtime with an integrated, partitioned SQL
storage layer. A service is authored as one unit, but one invocation may run
functions on several nodes that hold the relevant data.

```text
customer-facing service
    -> endpoint invocation
    -> distributed operation plan
    -> partition-local function runs
    -> bounded partial exchange
    -> reducer
    -> endpoint response
```

> Logically one ordinary service. Physically distributed across the data.

The canonical architecture map is [`architecture/INDEX.md`](architecture/INDEX.md).
This page gives the shortest conceptual orientation.

## The service path

An HTTP request Binding selects a handler in a ready service Cell. The handler
may invoke one declared distributed operation through its context. That
operation's fixed selector resolves the current partition set without fetching
rows at the coordinator.

For each selected partition, Lagrange dispatches `run()` to the node hosting the
partition leader replica. The receiver rechecks its topology fence, reads a
bounded batch from its local SQLite replica, and invokes the WASM component.
Only emitted numeric partials enter the coordination exchange.

A completeness gate requires every expected shard slot to be present, fresh,
bounded, and disjoint. The reducer runs under one lease and publishes one atomic
result snapshot. The request handler turns that result into the HTTP response.

## The storage path

Tables are range-partitioned. Every file-backed partition is a Raft group with
three replicas by default, each stored in its own SQLite database. Writes reach
the current partition leader and become visible only after the configured
commit path. Data-local service execution does not weaken that durability model.

System metadata uses the same table and partition model. Nodes maintain CDC-fed
local read models for routing and placement, but those caches are not the
durable authority that completes a workflow.

## Placement and movement

Cells are disposable compute; durable state belongs in tables. The cluster
places Cells from Binding intent, policy, capacity, topology, and observed data
access. A distributed call can also create a short-lived activation lease that
pins a Cell to a required partition host.

Partitions split, merge, and move through durable workflows. Requests carry
version and ownership fences, so a topology change produces a typed retryable
refusal rather than execution against a retired partition.

## Failure boundaries

- One missing replica does not stop a healthy three-replica partition quorum.
- File-backed SQLite replicas can rebuild through the active snapshot
  transfer/install path after required log history has been compacted.
- Learner promotion is still time-based rather than progress-proven.
- In-memory message-group logs do not use the SQLite snapshot lifecycle.
- Cells have no per-service Raft log; their durable effects must live in
  ordinary replicated tables.
- Distributed calls provide exactly-once result visibility, not exactly-once
  execution of every possible side effect.

## Security boundaries

Externally bound PostgreSQL-wire control and query traffic can use password
authentication and TLS. Request endpoints currently use HTTP Basic against the
same configured credential verifier. WASI components receive declared host
capabilities instead of open database credentials or arbitrary networking.

Node transport is plain WebSocket without cryptographic peer authentication.
The current deployment boundary therefore requires a trusted private network.
The admin WebSocket is unauthenticated and loopback-only by default.

## Start with the question

| Question | Document |
| --- | --- |
| What objects exist and where is durable state? | [System model](architecture/system-model.md) |
| How does one endpoint become distributed work? | [Service execution](architecture/minimal-deployment-surface.md) and [execution semantics](docs/execution-semantics.md) |
| How does a query find partitions and replicas? | [Request routing](architecture/process-request-routing.md) |
| How do tables split and merge? | [Partitioning](architecture/process-partitioning.md) |
| How does a write commit and a replica recover? | [Replication](architecture/process-replication.md) |
| How does compute follow data? | [Data affinity](architecture/process-data-affinity.md) |
| Why does the cluster move replicas and Cells? | [Rebalancing](architecture/process-rebalancing.md) |
| What is actually supported now? | [Current capabilities](docs/current-capabilities-and-limitations.md) |

Internal class ownership and source-file maps remain available in the deeper
reference documents, but they are not required to understand the product
contract.
