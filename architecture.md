# Lagrange Architecture

Lagrange is a distributed runtime for data-intensive services. A developer
authors one service — endpoints, partition functions, and reducers together —
deploys it as a WASM component, and existing applications call its endpoints
like any other service. The architecture explains how that one logical
service becomes physically distributed execution across the database
partitions holding its data.

> Logically one ordinary service. Physically distributed across the data.

The canonical architecture entry point is
[`architecture/INDEX.md`](architecture/INDEX.md). This root file is the
conceptual map and remains a compatibility pointer for existing links. Use
the index to choose a focused architecture domain file before reading
subsystem detail.

## The conceptual hierarchy

Every deeper architecture document hangs off one chain:

```text
Customer-facing service
    ↓  ingress
Endpoint invocation
    ↓  planning
Distributed execution plan
    ↓  routing and placement
Partition-local function calls
    ↓  storage
Database partitions and replicas
```

One subsystem owns each transition:

- **Service → endpoint invocation (ingress).** The PostgreSQL wire adapter
  classifies `CALL BINDING $1` as a distinct authenticated action, and the
  service-lifecycle command owner validates the payload and dispatches the
  invocation. Request Bindings take the parallel HTTP path through the
  request-cell HTTP adapter. Callers see a service endpoint; they never see
  partitions, replicas, or placement.
- **Invocation → distributed execution plan (planning).** `CallCellInvoker`
  asks the call-cell batch executor to plan shards from the
  binding-declared statement: the relevant partitions are resolved without
  fetching a single row. The plan is a set of per-partition shard slots
  plus one reduce slot.
- **Plan → partition-local calls (routing and placement).** The
  call-partition topology resolves each shard's host node from the
  canonical routing snapshot's partition leader; the call-binding route
  resolver then restricts Cell selection to ready Cells on that host. A
  missing Cell is not an error: it raises a bounded activation lease, and
  execution retries once the Cell is ready.
- **Partition-local execution.** The runtime-service call-cell handler on
  the host node fences the dispatch against its own topology view, builds
  the batch from its local partition replica, and hands typed rows to the
  guest `run` export inside a WASI component worker. Raw rows never leave
  the node; the function emits bounded partial results.
- **Reduction.** The reduce coordinator gates on a complete, fresh,
  disjoint set of shard partials, merges them deterministically, and
  publishes exactly one atomic result snapshot. A dedicated reduce lease
  pins the reduction to a single replica.
- **Placement follows demand.** Activation leases become rebalancer
  activation pins: the move planner folds them into placement targets, so
  the execution topology keeps tracking where invocations actually land
  and compute stays on the data.

Raft consensus, SQLite partition replicas, partition split/merge and
movement, metadata tables, durable workflows, and placement scoring are the
machinery beneath the bottom two layers. They keep the partitions this
chain lands on durable, consistent, and well placed. They are load-bearing
— and invisible to ordinary callers: replication and consensus are
underlying machinery, not concepts the service surface exposes.
