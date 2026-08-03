---
audience: human
documentClass: current
---

# Execution Semantics

This is the contract behind a distributed call. When an application invokes a
Lagrange service endpoint over `CALL BINDING $1`, partition functions run on
the nodes holding the data and a reducer combines the partials. This page
states exactly what the runtime guarantees while doing that — retries,
idempotency, failure, timing, ordering, limits — with the real production
values. Where a semantic is not decided yet, it says so.

For how to author the service, read the
[programming model](native-programming-model.md) first. The sealed design
contract behind this page is
[architecture/minimal-deployment-surface.md](../architecture/minimal-deployment-surface.md).

## One Invocation, End To End

```text
CALL BINDING $1  (authenticated pgwire)
  |
  | resolve binding -> ready route (statement required)
  | plan shards from the declared SELECT (no rows fetched)
  v
per shard, sequentially:
  dispatch run() to the partition's host node
    - host node re-checks the topology fence
    - host node reads its own replica (bounded)
    - run(batch, arguments) executes in the WASM worker
    - emit(key, partial) collects coordinated partials
  publish the shard's partials under a leased slot
  |
  | completeness gate: every slot present, fresh, bounded, disjoint
  v
reduce(partials, arguments) on the reduce-lease holder
  |
  v
one atomically published result snapshot -> caller gets the reduced JSON
```

Shard dispatch is sequential today, one shard at a time. Parallel fan-out is
future work, not a tunable.

## Timeouts And Deadlines

- One CALL gets a **30 s** ingress deadline by default (`DEADLINE_MS` 30000,
  deployment-tunable). It is an absolute deadline threaded through every hop,
  not a per-hop timer.
- The receiving node re-checks the deadline **inside** the component-invoke
  barrier, immediately before the WASM export runs. An expired deadline is
  refused as `call_cell_deadline_exhausted` without invoking the component.
- The bounded shard read honors the same deadline; wall-time exhaustion during
  the local read maps to `call_cell_deadline_exhausted`, row/byte exhaustion
  to `call_cell_batch_bound_exceeded`.
- Waiting for a missing Cell to activate (below) is capped at
  `min(now + 15 s, caller deadline)` — a short-deadline call fails typed with
  budget left to report instead of burning it all on a capacity wait.

## Retries

Automatic retry happens at the ingress transport, and only when all three
hold:

1. the failure is classified `retryable`, and
2. the component was **not** invoked (`invoked !== true`), and
3. attempts remain (`maxAttempts`, default **2** — one retry).

Every failure is classified `terminal`, `retryable`, or `ambiguous`.
`ambiguous` means the runtime cannot prove the component did not execute —
an unclassifiable dispatch error (`call_cell_handler_failed`), a shutdown
after dispatch started (`call_cell_shutting_down` with `invoked`), or a
delivery that acknowledged without a typed outcome (`call_cell_ack_only`).
**Ambiguous failures are never retried automatically.** Callers that retry
them accept possible re-execution (visibility stays exactly-once; see side
effects below).

## Partial Failure And The Typed Error Vocabulary

There are no silent partial results. A failed shard fails the whole
invocation with one typed error; failed partitions are never dropped from the
result. All codes are prefixed `call_cell_`:

| Code | Classification | Meaning |
| --- | --- | --- |
| `statement_invalid` | terminal | declared statement is not a single-table SELECT |
| `not_invocable` | terminal | call binding declares no statement |
| `route_not_found` | terminal | no binding matches tenant + name |
| `route_ambiguous` | terminal | more than one binding matches |
| `invalid_arguments` | terminal | arguments not a JSON object / bad identity |
| `invalid_component_result` | terminal | non-JSON result or malformed partial |
| `batch_bound_exceeded` | terminal | shard rows exceed the batch bound, or unmappable values |
| `deadline_exhausted` | terminal | absolute deadline passed |
| `authentication_failed` / `authorization_failed` | terminal | security context / access refusal |
| `component_failed` | terminal | the guest export itself failed |
| `reduce_incomplete` | terminal | partial set incomplete, stale, unbounded, or overlapping |
| `route_unavailable` | retryable | no ready Cell, overload, or local read failure |
| `host_cell_unavailable` | retryable | no ready Cell on the shard's host node (activation trigger) |
| `target_stale` | retryable | topology moved between resolve and execute |
| `transport_failed` | retryable | reserved; currently unraised — transport failures normalize to `handler_failed` |
| `shutting_down` | retryable / ambiguous | node shutdown before / after dispatch started |
| `handler_failed` | ambiguous | unclassifiable receiver failure |
| `ack_only` | ambiguous | delivery acknowledged without a typed outcome |

Every failure also carries `invoked` (did a component run) and
`preserveReplicaState` (movement refusals never mark the replica failed).

## Idempotency And Invocation Identity

- Each CALL mints a fresh base identity `call-invocation-<uuidv4>`.
- One invocation fans out into N+1 **wire identities**: `<base>#slot-<N>` per
  shard and `<base>#reduce`. The suffix grammar is load-bearing: the durable
  fence journals per wire identity, and the route resolver reads the slot
  ordinal to spread shard runs deterministically across ready replicas.
- The runtime journals every component invocation through a durable fence
  keyed on tenant + wire identity (`wasm_operations`). A redelivered wire
  identity **replays** the journaled result instead of re-executing; the
  receiver reports `invoked: false` for replays.
- Idempotency keys containing the reserved `#slot-` / `#reduce` grammar are
  refused typed (`call_cell_invalid_arguments`).
- There is **no caller-supplied idempotency key on CALL today**. The identity
  plumbing accepts one, but no ingress field feeds it — two identical
  `CALL BINDING` statements are two invocations. Caller idempotency keys are
  an unresolved design decision.

## Side Effects

The guarantee is **exactly-once visibility, not exactly-once execution**:

- `emit(key, partialJson)` is the only coordinated output channel from
  `run`. The `run` return value is component bookkeeping and is not
  coordinated — do not put results there.
- Exactly one result snapshot is atomically published per complete partial
  set. A replayed or re-leased reduce recomputes without a visible
  intermediate; callers never observe two results for one invocation.
- The snapshot carries a witness: `{schemaVersion: 1, slots: [{slotId,
  replicaId, computedAt, candidateCount}]}` naming exactly which replica
  computed each shard's partial.
- Anything else a component does (its own state, logging) is its own
  problem: a retry after an ambiguous failure may execute it again. Write
  handlers so re-execution under the same wire identity is safe.

## Ordering

Merged reduce input is deterministic, independent of shard arrival order:
entries sort by aggregation value descending, ties broken by group key with
`localeCompare(..., {numeric: true})`, then the list is sliced to
`partialLimit` (1024). Rows inside a shard batch arrive in local SELECT
order; do not rely on cross-shard row order — only the merged partial order
is contractual.

## Deterministic Vs Nondeterministic Functions

Two hard correctness requirements on the guest:

- **Shard-disjoint group keys are mandatory.** The same group key emitted by
  two shards is a contract violation, refused as `call_cell_reduce_incomplete`
  (shard overlap) — never silently merged. Derive group keys from the data's
  partition-local identity.
- **Partial values are finite numbers.** Each emitted partial JSON must parse
  to a finite number; today the coordination gate supports numeric per-group
  aggregation only. Structured partials are an unresolved design decision.

`run` should be a pure function of `(batch, arguments)`. The runtime replays
journaled results and re-runs after movement refusals; nondeterministic
output makes replay and retry observably diverge.

## Transactions And Reads

- The binding-declared selector is a **single-table SELECT**. Anything else
  is `call_cell_statement_invalid`.
- Each shard's batch is a bounded local read of that node's own partition
  replica (row bound + deadline), built where the data lives — raw shard
  rows never cross the network.
- There is **no cross-partition transaction** in a CALL. Shards are read
  independently and sequentially; the invocation does not take a global
  snapshot, so concurrent writes may land between shard reads. The
  topology fence guarantees each shard read is against a current,
  non-superseded replica — not that all shards observe one instant.
- The CALL path writes nothing to user tables.

## Cancellation

There is **no caller-initiated cancellation**. Closing the pgwire session
does not stop a running invocation; the deadline is the only caller-side
bound. Node shutdown aborts in-flight dispatches typed
(`call_cell_shutting_down`; ambiguous if the component may have run).
Caller cancellation is an unresolved design decision.

## Limits

Production defaults, all overridable per deployment
(`callCellInvocationTunables`):

| Limit | Default | Meaning |
| --- | --- | --- |
| `DEADLINE_MS` | 30000 | ingress deadline for one CALL |
| `BATCH_ROW_BOUND` | 4096 | max rows per shard batch handed to `run` |
| `EMIT_BUDGET` | 64 | max `emit()` calls per invocation |
| `PARTIAL_LIMIT` | 1024 | max partial entries per slot and merged-result cap |
| `SLOT_COUNT` | 64 | coordination slot capacity |
| `REDUCE_LEASE_MS` | 30000 | slot/reduce lease duration |
| `ACTIVATION_LEASE_MS` | 60000 | activation-pin lease lifetime |
| `RECLAIM_RETENTION_MS` | 600000 | coordination-garbage retention |
| `NESTED_CALL_BUDGET` | 1 | moot — nested `call-bounded` always denies today |

Ingress transport: `maxAttempts` 2, 128 in-flight globally, 32 per target;
overload is a typed retryable `call_cell_route_unavailable`, never a queue.
The `CALL BINDING` payload (`schema_version`, `name`, optional `arguments`
JSON object) is one string parameter, max 1 MiB.

Binding budgets are a closed set: CPU 1..60000 ms, wall 1..300000 ms, memory
1..1 GiB, input/output 0..16 MiB each, context 0..64 MiB. A separate ambient
query-budget axis bounds SQL work (5 s CPU, 64 MiB memory, 30 s wall,
100k rows / 8 MiB per query result).

## Replica And Partition Movement

Movement never corrupts a result; it produces typed retryable refusals:

- `call_cell_target_stale` is raised at four independent points: route drift
  between resolve and dispatch, a partition no longer routable or superseded,
  the receiving node's own ownership + epoch fence (it re-reads its cache and
  refuses if the leader, state, or partition versions moved, or the fence
  names another node), and a reduce that executed on a replica no longer
  holding the reduce lease. All carry `preserveReplicaState: true` — the
  replica is not marked failed for having moved.
- `call_cell_host_cell_unavailable` is not an error path in production — it
  is the **activation trigger**. The invoker publishes a bounded demand lease
  (`call_activation_leases`, 60 s), the placement planner pins a replica to
  the shard's host node, and the dispatch retries every 250 ms until the Cell
  is ready or the window lapses. Reclaim needs no mechanism of its own: a
  lapsed lease simply stops pinning, and the ordinary surplus cure removes
  the replica.
- Reduce runs only on the lease holder: the reduce route is resolved, the
  dedicated lease slot (`slotIds.length + 1`) is acquired under that replica,
  and the snapshot is refused `target_stale` if a different replica executed.

## Version Compatibility

Every payload is versioned: the CALL payload carries `schema_version` (2),
bindings are `schema_version: 2`, manifests `schema_version: 3`. A binding's
target pins the exact artifact by `manifest_digest`; the resolved route
carries the definition's `bindingDigest`, and the receiver re-asserts the
full route — digest included — refusing `call_cell_target_stale` if any field
drifted. An upgrade mid-invocation therefore fails typed retryable rather
than executing mixed versions.

## Coordination Hygiene

Coordination garbage (lapsed slot rows, abandoned result rows) is swept
opportunistically: one bounded sweep per new invocation, no background
reaper, retention 600 s. Sweep failures are hygiene-only and never fail the
live invocation. A live invocation whose seed-to-first-acquire span exceeds
retention is treated as abandoned by design — typed retryable, never a wrong
result.

## Unresolved Design Decisions

Stated once, plainly — none of these are guaranteed by anything above:

- caller-initiated cancellation;
- caller-supplied idempotency keys on CALL;
- structured (non-numeric) partial values;
- parallel shard fan-out;
- `pushdown` invocation (declared-only today);
- nested `call-bounded` invocation (declared in WIT, host always denies);
- any CALL ingress other than authenticated pgwire (no HTTP or client SDK).

## Deeper

Down one level:
[architecture/minimal-deployment-surface.md](../architecture/minimal-deployment-surface.md)
is the sealed contract this page projects, including the
`lagrange:cell/call-context` WIT surface and budget grammar. Current status of
every capability: [current-capabilities-and-limitations.md](current-capabilities-and-limitations.md).
