# Execution Semantics

This is the contract behind one distributed operation invoked directly over
`CALL BINDING $1` or from an HTTP handler through `call(descriptor, arguments)`.

## At a glance

| Question | Current contract |
| --- | --- |
| Where does `run()` execute? | On the node hosting the selected partition's leader replica |
| Do raw selected rows cross shard hosts? | No; the row batch is built from the receiver's local replica |
| What crosses the reduce boundary? | Bounded canonical finite-JSON partials under the declared schema |
| Are partial results returned after a shard failure? | No; one failed shard fails the invocation |
| Is result publication exactly once? | One atomic visible result per complete invocation |
| Is function execution exactly once? | No; retries or ambiguous outcomes can re-execute non-coordinated effects |
| Is there one cross-partition snapshot? | No; shards read independently |
| Are writes allowed in a call operation? | The current call path does not write user tables |
| Can the caller cancel? | Request invocations support cancellation and waiter detachment; cancellation does not establish rollback of committed effects |
| Can a retired partition target serve the call? | Stale topology is fenced and returned as a typed failure; this is not a global read-freshness guarantee |
| Can an HTTP handler call several operations? | Bounded sequential calls, one outstanding child at a time and no grandchildren |
| Can one component contain several operations? | `service-cell-v2` admits zero, one or multiple declared operations |

Here, a **shard** is one selected partition's task. A **slot** is that shard's
expected contribution to this invocation. A **Cell** is a running component
instance. A **lease** gives time-limited coordination ownership or activation
demand. See [Vocabulary](vocabulary.md) for the deployment terms.

The leader-local rule above applies to distributed calls. Ordinary SQL read
routing can consider other eligible replicas; do not transfer its preference
rules to `run()`. The receiving call host must read its input locally.

## End-to-end flow

```text
request or CALL BINDING
  -> authenticate and authorize
  -> resolve immutable Binding and component version
  -> parse declared single-table selector and normalize typed parameters
  -> resolve selected partitions without fetching rows
  -> for each shard, through a bounded concurrent pool:
       resolve partition-host Cell
       activate one if needed
       re-check topology and deadline on the host
       read a bounded local batch or advance an explicit paged accumulator
       invoke run(rows, arguments), or the declared accumulator steps
       collect emit(groupKey, boundedPartial)
       publish the complete shard slot under a lease
  -> require every expected slot, fresh and complete
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

The request invocation owner accepts cancellation and separates each caller's
wait from shared execution. Aborting one waiter detaches it; other waiters keep
the invocation alive. The last waiter leaving, an explicit invocation cancel,
or shutdown signals cancellation through that owner. This does not prove that
all remotely dispatched work stopped or that an already recorded transaction
decision was rolled back. A dropped connection still leaves the caller without
a terminal answer.

Once the deadline or a shard failure prevents progress, the shard dispatcher
stops admitting new shards; started work must settle and incomplete results
remain invisible. The [pilot operations gate](operations-readiness.md#pilot-operations-gate)
retains qualification of the selected public ingress, cancellation and complete
resource release on the actual deployment. These source mechanisms do not
establish that composed gate.

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
- outside its declared finite-JSON schema;
- a conflicting duplicate of an existing delivery identity; or
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

Direct `CALL BINDING` accepts `invocation_key`. The replay owner scopes it to
tenant and principal, binds it to invocation intent and the pinned Binding
generation, and refuses conflicting reuse. Retained terminal outcomes can be
replayed; an orphaned or uncertain execution remains explicitly ambiguous.
Unkeyed identical calls are separate invocations. A new key does not reuse an
old result, and this call-specific key is not a general SQL mutation retry key.

## Result and side-effect semantics

`emit(key, partial)` is the coordinated output channel from `run()`. The
`run()` return value is bookkeeping and is not part of reduction.

The coordinator publishes one result snapshot only after the complete partial
set exists. Re-leasing or replay may recompute internally without exposing an
intermediate result.

This is exactly-once visibility, not exactly-once execution. Logging, external
I/O, or any other effect performed by guest code is outside the coordinated
result. Make any permitted effects idempotent or avoid them in `run()` and
`reduce()`. This warning does not grant an external I/O capability: the
component can use only the host interfaces actually supplied to it.

## Ordering and determinism

Cross-shard row order is not defined. Partial arrival order is not defined.

The coordinator presents a deterministic merged partial list for the same
complete set. Guest functions should nevertheless be deterministic pure
functions of their explicit inputs.

Semantic group keys may repeat across shards. Delivery identity is separate:
the reducer receives distinct contributions in deterministic order, rejects
conflicting duplicate deliveries and does not silently sum repeated keys.
The application's reducer defines how a group is combined.

The codec admits bounded null, Boolean, finite numeric, string, array and plain
record values. It enforces schema, depth, element and byte limits and rejects
cyclic values and unsafe integer numbers. This is not an arbitrary JavaScript
object or unbounded sketch format.

## Reads and transactions

The selector is one single-table `SELECT` fixed in the operation declaration.
Typed positional parameters are normalized by the selector-parameter owner and
bound for each invocation; callers cannot interpolate SQL text. A missing or
invalid selector makes the operation non-invocable.

An explicit paged operation folds bounded pages through its declared
accumulator over a pinned shard read view, with page, row, byte, state and time
limits. That view belongs to one shard and does not create a cluster snapshot
or an unbounded client streaming cursor.

Each shard reads its local partition independently. The invocation does not
establish one global snapshot, so concurrent writes may occur between shard
reads.

Topology fencing checks that work targets the current partition generation
and leader rather than a retired target. It does not make all shards observe
one instant or keep the input unchanged between separate calls.

For example, a transaction can move a value from partition A to partition B
between their reads. Reading A before the move and B after it can count the
value twice in the combined answer. Reject workloads that require a shared
snapshot across the whole call; local execution alone does not supply one.

The current distributed call path reads user tables and coordinates a result;
it does not write user tables. A request handler can separately use declared
write capabilities, with its own side-effect and idempotency responsibilities.

## SQL write outcomes

A SQL `INSERT`, `UPDATE` or `DELETE` (over PostgreSQL wire, the admin
WebSocket or the embedded application database) is proposed to its
partition's Raft group under one entry identity. When the serving replica
cannot say what became of a proposal it accepted (a leader change, a runtime
replacement, or an answer lost after delivery), the statement's outcome is
unknown: it may still commit.

| Case | What the client sees |
| --- | --- |
| Refused before proposal (no leader, backpressure) | An immediate typed refusal; nothing was proposed; unchanged |
| Outcome unknown, then resolved within the budget | The statement's original result, applied once; a replay of an applied entry answers its first affected-row count |
| Outcome still unknown when the budget is spent | A typed failure `partition_write_outcome_unknown` carrying the entry id and the wait spent; the write may have applied |

While the outcome is unknown the executor delivers the statement again under
the same entry identity, never as a new write. Deliveries back off
exponentially from `query.leaderRetryDelayMs` (50 ms) to 2 s: about 20
deliveries in 30 s. The budget is the statement's own deadline when the
caller passes one (the PostgreSQL wire statement wall-time budget, or
`timeoutMs`); otherwise it is `query.timeoutMs` (30 s). A statement that ends
unknown therefore returns at its deadline, not immediately: in that case
failure latency is up to the budget.

A statement that ended unknown can be re-issued safely only under the same
idempotency key with the same statement and parameters: the replay is
answered with the original result. Re-issuing it as a new statement can apply
it twice. The PostgreSQL wire and embedded application database surfaces do
not yet accept a caller idempotency key, so a client of those surfaces must
read the affected rows back to learn the outcome before it writes again.

SQL `INSERT` and `UPDATE` statements evaluate supported expressions, safely
escape string literals, and preserve dollar-quoted strings; unsupported AST
nodes fail closed with a typed refusal before mutation. `CREATE TABLE` enforces
`PRIMARY KEY` (including composite keys), `UNIQUE`, and `CHECK` constraints per
partition, while `FOREIGN KEY` and `REFERENCES` declarations across distributed
partitions are explicitly refused before creation.

## Movement

Partition split, replica movement, Binding replacement, and Cell replacement
can race with planning. The runtime checks immutable digests, partition epochs,
leader ownership, route identity, and reduce-lease ownership at several points.
Partition range placement and split boundary evaluation use unified UTF-8
byte-order (`BINARY`) key comparison across split keys and routing keys,
preventing split/routing placement divergence, while mixed-type key spaces
fail closed.

A stale target detected before guest execution is refused with a typed failure
and may be re-resolved within the retry budget. An uncertain outcome after
delivery remains ambiguous under the retry rules above. Topology movement does
not justify treating every failure as safe to retry or as replica corruption.

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
| Nested distributed calls per HTTP request | 16 sequential calls, depth 1 |
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

## Public outcome classes

A failed `CALL BINDING $1` reaches a PostgreSQL client as an error whose
`detail` field is a JSON object carrying `ownerCode` (the typed call code),
`outcomeClass`, and `retrySafe`. For a typed call routing failure the
message is a fixed per-code text that names no node, partition, replica, or
invocation; other failures carry their owner's message. A statement that
completes and returns its row is the success class.

The class is derived from the owner classification above plus the
invocation's execution evidence. It adds no guarantee: it tells the caller
whether guest code of that invocation can have run.

| Outcome class | Typical causes | `retrySafe` | Why |
| --- | --- | --- | --- |
| `success` | Every shard ran, reduce published one result | - | Exactly one visible result |
| `definitely_not_executed` | Unknown or ambiguous Binding, no statement, invalid statement or arguments, authentication or authorization, deadline before dispatch | No | Nothing ran; not retried by policy, and a retry is the caller's choice (most of these fail again; a deadline refusal may not) |
| `retryable_stale_target` | Partition, Cell, or version moved before any guest code ran | Yes | Re-resolution can succeed; nothing ran |
| `temporarily_unavailable` | No ready Cell on the shard host or anywhere, ingress shutting down before dispatch | Yes | Capacity or activation gap; nothing ran |
| `outcome_uncertain` | Acknowledged without an outcome, delivery or transport failure after dispatch, incomplete reduction, or any failure after another shard or the reduce of the same invocation already ran | No | Guest code may have run; no result is visible |
| `terminal_application_failure` | Guest exception, invalid component result, batch over its declared bound | No | The component or its declared bounds fail the same input again |

`retrySafe` means only that retrying cannot re-execute guest code of the
failed invocation. It is not exactly-once execution. A caller that retries an
`outcome_uncertain` invocation accepts possible re-execution of guest side
effects; the published result stays exactly-once visible either way.

Failures refused before the call owner is reached (wire authentication,
action authorization, or a malformed `CALL BINDING` payload) carry no
`outcomeClass`; they happen before any dispatch. A dropped connection
carries no error response at all and must be treated as uncertain.

## Current unresolved product requirements

The public surface does not yet provide:

- general SQL mutation idempotency keys or public outcome reconciliation;
- unbounded streaming shard input;
- concurrent invocations on one component instance;
- concurrent child calls or grandchildren;
- arbitrary per-call selector SQL;
- a global snapshot for one distributed call; or
- a JavaScript client SDK for direct external calls.

Typed selector parameters, bounded structured partials, explicit paged
accumulators and request cancellation are implemented mechanisms. Their full
composed service qualification remains with the pilot owner; none supplies
the missing guarantees above.
