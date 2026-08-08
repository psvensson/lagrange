# Detailed design: Call-shard paged execution

Quest: `call-shard-paged-execution` (Q3, gate). Requirements contract:
[`requirements.md`](requirements.md) "Paged execution". Epic:
[`solve/epics/pilot-readiness-and-public-proof.md`](../../epics/pilot-readiness-and-public-proof.md);
binding decisions cited as D1–D12.

This spec satisfies the Quest's `spec-before-code` constraint: it is the
versioned design the implementation codes against. Sections marked **open**
are the only decisions deferred to the Quest; everything else is sealed here.

## Owner boundaries touched

- `src/service/call-cell-batch-executor.js` — becomes the paging owner: page
  planning, cursor advance, per-page batch materialization. Today it plans
  shards and fails closed above one batch.
- `src/service/call-cell-invoker.js` — keeps invocation orchestration (route
  resolve, shard fan-out, partial publication); learns page sequencing per
  shard but owns no cursor logic (D11).
- `src/node/runtime-service-call-cell-handler.js` — partition-host-side local
  batch execution; executes one page exactly as it executes one batch today.
- `src/runtime/call-cell-reduce-coordinator.js` — keeps completion and
  reduce-visibility ownership; consumes one partial set per shard, unchanged.
- `src/service/call-cell-routing-contract.js` — typed vocabulary grows page
  identity fields and new typed refusals; `BATCH_BOUND_EXCEEDED` remains for
  non-paged declarations.
- `src/bootstrap/shared/call-cell-invocation-setup.js` — `BATCH_ROW_BOUND`
  (4096) is unchanged and becomes the per-page row bound (D4: no silent
  default raising).
- `src/service/call-shard-dispatch-pool.js` — keeps cross-shard concurrency
  ownership; page-level backpressure composes with it, not around it.

No alternate fan-out runtime, no bypass of the canonical dispatch path (D1).

## Contract shape

### Page identity

A page is identified by the triple `(invocationId, shardId, pageIndex)`.
`pageIndex` is a 0-based, gapless, monotonically increasing integer per shard.
Page identity is carried on every dispatch, completion record, and refusal,
and participates in Binding digest/version fencing exactly as the shard
dispatch does today.

### Cursor model (sealed: keyset cursor)

Paging uses a **keyset cursor**, not an engine-held open cursor. Each page's
shard-local SELECT is the Binding's declared statement plus a deterministic
total-order key (`ORDER BY <key>` with `WHERE <key> > :cursorAfter LIMIT
BATCH_ROW_BOUND`). Rationale: keyset pages are stateless on the partition
host, so they survive leader movement, host restart, and retry; an open
engine cursor pins a connection and cannot (D12: movement between pages).

The cursor token is opaque to callers: `{v: 1, key: <last-row key values>}`,
canonically encoded. Cursor monotonicity is a hard invariant: the executor
refuses (typed) any page whose `cursorAfter` does not strictly exceed the
previous journaled cursor for that shard.

### Read fidelity across pages

Pages read committed state at page-execution time over the immutable keyset
order. The determinism guarantee is defined against the keyset-stable row
set: every row that exists and is unmodified for the whole invocation window
is delivered exactly once. No cross-page MVCC snapshot is provided in v1;
the certification scenarios run against a sealed dataset (D7). Snapshot
isolation across pages is **open** (deferred, see below), not silently
claimed.

### Component ABI (sealed: one run per page + shard-local combine)

The guest ABI is unchanged: one `run` invocation per page, receiving a page
that is shape-identical to today's single batch. A **shard-local combine**
folds each page's emitted partials into the shard's accumulated partial state
in `pageIndex` order. The shard publishes exactly one partial set to the
reduce coordinator after its final page, so the reduce contract and its
disjoint-keys semantics are untouched (D11). No streaming guest session in
v1.

### Deadline, budgets, backpressure

- One absolute deadline is set at invocation admission and inherited by every
  page; a page is not dispatched if the remaining budget is below the typed
  per-page floor, and deadline exhaustion mid-shard is a typed invocation
  failure with cleanup — never a partial silent result (D4).
- Budgets, all explicit and typed: per-page row bound (= `BATCH_ROW_BOUND`),
  per-shard maximum page count, maximum retained combine-state bytes per
  shard, and the existing partial byte/count budgets at publication.
- Backpressure: at most one in-flight page per shard (cursor monotonicity
  requires sequential execution); the next page is dispatched only after the
  previous page's completion is journaled and combined. Cross-shard
  parallelism remains owned by the dispatch pool.

### Replay journaling and retry

Before a shard advances past a page, the executor journals a completion
record `(invocationId, shardId, pageIndex, cursorAfter, partialDigest)`.
Recovery rules:

- Retry after ambiguous execution (dispatched, no completion record):
  re-execute the same page identity. Safe because combine applies only on
  journal append, and a duplicate completion for an already-journaled page
  identity is refused as a no-op (idempotent by page identity).
- Restart or replica movement between pages: resume from the last journaled
  cursor; the new leader serves the next page via normal routing (keyset
  makes the page location-independent).
- Journal rows are insert-only fresh keys; a journaled cursor is never
  rewritten.

### Reduction determinism

The shard partial equals the fold of page partials in `pageIndex` order;
replay of the journal reproduces byte-identical shard partials, and reducer
input is therefore identical in shape and content to the single-batch case.

## Failure semantics (D12)

Fail-closed, all typed through the routing contract:

- Cursor regression, cursor gap, or page-identity mismatch → refuse the page.
- Per-shard page-count or combine-memory budget exceeded → typed invocation
  failure; never truncate or skip rows.
- Deadline exhaustion → typed failure plus cleanup of journal/combine state.
- Stale Binding digest/version between pages → fence and refuse.
- Non-paged (v1) declarations keep `BATCH_BOUND_EXCEEDED` behavior exactly.

Red-on-revert (sealed by the Quest): removing page identity, cursor
persistence, or the memory bound must fail the live scenario
deterministically; the scenario covers inputs well above 4096 rows per
selected shard, lost/duplicate-row oracle checks, retry and restart, replica
movement between pages, deadline exhaustion, and backpressure.

## Non-goals and edition boundaries

- No raising of `BATCH_ROW_BOUND` or any default to pass a test (D4).
- No streaming guest session, client-visible cursors, or cross-invocation
  pagination API — paging is internal to one call.
- No benchmark-only fast path or direct-local bypass (D1).
- No new reduce/merge semantics; structured partials are Q4's spec.
- Community/AGPL scope only; nothing here shifts the edition matrix (D8/D9).

## Open decisions left to the Quest

- Cursor key selection when the shard table lacks a usable unique key:
  require a declared key in the Binding vs synthesize from rowid. Must stay
  declarative (D3).
- Numeric defaults for per-shard page count, combine-state byte bound, and
  the per-page deadline floor (explicit constants in the invocation setup).
- Journal placement: executor-local durable table vs reuse of the reduce
  coordinator's lease store (must not create a second lifecycle owner, D11).
- Cross-page snapshot isolation: deferred; if ever added it must be a
  declared contract change, not an implicit strengthening.
