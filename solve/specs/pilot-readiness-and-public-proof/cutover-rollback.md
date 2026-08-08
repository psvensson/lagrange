# Detailed design: Pilot cutover and rollback receipts

Quest: `pilot-cutover-and-rollback-receipts` (Q9). Requirements contract:
[`requirements.md`](requirements.md) "Cutover rollback". Epic:
[`solve/epics/pilot-readiness-and-public-proof.md`](../../epics/pilot-readiness-and-public-proof.md);
binding decisions cited as D1–D12. Depends on Q8
([`bulk-load.md`](bulk-load.md)) for the initial load.

## Owner boundaries touched

- **One new general receipt/workflow owner** lands in this repository — the
  single store for migration plans, positions, parity results, and
  decisions. No second migration-state store may appear (D11). Its design
  precedent is the rebalancer workflow owner:
  `src/rebalancer/operation-workflow-owner.js` (single lifecycle surface,
  canonical transition methods) with durable transition persistence per
  `src/rebalancer/operation-workflow-persistence.js`.
- Receipt durability routes through the canonical SQL/transaction owners
  (`src/query/sql-query-engine-write-execution.js`,
  `src/query/distributed/distributed-transaction-coordinator.js`);
  receipt rows are insert-only fresh keys.
- Initial load is Q8's loader; parity reads use pgwire as an external
  client against both source and target (independent oracle, D7).
- Source-specific PostgreSQL CDC integration stays in an **external
  adapter**; this repository defines only the adapter-facing change-feed
  contract (below). That boundary is explicit and sealed.

## Contract shape

### Migration plan (versioned)

`{planId, planVersion, source descriptor, target descriptor, tables[],
parity spec (key ranges, sample rate, checksum method), cutover criteria
(max divergence, high-water mark), rollback criteria, declared traffic
slices}` — sealed before execution; a plan is immutable once any step has a
receipt (a changed plan is a new `planId`).

### Workflow state machine

`draft → loading → syncing → parity → cutover_pending → cutover →
complete`, with `rolled_back` reachable from `cutover_pending`, `cutover`,
and `complete`-pending states, and `halted` reachable from any step. Every
transition is performed by the workflow owner's canonical transition
methods and is legal only from its declared predecessor — no out-of-band
state writes.

### Receipt schema

Every step (initial load, change feed progress, parity run, cutover
decision, rollback decision) emits a durable receipt:

`{planId, step, receiptSeq (monotonic per plan), sourcePosition,
targetState digest, outstandingDivergence: {count, sampleRefs},
decision (exact typed verdict), actor, timestamp}`

Receipts are append-only; success is **only** what a durable receipt says —
never process exit, never a disconnected client (sealed constraint). The
receipt chain is the audit trail the pilot and the release process read
(D7).

### Change-feed adapter contract (target-side)

The external adapter delivers ordered change records:
`{changeId (dedup identity), sourcePosition (totally ordered per source),
table, operation, row image}`. The workflow owner requires: monotonic
`sourcePosition` per connection, replay from any acknowledged position, and
idempotent delivery keyed on `changeId`. Dual-write is an alternative
adapter satisfying the same contract. The declared high-water mark is a
`sourcePosition`; syncing completes when the applied position reaches it.

### Parity and traffic switch

Parity runs compare source and target via the plan's parity spec using
independent reads (pgwire both sides), producing a divergence receipt.
Cutover is permitted only when the latest parity receipt satisfies the
plan's cutover criteria; the switch itself is recorded as a decision
receipt naming the exact traffic slice moved. Rollback reverses the slice
and opens a divergence accounting window: writes acknowledged by the target
after cutover are enumerated in the rollback receipt, never silently
dropped.

## Failure semantics (D12)

All fail-closed with a durable receipt naming the reason:

- **Source reconnect**: resume from last acknowledged `sourcePosition`;
  positions never regress silently.
- **Duplicate change**: dropped idempotently by `changeId`; counted in the
  receipt.
- **Out-of-order change**: refused beyond the adapter's declared reorder
  bound; the feed halts rather than applying out of order.
- **Target outage**: bounded retry; the step's receipt records the stall;
  no unreceipted progress.
- **Schema drift**: source/target schema digest mismatch halts the feed
  before applying.
- **Cutover timeout**: reverts to `cutover_pending` with a timeout receipt;
  traffic state is whatever the last decision receipt says.
- **Parity mismatch**: blocks cutover; divergence receipt names the ranges.
- **Rollback after partial traffic**: divergence accounting receipt covers
  the partial window.

Red-on-revert (sealed): removing receipt durability, parity checks, or
divergence accounting must make cutover and rollback fail closed rather
than silently proceed.

## Non-goals and edition boundaries

- No PostgreSQL CDC implementation in this repository — external adapter
  only; the contract boundary is the sealed deliverable here.
- No second migration-state store, no per-step ad-hoc state files (D11).
- No generic multi-source migration product; one plan, one source, declared
  tables.
- No backup/restore/PITR coupling (D9); Community/AGPL scope per
  `edition-matrix.md` (D8).
- Documentation of the runbook follows landed behavior; it cannot close the
  Quest (D10).

## Open decisions left to the Quest

- Receipt/workflow storage placement: dedicated system table(s) via the
  `src/bootstrap/system-table-workflow-schema-definitions.js` registration
  precedent vs reuse of an existing workflow-durability surface — one owner
  either way (D11).
- Whether the workflow owner is a CLI-driven library or a resident service
  component (pilot ergonomics vs runtime footprint).
- The adapter's declared reorder bound default and the dual-write adapter's
  conflict rule.
- Traffic-slice representation (per-endpoint, per-tenant-key range) for the
  pilot's actual ingress.
- Minimum parity spec for the scenario (checksum method, sample rate).
