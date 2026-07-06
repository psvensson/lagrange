# Research — Lever A: OFF-PARTITION PROGRESS PERSISTENCE

Read-only research (quest `formation-ledger-self-move-blocks-cluster-ops`).
Lever: break the self-referential ledger-persistence quorum deadlock at its root
by making a ledger self-move's OWN workflow-progress writes not depend on the
partition being moved.

Binding wedge recap (from `verify-model-lever-vs-run6-binding-wedge.md`): a
REPLACE self-move on `replica_operations-p1` cannot persist its own workflow
progress — its transition UPDATEs to the `replica_operations` table fail for
~2min (`"Distributed operation failed due to participant failures"` →
`"No leader available for write operation"`) because moving that partition's
voters degrades the write quorum of the very table where operation progress is
stored. It unwedges only when leadership reaches the target node.

---

## 1. WHERE does an operation persist its workflow progress? (the write path)

Every workflow step is written into the `replica_operations` **system table**.
Traced call chain (all under `src/rebalancer/`):

- Workflow owner mints the next step and calls
  `this.repository.persistOperationUpdate(projectedOperation, …)`:
  - `operation-workflow-transition-persistence.js:139` (priority dispatch claim
    SENDING), `:287`, `:453`
  - `operation-workflow-transition-orchestration.js:549`
  - `operation-workflow-terminal-transition-repair.js:175` (terminal repair)
  - INSERT of the initial row: `rebalance-coordinator-operation-creation.js:594`
    → `persistNewOperation`.
- `persistOperationUpdate(operation, options)` —
  `replica-operation-repository-mutation-persistence-methods.js:151`. Builds an
  UPDATE against `SYSTEM_TABLE_NAME.REPLICA_OPERATIONS` (`:178`) and calls
  `executeReplicaOperationGatewayMutationWithRetry(...)` (`:175`).
- The initial INSERT: `persistNewOperationUnlocked` (`:51`) →
  same gateway helper, `tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS` (`:56`).
- `executeReplicaOperationGatewayMutationWithRetry` /
  `executeReplicaOperationGatewayMutation`
  (`replica-operation-repository-mutation-gateway-methods.js:91,156`) →
  `gateway.submitMutation(mutation, queryOptions)` (`:166`) or the
  `insert/updateSystemTableRow` shims, where `gateway =
  this.controlPlaneSystemTableGateway`.
- Gateway `submitMutation`
  (`src/control-plane/control-plane-system-table-gateway-mutation-submission.js:160`)
  → `cdcIntegrationService.updateSystemTableRow(tableName, whereClause, data, …)`
  (`:279`) / `insertSystemTableRow` (`:258`).
- CDC integration
  (`src/cdc/cdc-integration-service-mutation-operations.js:221 insert / :367
  update`) builds SQL and calls `this.executeSQL(sql, values, …)` (`:247`). The
  method doc is explicit: *"The write goes through SQL, which routes to the
  partition leader."* (`:213,:359`).

**The exact functions that write an operation's step/status to
replica_operations:** `persistOperationUpdate` (updates) and
`persistNewOperationUnlocked` (initial insert), both in
`replica-operation-repository-mutation-persistence-methods.js`, terminating at
`cdcIntegrationService.updateSystemTableRow/insertSystemTableRow` →
`executeSQL` (partition-leader-routed SQL).

There is ALSO an in-memory owner projection — `operation-progress-store.js`
(`recordsByOperationId = new Map()`, `:86`), the `operation_progress` owner
resource (`operation-lifecycle.js:26`, `operation-progress-events.js`). This is
a **non-durable leader-local projection**, not the durable ledger; durable truth
is the `replica_operations` table row. (See §3.)

## 2. Is the write always routed to the LEADER of the operation's OWN partition?

**Yes — and worse, `replica_operations` is a SINGLE-partition table, so an
operation's row and the operation's own partition are the same raft group when
the operation IS a `replica_operations-p1` self-move.**

- `replica_operations` has exactly one partition:
  `INITIAL_PARTITION_IDS[REPLICA_OPERATIONS] = 'replica_operations-p1'`
  (`src/bootstrap/system-table-schemas-constants.js:115`), 3 replicas
  `replica_operations-p1-r{1,2,3}` (`:177-179`). No sharding of this table
  exists in the demo topology.
- The row key is `operation_id`; the write routes by **table → partition
  leader** via `executeSQL` (CDC comment above; SQL engine routes system-table
  writes to that table's partition leader). For the `replica_operations` table
  there is only `replica_operations-p1`, so EVERY operation's progress write —
  including a self-move whose subject IS `replica_operations-p1` — goes through
  `replica_operations-p1`'s raft group.
- Confirmed structurally in the classification comment: *"The replica_operations
  table is the operation LEDGER: every in-flight operation persists its workflow
  progress into it, so a partition of this table is the one partition whose own
  move disrupts every other move."*
  (`src/bootstrap/system-partition-classification.js:133-139`,
  `isOperationLedgerPartition`).

So a REPLACE self-move of `replica_operations-p1` writes its SENDING/…/COMPLETED
progress through `replica_operations-p1`'s quorum. Moving one of that group's
three voters (source→target) transiently drops the group to 2/3 healthy or
forces an election, and during that window the progress UPDATE returns
participant-failure / no-leader. **The self-reference is exact and structural.**

## 3. FEASIBILITY of off-partition routing

### (a) Write to a DIFFERENT `replica_operations` partition — NOT AVAILABLE
`replica_operations` is single-partition (§2). There is no sibling partition to
route to. This option would require introducing ledger sharding (a new
partitioning scheme for `replica_operations`, plus a routing rule that a
partition-p1 self-move's ledger row lives on a p2, etc.) — a large, invasive
control-plane/storage change with its own bootstrap circular-dependency and
recovery-scan implications. Effectively a redesign, not a routing tweak.

### (b) Leader-local durable store not requiring that partition's quorum — PLAUSIBLE-BUT-DEEP
The write path already has a leader-local *projection* (`operation-progress-store`
Map) but it is **non-durable** and a strict projection of the durable ledger. A
true fix here means: while a `replica_operations-p1` self-move is in flight,
persist that op's own progress to a **durable local store that is NOT gated by
`replica_operations-p1`'s raft quorum** (e.g. a leader-local write-ahead journal
on the coordinator, or routing the self-move's ledger row to a *different*
already-quorate control-plane partition). Then reconcile/replay into
`replica_operations-p1` after the move completes and leadership settles.

What this must not break:
- **Visibility reads / the interlock.** The self-move interlock and recovery
  read incomplete ops via `queryAuthoritativeOperationById` /
  `getIncompleteOperationObservation` with
  `CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY`
  (`replica-operation-repository-mutation-persistence-methods.js:281,334,364,426`;
  `replica-operation-repository-read-methods.js:303`;
  `replica-operation-repository-incomplete-read-methods.js`). These are already
  **owner-local** reads — they read the local durable/cache view, NOT a remote
  quorum read. So a leader-local durable journal is actually *aligned* with how
  the interlock already reads; the risk is a second read path / cache the
  interlock must also consult (memory directive: *avoid secondary/tertiary
  caches*).
- **CDC / cross-node visibility.** Other nodes and recovery see operation state
  ONLY through the `replica_operations` table CDC stream. A leader-local journal
  is invisible to them until replayed → any consumer that needs cross-node
  visibility of the self-move mid-flight (recovery on a *different* node after
  the coordinator dies) would see a gap. For a self-move this is bounded: the
  op's owner is the current leader; if it dies, the target-node handoff (which
  already ends the wedge) takes over.
- **Recovery/reconcile.** `recoverPersistedReplicaOperationMutation`,
  `confirmReplicaOperationPersistence`, the terminal-transition repair loop, and
  divergence re-insert (`resolveZeroChangeOperationUpdate`,
  `mutation-persistence-methods.js:277-324`) all assume the durable truth is the
  `replica_operations` row. A journaled+replayed value must land there
  eventually or these loops never confirm.

### (c) Deferred / journaled and replayed after the move — the most contained variant of (b)
Journal the self-move's OWN progress transitions locally (leader), keep serving
the interlock's OWNER_LOCAL reads from that journal, and replay into
`replica_operations-p1` once the move's target voter is quorum-ready. This is the
smallest surface that still breaks the self-reference: the self-move no longer
*blocks on its own quorum* to record its own progress.

### Existing off-partition mechanism? — NO durable one exists
The only "off the durable ledger" state is the **in-memory** `operation_progress`
projection (`operation-progress-store.js`) and the OWNER_LOCAL cache. Nothing
today writes durable operation state anywhere other than the `replica_operations`
table partition. So any of (b)/(c) is **new durable machinery**, though it can
reuse the existing OWNER_LOCAL read plumbing and the existing progress-store
projection as the serving layer.

## 4. OWNER-BOUNDARY / blast radius

This lever crosses **three owners**:
- **rebalancer** — the repository write methods and workflow owner (where the
  routing decision / journal would live).
- **control-plane** — `control-plane-system-table-gateway` mutation submission
  (would need an off-partition / journal sink concept).
- **storage/raft + query/distributed** — `cdc-integration-service` → `executeSQL`
  → partition write kernel / SQL routing is what pins the write to the partition
  leader; any true off-partition durability changes the write contract there.

Verdict: **NOT a contained rebalancer change — it is a deep write-path change to
the control-plane durable-mutation contract and the SQL/partition routing.** Even
the most contained variant (c) still adds a durable leader-local journal + a
replay/reconcile path and must be wired into every consumer that reads
`replica_operations` for cross-node recovery.

## 5. REUSE verdict

**NEW durable machinery, reusing existing read plumbing.**
- REUSED: the OWNER_LOCAL read path (`queryAuthoritativeOperationById(...,
  OWNER_LOCAL_ONLY)`, incomplete-read methods) that the interlock already uses —
  a journal-backed serving layer plugs in behind these without a new read API;
  the in-memory `operation_progress` projection (`operation-progress-store.js`)
  as the serving cache.
- NEW: a durable, quorum-independent local journal for a self-move's own
  progress + a replay/reconcile step into `replica_operations-p1`; the routing
  decision "this op's subject == this op's ledger partition → journal instead of
  quorum-write." There is no existing durable off-partition operation store to
  extend.

## 6. DT-FIRST proof path

Closest existing DT: **`test/convergence/dt6-rebalancer-formation-self-move-interlock.test.js`**.
It already models the exact fault as a deterministic predicate:
`ledgerProgressWriteFails(nonTerminalOps)` (`:107-111`) — the ledger rejects
progress writes when *"a disruptive (REPLACE/REMOVE) self-move of the ledger
partition"* is in flight — driven by a pure `driveTick` step-advance loop under a
`VirtualTimeSource` (`:145-169`). The virtual clock + predicate substrate can
inject the participant-failure-on-own-partition condition directly (no real
raft/quorum needed).

**Gap that must be closed to make it a faithful proof of THIS lever:** the
current predicate makes the write fail only when there is contention
(`nonTerminalOps.length > 1`) — so the self-move alone always persists. That
models the *interlock/ordering* fix, NOT the run-6 binding wedge, where the
self-move's OWN write fails *because its own voters are in transit*, even
serialized. To prove Lever A:
1. EXTEND the fault model so the self-move's own progress write fails during its
   voter-transit window regardless of contenders (a `selfMoveVoterInTransit`
   predicate keyed to the self-move op itself, matching the run-6 signature).
2. Model the lever: route the self-move's own progress persistence to a
   journal/off-partition sink NOT gated by that predicate, and assert the
   self-move reaches COMPLETED (and the client `ADD` becomes routable) despite
   the fault — red-on-revert when the routing is removed.

The deterministic substrate (`VirtualTimeSource`, the modeled predicate; see
`docs/deterministic-directed-testing-plan.md`) already supports expressing both
the fault and the lever as pure predicates, so a red-on-revert DT is achievable
without a live gate. Sibling DTs
`dt6-formation-ledger-spread-completion-self-move-interlock-deadlock.test.js` and
`dt6-ledger-leader-durability-fitness.test.js` cover the neighboring seams.

## 7. ADVERSARIAL — strongest reason this is INFEASIBLE / would NOT fix the wedge

**Correctness of moving a quorum fundamentally requires the old quorum to remain
authoritative until handoff — you cannot durably record "I am moving voter X of
group G" anywhere that group G's own consumers will trust, without either (i)
group G's quorum (the thing you're trying to avoid) or (ii) a second source of
truth that every recovery/CDC/interlock reader must now consult, which is exactly
the secondary-cache anti-pattern this codebase forbids.**

Concretely:
- The durable truth for operation state is the `replica_operations` CDC-backed
  table by contract; the interlock, recovery, terminal-repair, and divergence
  re-insert loops all confirm against it
  (`confirmReplicaOperationPersistence`, `resolveZeroChangeOperationUpdate`,
  `terminal-transition-repair`). A leader-local journal that is invisible to CDC
  means: if the coordinator/leader dies mid-move, a *different* node recovering
  from `replica_operations` sees the op frozen at its last quorum-written step —
  the same gap, just relocated. (Though note: in run-6 the wedge already ends
  precisely via the target-node handoff, so the journal only needs to survive
  the leader's own tenure — a bounded, arguably acceptable risk.)
- The observed failure is not merely a *write* failure but *"No leader available
  for write operation"* — the group has no leader during the voter transit.
  Reads scoped to that group would fail too; the only reason the interlock keeps
  working is that its reads are OWNER_LOCAL (already leader-local). So the read
  side does not force us back onto the quorum — which slightly *weakens* this
  adversarial point and is why variant (c) is not dead on arrival.
- Cheaper, already-precedented levers exist for the same wedge that do NOT touch
  the durable-write contract: bounding the leaderless window after a
  durability-fitness demotion, or faster target-voter reseat (both named in the
  run-6 verify doc's "forward" list). Off-partition persistence is the
  highest-blast-radius option among the candidates and should only be chosen if
  the bounded-window levers are refuted.

**Net:** Lever A is *structurally coherent* (the self-reference is real and the
interlock already reads leader-local, so the read side does not veto it) but is a
**deep, three-owner write-path change with a genuine cross-node-recovery
correctness hazard** (relocated-gap / secondary-truth). Feasible only in the
journaled-replay variant (c), and only worth it if the cheaper bounded-leaderless-
window levers fail. Recommend DT-modeling the extended fault first (§6) to
confirm the wedge even reproduces under "self-move alone still can't persist,"
then compare Lever A against the bounded-window levers before committing to the
write-path redesign.

---

### Key file:line index
- Progress write entry: `src/rebalancer/replica-operation-repository-mutation-persistence-methods.js:51 (insert), :151 (update)`
- Gateway hop: `.../replica-operation-repository-mutation-gateway-methods.js:91,156,166`
- Control-plane submit: `src/control-plane/control-plane-system-table-gateway-mutation-submission.js:160,258,279`
- Partition-leader routing: `src/cdc/cdc-integration-service-mutation-operations.js:221,247,367`
- Single-partition ledger: `src/bootstrap/system-table-schemas-constants.js:115,177`
- Ledger self-reference note: `src/bootstrap/system-partition-classification.js:133-139`
- OWNER_LOCAL interlock reads: `.../replica-operation-repository-read-methods.js:303`, `.../replica-operation-repository-incomplete-read-methods.js`, mutation-persistence `:281,334,364,426`
- In-memory projection (non-durable): `src/rebalancer/operation-progress-store.js:86`
- Closest DT + fault predicate: `test/convergence/dt6-rebalancer-formation-self-move-interlock.test.js:107,145`
