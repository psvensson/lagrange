# Execution Semantics

This is the contract behind one distributed operation invoked directly over
`CALL BINDING $1` or from an HTTP handler through `call(descriptor, arguments)`.

## At a glance

| Question | Current contract |
| --- | --- |
| Where does `run()` execute? | On the node hosting the selected partition's leader replica |
| Do raw selected rows cross shard hosts? | No; the row batch is built from the receiver's local replica |
| What crosses the reduce boundary? | Bounded finite numeric partials |
| Are partial results returned after a shard failure? | No; one failed shard fails the invocation |
| Is result publication exactly once? | One atomic visible result per complete invocation |
| Is function execution exactly once? | No; retries or ambiguous outcomes can re-execute non-coordinated effects |
| Is there one cross-partition snapshot? | No; shards read independently |
| Are writes allowed in a call operation? | The current call path does not write user tables |
| Can the caller cancel? | No; the deadline is the caller-side bound |
| Does movement return stale data? | No; topology drift is fenced and returned as a typed retryable failure |
| Can an HTTP handler call several operations? | One nested distributed call per request today |
| Can one component contain several operations? | The current pre-v2 code-first compiler allows one distributed operation |

## End-to-end flow

```text
request or CALL BINDING
  -> authenticate and authorize
  -> resolve immutable Binding and component version
  -> parse fixed single-table selector
  -> resolve selected partitions without fetching rows
  -> for each shard, through a bounded concurrent pool:
       resolve partition-host Cell
       activate one if needed
       re-check topology and deadline on the host
       read a bounded local batch
       invoke run(rows, arguments)
       collect emit(key, numericPartial)
       publish the complete shard slot under a lease
  -> require every expected slot, fresh and disjoint
  -> invoke reduce(partials, arguments) on the reduce-lease holder
  -> publish one atomic result snapshot
  -> return the reduced JSON
```

The default shard pool admits eight runs at once. Work on distinct hosts can
overlap. One component instance accepts one invocation at a time, so same-host
shards serialize.

## Deadlines

A call has one absolute deadline, 30 seconds by default. The same deadline is
threaded through planning, activation wait, local read, dispatch, WASM
execution, and reduction.

The receiver checks the deadline immediately before invoking the component. An
expired request is refused without running guest code.

Waiting for a missing Cell is bounded by the earlier of the caller deadline and
a 15-second activation window.

There is no caller-initiated cancellation. Closing the HTTP or PostgreSQL-wire
connection does not stop already dispatched work. Once the deadline or a shard
failure prevents progress, the coordinator stops admitting new shards; started
work settles and incomplete results remain invisible.

## Retries

Automatic retry occurs only when all three conditions hold:

1. the failure is classified retryable;
2. the runtime can prove the component did not execute; and
3. the attempt budget remains.

The default maximum is two attempts: the first attempt plus one retry.

Failures are classified as:

- **terminal** - retrying the same request cannot fix it;
- **retryable** - the target or topology can be resolved again and guest code
  did not run; or
- **ambiguous** - the runtime cannot prove whether guest code ran.

Ambiguous failures are never retried automatically. A caller that retries an
ambiguous outcome accepts possible re-execution of guest side effects.

When several started shards fail, the surfaced cause is selected by stable
shard-slot order rather than network arrival order.

## Partial failure

There are no silent partial answers. Every expected shard must publish a valid
slot before reduction.

The invocation fails when a slot is:

- missing;
- expired or stale;
- larger than its limit;
- malformed;
- non-numeric;
- duplicated by another shard key; or
- produced against stale topology.

A failed shard is not dropped from the answer.

## Idempotency and identity

Every distributed call receives a unique base identity. The runtime derives one
wire identity per shard and one for reduction. Component outcomes are journaled
by tenant and wire identity.

A redelivery of the same wire identity replays the journaled result rather than
re-executing the component.

For an HTTP request, a repeated outer request with the same `Idempotency-Key`
returns the journaled outer response and does not re-run its nested call.

Direct `CALL BINDING` does not currently accept a caller idempotency key. Two
identical direct calls are two invocations.

## Result and side-effect semantics

`emit(key, partial)` is the coordinated output channel from `run()`. The
`run()` return value is bookkeeping and is not part of reduction.

The coordinator publishes one result snapshot only after the complete partial
set exists. Re-leasing or replay may recompute internally without exposing an
intermediate result.

This is exactly-once visibility, not exactly-once execution. Logging, external
I/O, or any other effect performed by guest code is outside the coordinated
result. Make those effects idempotent or avoid them in `run()` and `reduce()`.

## Ordering and determinism

Cross-shard row order is not defined. Partial arrival order is not defined.

The coordinator presents a deterministic merged partial list for the same
complete set. Guest functions should nevertheless be deterministic pure
functions of their explicit inputs.

Partial keys must be shard-disjoint. A constant key emitted by several shards
is a contract violation, not a sum operation. Namespace keys with a
partition-local identity.

## Reads and transactions

The selector is one literal single-table `SELECT` fixed in the operation
declaration. A missing or invalid selector makes the operation non-invocable.

Each shard reads its local partition independently. The invocation does not
establish one global snapshot, so concurrent writes may occur between shard
reads.

Topology fencing guarantees that each shard executes against a current,
non-superseded partition replica. It does not make all shards observe one
instant.

The current distributed call path reads user tables and coordinates a result;
it does not write user tables. A request handler can separately use declared
write capabilities, with its own side-effect and idempotency responsibilities.

## Movement

Partition split, replica movement, Binding replacement, and Cell replacement
can race with planning. The runtime checks immutable digests, partition epochs,
leader ownership, route identity, and reduce-lease ownership at several points.

A moved target is returned as a typed retryable stale-target failure. It is not
served from a retired partition and it is not marked as replica corruption.

If a selected host lacks a ready Cell, that is an activation trigger. A
short-lived demand lease pins compute to the host until the call completes or
the lease expires.

## Version compatibility

Manifests, Bindings, and invocation payloads are versioned. A Binding pins an
exact package, manifest digest, and handler or export identity. A deployment
change during an invocation produces a stale-target refusal rather than mixing
component versions.

`0.x` product releases do not promise backward compatibility. Wire-level
version fencing protects one invocation; it does not constitute a supported
rolling-upgrade contract.

## Default limits

| Limit | Default |
| --- | ---: |
| Call deadline | 30,000 ms |
| Concurrent shard runs | 8 |
| Rows per shard batch | 4,096 |
| `emit()` calls per shard invocation | 64 |
| Partial entries per slot and merged cap | 1,024 |
| Coordination slots | 64 |
| Reduce lease | 30,000 ms |
| Activation lease | 60,000 ms |
| Coordination retention | 600,000 ms |
| Nested distributed calls per HTTP request | 1 |
| Direct-call payload | 1 MiB |

Binding budgets permit bounded CPU, wall time, memory, input, output, and
context sizes. Query execution has a separate ambient budget.

## Common failure categories

| Category | Typical cause | Retry guidance |
| --- | --- | --- |
| Invalid statement or arguments | Bad declaration or caller payload | Terminal |
| Authentication or authorization | Missing credentials, action, table, or call permission | Terminal |
| Batch or partial bound | Too many rows, bytes, emits, or malformed partials | Terminal until the design or budget changes |
| Guest failure | Exception or invalid component result | Terminal for the same input unless application policy says otherwise |
| Deadline | Absolute deadline passed | Terminal for that invocation; measure before raising limits |
| Host Cell unavailable | Activation or temporary capacity gap | Retryable before guest execution |
| Target stale | Partition, Cell, or version moved | Retryable after re-resolution |
| Unclassified transport outcome | Delivery may have reached guest code | Ambiguous; no automatic retry |

The exact typed codes remain part of the lower-level call contract in
[`architecture/minimal-deployment-surface.md`](../architecture/minimal-deployment-surface.md).

## Current unresolved product requirements

The public surface does not yet provide:

- caller cancellation;
- direct-call idempotency keys;
- structured partial values;
- streaming or paged shard input;
- concurrent invocations on one component instance;
- deeper nested calls;
- a parameterized per-call selector;
- a global snapshot for one distributed call; or
- a JavaScript client SDK for direct external calls.

These are not implied by the mechanics above.
