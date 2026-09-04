# Live Query Data Plane

Target architecture contract for push-backed observation of query results.

> **Status:** approved direction, not current capability. The checked-in live-query
> runtime already has useful pieces (`LiveQueryManager`, `QueryGroup`, CDC event
> evaluation and client grouping), but the generic application-data path described
> here is not yet complete. Current implementation status remains authoritative in
> [`docs/current-capabilities-and-limitations.md`](../docs/current-capabilities-and-limitations.md).

## Document role

This document defines how Lagrange should keep a table/query observation live
without consumers polling for change. It is the architecture boundary for the
Phase 0.3 generic live-query roadmap work.

It does **not** define a UI model, an Images object model, or a special cache.
Higher layers may decide that a selection, a visible presentation, a service
subscription, or another condition creates live interest. Core receives the
resulting query interest and owns distributed propagation from that point down.

## Non-negotiable invariant: no polling for distributed change detection

A consumer must never discover a distributed data change by repeatedly issuing
`SELECT`, `readStream`, head checks, object reads, or equivalent probes.

Steady-state change detection is event driven:

```text
committed table mutation
        |
        v
PartitionService CDC
        |
        v
relevant live-query subscription(s)
        |
        v
LiveQueryManager
        |
        +--> incremental result delta, when the plan supports it
        |
        `--> event-triggered query re-execution/reset, otherwise
```

Timers are allowed for leases, expiry, retry, transport recovery, and bounded
reconciliation. They are not allowed to determine whether data changed.
Recovery may re-establish a subscription or request a new snapshot; it must not
turn polling into the normal observation path.

## Single-owner boundaries

Generic live queries extend existing owners; they do not create a second query
or replication architecture.

| Concern | Owner | Rule |
| --- | --- | --- |
| SQL semantics, parsing, planning, execution | `SqlCore` / canonical distributed SQL owners | Live mode reuses the normal query plan. `src/live-query/` must not become a second SQL planner. |
| Partition/key routing | canonical partition resolver/planner | Live subscriptions consume the same partition footprint as ordinary execution. No `LiveQueryGroup`-local routing semantics. |
| Committed row-change source | `PartitionService` CDC | A live query observes committed mutation events; it does not scan for differences. |
| CDC continuity at a partition | existing CDC subscription handshake, buffer and replay path | The live-query path reuses this machinery rather than inventing a second change log. |
| Inter-node transport | `MessageRouter` and its existing routing owners | Subscription control and change delivery use normal transport ownership. |
| Live subscription lifecycle, grouping and result maintenance | `LiveQueryManager` | One owner creates/coalesces/reconfigures subscriptions and produces the client-visible live result stream. |
| System-table replicated read model | `SystemTableCache` | Remains the read model for CDC-propagated control-plane tables; it is not the generic live-query transport. |

The current `createLiveQueryStartupWiring()` adapter bridges
`SystemTableCache.onCacheChange()` into the live-query runtime. That remains a
valid compatibility path for cache-backed system-table observations during the
cutover, but it must not define the generic application-data architecture.

## Query contract

Conceptually, a live query is an ordinary query plus a continuing interest in
its result:

```js
const live = database.liveQuery(sql, params);

for await (const event of live) {
  // snapshot / insert / update / delete / reset
}
```

The exact public API can vary by adapter. The semantic contract does not:

1. the initial state is produced by the normal SQL execution owner;
2. the normal planner determines the tables/partitions relevant to the query;
3. core establishes push-backed interest in those partitions;
4. committed changes drive result maintenance;
5. cancellation/disconnection releases interest; and
6. an idle live query performs **zero repeated data reads solely to discover
   whether anything changed**.

`LIVE SELECT` remains a useful SQL spelling for adapters that want it. It is a
mode of normal query execution, not a separate query language.

## Snapshot-to-stream boundary

The initial result and the subsequent change stream must form one gap-free
observation.

A conforming implementation must establish a per-partition frontier/barrier so
that a mutation cannot disappear in the race between "run the initial query"
and "start following changes". Existing CDC handshake and replay machinery is
expected to provide the change-retention side of this boundary; normal SQL
snapshot/epoch semantics provide the read side.

The implementation may arm subscriptions before the snapshot and buffer until
cutover, or use an equivalent frontier protocol. The externally visible rule is
what matters:

- no committed relevant mutation is silently lost across subscription startup;
- replay/duplication must not corrupt the maintained result;
- when an exact incremental continuation cannot be proven, the owner emits a
  `reset`/fresh snapshot rather than pretending to have a precise delta; and
- reconnect/resume uses an opaque cursor/frontier owned by core, not a
  consumer-invented polling loop.

A live-query Quest is not complete merely because a WebSocket stays open. The
snapshot/frontier race must be falsified under concurrent writes.

## Selective distributed propagation

Generic live queries must not reuse the "broadcast a small system table to every
node" policy for arbitrary user data.

Instead, live interest is routed only to the partitions that can affect the
query. The partition-side subscription state is shared at the node/query-group
level where possible:

```text
consumer A --+
consumer B --+--> one local QueryGroup --> subscriptions --> partition p3
consumer C --+                              subscriptions --> partition p7
```

If many consumers on one node have the same canonical query/dependency set,
core coalesces them into one distributed subscription and fans the maintained
result out locally. The existing `QueryGroup` idea is therefore retained and
made subordinate to the canonical query plan.

A primary-key observation should normally subscribe to one relevant partition.
A broad table predicate may subscribe to several or all of that table's
partitions. Scale cost should follow the actual dependency footprint, not the
number of UI widgets or callers.

## Result maintenance levels

The first generic implementation does not need a complete incremental-view-
maintenance engine before every query can be live.

### Incremental path

For plans whose membership and projection can be safely evaluated from CDC row
changes, `LiveQueryManager` may emit row-level `insert`, `update`, and `delete`
deltas. Existing predicate/grouping code is useful implementation material, but
its SQL semantics must be derived from the canonical plan rather than maintained
as an independent parser/planner.

### Invalidation/re-execution path

For joins, aggregates, ordering/limits, or any plan not yet safely maintainable
from one row event, a relevant CDC event invalidates the live result and triggers
normal query re-execution. The consumer receives a `reset`/replacement snapshot
(or a diff computed from the new normal result).

This is still a live query. It is event driven, not polled. Incremental
maintenance is an optimization of the same contract, not a separate feature.

## Partition topology changes

Split, merge, move, and leader change must not leak physical topology into the
consumer contract.

`LiveQueryManager` responds to the canonical partition-topology owner and
recomputes the query's subscription footprint using the normal resolver. The
handoff must preserve the same gap-free observation rule as initial startup.
Existing CDC handshake/replay and partition-topology notification paths should
be reused rather than supplemented by periodic partition scans.

## Lifecycle and liveness

A live query is transient interest, even if observability metadata about it is
stored in the `live_queries` system table.

- client/view lifetime owns whether interest is active;
- identical interests are reference-counted/coalesced locally;
- disconnect releases or leases the interest according to the adapter contract;
- TTL cleanup is lifecycle cleanup, not data polling;
- recovery re-subscribes and resumes/resets through the same owner; and
- `live_queries` is monitoring/lifecycle metadata, not an alternate state or
  change-delivery source.

## Consumer contract: declare interest, do not implement propagation

Higher layers should express *what must remain current*, not *how to watch it*.
Examples include:

- one object row identified by a durable key;
- all rows currently represented by a visible list/table;
- a query underlying a dashboard or service calculation; or
- a set of dependencies derived from currently visible presentations.

A UI may therefore treat "visible" as the lifecycle trigger for a live query.
Core does not need to understand visibility. It receives a subscription when
interest becomes live and a release when it stops.

This is the intended integration point for systems such as `lagrange-images`
and `lagrange-object-environment`: they should consume this primitive instead of
inventing history polling, object polling, or per-view distributed watchers.
They remain responsible for their own authorization and semantic reread rules.

## Relationship to CDC and replication

Raft replication answers "is the write durable in its partition?". CDC answers
"what committed row changed?". A live query answers "which active query results
are affected, and what should their consumers receive?".

These are three layers of one path, not competing propagation systems. See
[Process: Replication](process-replication.md) for the existing commit and CDC
flow.

## Forbidden parallel mechanisms

The generic live-query cutover must remove or reject these patterns as owners:

1. interval-based SELECT/read loops for steady-state distributed observation;
2. history/head polling used only to learn that current state changed;
3. a second SQL predicate/compiler/routing semantics inside the live-query
   subsystem;
4. broadcasting arbitrary user-table CDC to every node merely because some
   client might be interested;
5. one distributed subscription per visible widget when equivalent interests
   can be coalesced;
6. UI/Images-specific distributed change transports parallel to the core live
   query path; and
7. snapshot-then-subscribe implementations with an unowned lost-update window.

## First implementation boundary

The initial cutover should prove the architecture with a deliberately narrow
but real end-to-end slice:

1. a normal single-table SELECT planned by the canonical SQL path;
2. one or more relevant partitions selected by the canonical resolver;
3. push-backed partition CDC subscription through the existing handshake/replay
   mechanism;
4. one shared query group on the receiving node;
5. a gap-free initial snapshot plus subsequent remote mutation;
6. unsolicited result update at the consumer; and
7. an idle observation window proving zero repeated data reads/SELECTs used for
   change detection.

Broader SQL maintenance can then widen behind the same contract. No temporary
polling mode is required or permitted as a stepping stone.
