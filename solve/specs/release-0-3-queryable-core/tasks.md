# Tasks — Release 0.3 Queryable Core

This document is executable planning detail for
`solve/epics/release-0-3-queryable-core.md`.

Only the first Quest is created immediately. Later Quest ids are planned units,
not authority: create each `quest.json` only after its predecessor evidence
makes the statement and binary red probe precise. This follows the repository's
existing rule that a planned phase is not pre-created work authority.

## Dependency graph

```text
A1 ordering owner
  |
  +--> A2 persisted boundary/type representation
         |
         +--> A3 declared PK metadata cutover
         |      |
         |      +--> A4 compound-PK narrowing
         |
         +--> A5 local index DDL wiring
                |
                +--> A6 compound-index planner contract
                       |
                       +--> C1 global-index consistency decision
                              |
                              +--> C2..C5 global index implementation/proof

B1 locking policy seal --> B2 AST semantic --> [rs-raft close] --> B3/B4/B5

A4 + roadmap authority repair --> D1 canonical live-plan dependencies
[rs-raft close] + D1 --> D2..D6 live-query data plane

all axes --> E1 acceptance matrix --> E2 exact-head 0.3 candidate
```

A1-A6 are deliberately isolated from Raft runtime/transport/lifecycle and may
be driven while the zero-Liferaft closeout finishes. The branches do not merge
to shared main until that cutover is terminal and they have rebased/re-proven
against the resulting exact head.

---

## Stage A — query access foundation

### A1 — `partition-key-ordering-owner-completion-v9` — ACTIVE

**Roadmap:** `RM-0.3-qs-typed-key-ordering`.

A1-v7 was later replayed as the canonical seven-file attempt on PR #74. The
newer post-attempt structured Copilot review on PR #92 rejected that exact
candidate for four residual gaps: real KeyRangeManager ID-only lists were
rejected before split evaluation; bounded request coalescing could overflow and
erase pending diagnostics/write_activity; RegExp.test capture still dispatched
through live RegExp.exec; and Proxy split metadata/target arrays could execute
descriptor traps. V8 closes exactly those four findings while preserving the
A2 durable-representation boundary.

This supersedes the earlier A1 seals; every sealed predicate remains immutable
historical evidence. V2 established the non-BMP UTF-8/BINARY discriminator and
isolated merge-adjacency control. V3 closed the first category-complete review
round: actual owner expressions, exact mismatch witnesses, refusal before
coercion and mutable-intrinsic capture. V4 then closed validation-before-equality,
own-data/iterator-free split metadata, coercion-free table-ID comparison and
isolated intrinsic coverage, reaching a sealed 34 → 0 candidate.

Final category-complete review of exact v4 candidate PR #86 found four remaining
items: numeric comparison returned raw subtraction magnitudes (and could
overflow to Infinity from finite extremes); falsey non-string table IDs were
normalized to absence before validation; enumerable Object/Array prototype
pollution lacked an explicit fixture; and Object.getOwnPropertyDescriptor /
Object.hasOwn controls were combined. V5 closed those four findings. PR #87
then found invalid/non-finite keys paired with null/undefined could return from
absent-bound ordering before validation; v6 closed that routing gap.

Exact-head PR #88 review of v6 found three further split/merge-consumer defects:
merge table IDs could order against an absent peer before the non-absent value
was validated, the live evaluation path still depended on mutable array
iteration/sort behavior, and the comparator refactor increased the complexity
ratchet. V7 owns those findings plus the follow-up exact live-path audit:
evaluation partition arrays, IDs, and start/end keys are own-data-only;
iterator/Array/Reflect intrinsics used by this path are captured; missing,
own-null, and own-undefined table-ID peers are distinguished in both
directions; and no new complexity debt is admitted.

**Current falsifier:** current main still has both a locale-sensitive string
order in `compareRoutingKeys` and a raw
`PartitionSplitMergeManager.comparePartitionKeys` ordering path.

**Statement boundary:**

- keep `compareRoutingKeys` as the one existing partition-routing order owner;
- make persisted TEXT/string key comparison deterministic and compatible with
  the SQLite BINARY order used by ordinary SQLite ordering;
- make merge adjacency consume that owner for partition start keys;
- do not use the partition-key comparator as an accidental table-id policy
  owner;
- preserve the solved numeric-vs-text-encoded-number behavior;
- preserve typed refusal of unrelated mixed key spaces.

**Required behavioral proof:**

1. ASCII/string cases whose `localeCompare` order differs from byte/BINARY
   order agree with SQLite/BINARY ordering;
2. `1000` remains right of persisted `"500.0"`;
3. number versus nonnumeric text remains a typed refusal;
4. KeyRange, PartitionResolver, QueryGroup and merge-adjacency ordering agree
   on the partition-key owner;
5. reverting either the string-order change or merge-adjacency delegation makes
   its witness red.

**Explicit non-goals:** no schema migration; no new key encoding; no PK metadata
cutover; no index planner work; no Raft files.

**Verification attack:** owner-interaction + adversarial-input review. Search the
affected boundary for a surviving local key comparator, coercion, locale
dependency, or fallback.

---

### A2 — planned `partition-key-boundary-representation`

**Roadmap:** `RM-0.3-qs-typed-key-ordering`.

This Quest exists because A1 cannot honestly solve the persisted representation
problem by changing a comparator.

**Design first.** Seal one representation contract for a persisted partition
boundary and an indexed tuple element:

- declared SQL/key type;
- exact canonical value/encoding;
- NULL/unbounded representation;
- string collation for the 0.3 ordinary ordered family;
- numeric precision, including integers above the safe REAL round-trip region;
- decode/refusal behavior for old ambiguous TEXT boundaries;
- upgrade/revalidation behavior for existing alpha clusters.

Do not decide "comparator metadata" versus "order-preserving encoding" in prose
before the red probe exists. The design must prove why the selected minimal
representation preserves both SQLite median selection and distributed routing.

**Falsifiers:**

- a large integer boundary round-trips through the real system-table storage
  path without changing its routing position;
- a string boundary selected by SQLite and consumed by routing keeps one order;
- wrong/missing type metadata fails closed or follows an explicitly sealed
  alpha revalidation path; it never guesses a type from a misleading string.

**Stop condition:** if existing persisted state cannot be distinguished safely,
the 0.x answer may be a typed "recreate/revalidate boundaries" requirement.
Do not invent lossy migration.

---

### A3 — planned `declared-primary-key-resolution`

**Roadmap:** `RM-0.3-qs-pk-partition-narrowing`.

Make one metadata owner answer "which columns form this table's partition/
primary key?" and make PartitionResolver and write/live consumers ask that
owner.

**Current red:** `resolvePrimaryKeyColumns()` does not consume
`tables.partition_key`; absent alternate fields it falls back to `id`.

**Required proof:**

- table declared `PRIMARY KEY (account_no)` narrows an equality/range query
  using `account_no` and does not scatter merely because the column is not
  named `id`;
- the same declared key drives read and write routing;
- stale/missing metadata has a typed/fail-safe outcome, not a guessed `id`;
- no live-query or distributed-write helper keeps a second hard-coded PK rule;
- controlled revert restores scatter/wrong routing and turns the proof red.

A fallback `id` may remain only for a deliberately defined legacy table shape
whose owner says that is the declared key; it cannot be a generic semantic
default.

---

### A4 — planned `compound-primary-key-narrowing`

**Roadmap:** `RM-0.3-qs-pk-partition-narrowing`.

Activate and prove the composite path only after A2/A3 settle representation
and metadata ownership.

**Minimum 0.3 contract:**

- exact equality on every compound PK component narrows to the correct
  partition;
- partial predicates that cannot be mapped to the partition key scatter safely;
- contradictory AND predicates never become last-writer-wins routing hints;
- tuple serialization/order is the A2 contract, not an ad-hoc JSON/string order;
- aliases/qualified column refs follow canonical SQL semantics.

**Falsifiers:** compare routed partition set against scatter-gather result
correctness over boundary cases, reordered predicates, aliases and
contradictions. Red-on-revert must engage the production resolver.

Do not grow cost-based planning or global uniqueness here.

---

### A5 — planned `local-index-ddl-owner-wiring`

**Roadmap:** `RM-0.3-qs-local-index-ddl`.

Consume the existing IndexService rather than rebuilding an index subsystem.

Before editing, re-census current main to confirm:

- statement parser shape for CREATE/DROP INDEX;
- canonical statement dispatcher;
- runtime composition owner;
- `indices` row mutation owner;
- new-partition/split lifecycle interaction;
- which current IndexService methods are production-correct versus orphaned
  historical material.

**Required capability:**

- ordinary and compound ordered/B-tree CREATE INDEX and DROP INDEX through the
  normal SQL path;
- unsupported families/features fail closed before durable metadata claims them;
- existing partitions receive/drop the SQLite index;
- later partitions receive a live index through the canonical lifecycle
  interaction;
- restart reconstructs index metadata/lifecycle from durable authority, not an
  in-memory cache;
- duplicate/retried DDL has an owned idempotent outcome.

**Proof:** public SQL path + direct SQLite/catalog observation + restart +
new-partition witness + red-on-revert. Do not claim planner use yet if A6 is
not complete.

---

### A6 — planned `compound-index-planner-contract`

**Roadmap:** `RM-0.3-qs-compound-index-semantics`.

Replace the current any-matching-column heuristic with one ordered-index
contract shared by local and later global indexes.

For index `(a,b,c)`, seal and prove at least:

- usable: `a = ?`;
- usable: `a = ? AND b = ?`;
- usable: equality prefix followed by a supported range on the next column;
- not claimable as a routed ordered access path: predicate only on `b`;
- explicit NULL/type/collation semantics from A2;
- unsupported operator/index family fails closed or rejects the access path;
- rejection falls back to ordinary correct execution.

`EXPLAIN DISTRIBUTED` must identify selected index + prefix/range shape, or a
typed reason an available index was rejected.

**Controlled negative:** restore the current arbitrary non-leading-column
fallback and require the compound semantics witness to fail.

---

## Stage B — PostgreSQL locking reads

The architecture owner is
`architecture/postgres-locking-reads.md`. Parser acceptance alone never counts
as a locking read.

### B1 — planned `locking-read-wait-policy-seal` — DESIGN MAY START EARLY

Seal the architecture document's remaining explicit question before source
implementation: wait/conflict/deadlock policy, timeout/cancellation semantics,
and who owns wake/release.

The answer must fit existing DistributedTransactionCoordinator and partition
participant ownership. A PG-session-local lock map is forbidden.

**Probe:** a decision table/model with zero unowned transitions for acquire,
conflict, wait/refuse, timeout, cancellation, commit, rollback, crash and
recovery.

### B2 — planned `locking-read-canonical-ast` — SAFE SOURCE EDGE

Preserve `SELECT ... FOR UPDATE` in the canonical SQL AST and SqlCore plan as
an explicit semantic through PG wire. PG wire transports it; it does not
interpret lock ownership.

**Falsifier:** the public PG parse/plan path distinguishes locking from ordinary
SELECT while returning identical row semantics absent contention.

Do not mutate participant state in this Quest.

### B3 — planned `locking-read-participant-reservation` — AFTER RAFT CUTOVER

Extend the existing transaction/participant owner with durable/replicated
write-intent/reservation semantics.

**Falsifiers:** two transactions over one partition and multiple partitions;
the second cannot silently proceed through a conflicting reservation; a killed
participant/restart cannot erase an unresolved reservation or invent one.

No new transaction coordinator.

### B4 — planned `locking-read-release-timeout-recovery`

Prove bounded release on commit, rollback, timeout, cancellation and recovery.
Wake/re-drive uses the transaction owner interaction; polling may not be the
correctness mechanism.

Use concurrency-serialization + recovery-replay + retry/timeout verification
templates.

### B5 — planned `locking-read-public-pg-proof`

End-to-end public PG witness, including multi-partition conflict behavior and
controlled revert. The benchmark may measure the feature only after this; it
cannot certify it.

---

## Stage C — non-unique global secondary indexes

**Prerequisites:** A2, A5, A6 and terminal zero-Liferaft/raft-rs closeout.

### C1 — planned `global-index-maintenance-mode-seal` — DESIGN MAY START EARLY

The current requirements explicitly require this decision before
implementation: synchronous 2PC-enlisted maintenance or asynchronous
CDC-maintained maintenance.

Historical notes lean async for 0.3, but that is not a sealed decision.

The design must compare:

- correctness surface and query fallback;
- read-your-index/staleness semantics;
- write latency/availability cost;
- idempotence/redelivery/restart;
- progress position diagnostics;
- backfill cutover;
- why unique indexes remain out of 0.3.

If async wins, "index behind" is a typed observable state and a query that
cannot accept it falls back to base-table execution. If sync wins, index
unavailability cannot silently skip write maintenance.

### C2 — planned `global-index-dataset-lifecycle`

Represent each global index as a system-managed partitioned dataset using the
same post-cutover partition/Raft machinery, not special index nodes or a second
storage engine.

Own create/build/readable/failure/drop states durably.

### C3 — planned `global-index-resumable-backfill`

Resumable, restart-safe backfill with durable progress. An index is never
readable before the owner records terminal completion.

Falsify node failure and restart during backfill.

### C4 — planned `global-index-maintenance`

Implement the sealed C1 mode with idempotent retry/replay semantics and
observable progress. For async mode, prove CDC redelivery/restart. For sync,
prove participant failure behavior.

### C5 — planned `global-index-routing-and-explain`

Planner narrows index partitions under A2/A6 order, resolves base rows through
existing PK routing, and falls back to scatter when the index is unreadable or
too stale.

Comparative proof: representative non-PK and compound prefix/range queries touch
fewer partitions/rows than the pre-index baseline while returning exactly the
same base-table result.

---

## Stage D — generic push-backed live queries

### D0 — planned `generic-live-query-roadmap-authority` — FIRST

Root roadmap includes the capability; AGPL feature map lacks a 0.3 row. Consult
`docs/development/roadmap-policy.md` and reconcile the authority before
creating product Quest links. Do not silently reuse an unrelated row.

This is a planning/authority repair, not implementation.

### D1 — planned `live-query-canonical-plan-dependencies`

Freshly re-derive the historical rung against current main:

- live mode consumes ordinary SqlCore plan semantics;
- canonical resolver supplies the table/partition dependency footprint;
- LiveQueryManager gets a stable dependency description;
- QueryGroup/LiveQueryService stop owning duplicate routing/predicate meaning.

**Falsifier:** the same SQL query cannot route to a different partition set
merely because it is live.

A3/A4 should land first so "canonical resolver" means the 0.3 resolver.

### D2 — planned `live-query-selective-partition-cdc` — AFTER RAFT CUTOVER

Replace cache-backed generic user-table change detection with selective
PartitionService CDC subscriptions through existing handshake/replay and
MessageRouter ownership. Keep cache observation only where system-table cache
is actually the declared read model.

**Falsifier:** node A receives a committed remote user-table mutation without
broadcasting the user table through every node's SystemTableCache.

### D3 — planned `live-query-gap-free-snapshot-frontier`

Seal and prove the initial snapshot ↔ CDC frontier. Concurrent writes during
subscribe/reconnect cannot disappear. Duplicate delivery must not corrupt
visible state.

### D4 — planned `live-query-result-maintenance`

Safe simple plans may apply row deltas. Unsupported complex plans respond to a
pushed relevant change by normal SQL re-execution/reset. They never poll.

### D5 — planned `live-query-lifecycle-topology-recovery`

Equivalent local consumers share one distributed footprint. Split/merge/move/
leader changes reconfigure through canonical topology owners; consumers never
subscribe by physical-partition policy.

### D6 — planned `live-query-core-api-antipolling`

Expose the generic core capability without making Admin WebSocket the semantic
owner.

Strong end-to-end proof:

1. subscribe;
2. hold idle and instrument data reads;
3. observe zero reads whose purpose is discovering change;
4. commit one remote mutation;
5. receive an unsolicited correct update.

---

## Stage E — release closure

### E1 — planned `release-0-3-acceptance-matrix`

One deterministic matrix binds each 0.3 capability to:

- roadmap/architecture owner;
- exact terminal Quest;
- public path;
- controlled negative;
- current capability/documentation claim;
- representative comparative evidence where performance is the feature.

It must also prove exclusions: no global uniqueness claim, no polling live
query, no PG-local lock authority, no unsupported index family, no physical
partition requirement in ordinary examples.

This Quest does not bump versions.

### E2 — planned `release-0-3-exact-head-candidate`

Only after E1:

1. cut `[Unreleased]` to dated 0.3.0;
2. bump all version literals in the one release commit specified by
   `RELEASE.md`;
3. land/publish normally;
4. run `release-publishability/0.3.0` on that exact main SHA;
5. establish/reuse durable `release-full-v1` for that exact SHA;
6. run `npm run release:preflight`;
7. set the epic oracle to zero only when all eight axes cite exact evidence.

The annotated tag/publish is the release owner's outward action after preflight;
the Quest does not push a tag by implication.

---

## Future epic boundaries — defined, deliberately not opened yet

If open-epic pressure falls and splitting improves ownership, these are the
natural boundaries:

### `query-access-foundation-0-3`

A1-A6 only: key/tuple order, PK routing, local indexes and ordered planner
semantics. Deterministic proof.

### `locking-reads-0-3`

B1-B5 only: canonical AST + existing transaction participant reservation,
release and public PG proof. Deterministic with adversarial concurrency/recovery
proof.

### `global-secondary-indexes-0-3`

C1-C5 only: non-unique GSI lifecycle, maintenance, backfill, routing and
failure proof. Certification because distributed failure/restart evidence is
terminal.

### `generic-live-query-data-plane-0-3`

D0-D6 only after the roadmap owner exists: canonical plan dependencies,
selective CDC, frontier, maintenance, topology/recovery and anti-polling public
proof.

Do **not** create these epics just to mirror this document. Open one only when
the umbrella becomes a real ownership bottleneck and the predecessor evidence
allows a narrower doneWhen probe than the umbrella can provide.
