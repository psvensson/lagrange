# Diagnose: source mechanism of the orphaned 2PC participant BEGIN on the ledger leader

Read-only source + run-6 log diagnosis. Scope: pin the PRECISE creation mechanism of the
orphaned `BEGIN IMMEDIATE` on `replica_operations-p1`'s leader, the RESIDUAL gap past the
companion quest `ledger-participant-transaction-zombie-lifecycle`, and a ranked list of
source-fix candidates. HEAD at diagnosis: `dc141f50` (working tree has the reverted
`fba0b477`/`43079838` count-leg fix backed out per `96a0917f`).

## TL;DR — the one-sentence mechanism

A 2PC participant hold on the operation ledger is a **leader-LOCAL, non-raft-replicated
`db.exec(BEGIN IMMEDIATE)`** opened on whichever node is `replica_operations-p1` leader at
enlist time (`partition-service-transaction-base.js:509`, `activeTransactions.set` :518).
The 2PC COMMIT/ROLLBACK for that participant is routed **by partition to the CURRENT
leader** (`sql-query-engine.js:499` `deliverTransactionOperation`), carries **no leadership
fence** (only BEGIN carries `transactionEpoch`; :516-518 sets it, COMMIT/ROLLBACK never
do), and there is **no rollback-on-step-down edge**. So when the ledger partition changes
leaders between BEGIN and COMMIT — which a ledger self-move REPLACE/REMOVE forces
constantly (run-6 liferaft term 2→21, ~19 elections in 4.5 min) — the open sqlite write tx
is **stranded on the ex-leader** (holding the write lock; in-memory writes succeed, nothing
durable), while the coordinator's COMMIT lands on the NEW leader, which has no such session
and returns `NO_ACTIVE_TRANSACTION_COMMIT`. That miss is then **masked as idempotent
success** (`shouldTreatParticipantCommitMissAsSuccess`, `distributed-transaction-protocol.js:102-112`
+ `IDEMPOTENT_COMMIT_MISS_ERROR_MESSAGES`, coordinator-constants.js:55), so the distributed
tx **terminalizes GREEN while the ledger leader stays frozen**. This is a DIFFERENT path
from the two the zombie quest closed (recovery-clobber and empty-set commit); the zombie
quest only bounded it downstream with the 60s role-gated ACTIVE-hold sweep, and that sweep
loses the race under a leadership flap.

## Run-6 evidence (read-only; the derivable part)

- Stuck-leader fitness signal, the smoking gun for the frozen hold:
  `node-2.log` (nodeId `82b7bf0d-82e9-4019-a497-b84046767eb5`), **07:04:17.119Z**:
  `"Replica local durability is unfit for leadership: writes are not reaching durable
  storage (stuck transaction or commit/durable divergence); shedding leadership if a viable
  successor exists"`, `partitionId=replica_operations-p1`, `replicaId=replica_operations-p1-r4`,
  `durableIndex=118`. This is `enforceLeaderDurabilityFitness` detecting `db.inTransaction`
  true with durable not advancing — i.e. the orphaned BEGIN IMMEDIATE.
- Leadership churn on the same replica on 82b7bf0d/node-2: `Became leader` for
  `replica_operations-p1` at **07:00:55.197** (term 2), then AGAIN at **07:05:35.525**
  (term 21) after `Handling STEP_DOWN_REPLICA request` at 07:00:54.936. The node is
  re-elected leader before any 60s sweep can complete the demote-then-heal.
- Cluster-level consequence (from the sibling `diagnose-run6-demo-stall.md`): during the
  07:03:20→07:05:52 dead window the frozen ledger holds `waiting_for_idle_ledger` and every
  sibling control-plane partition is blocked `operation_ledger_self_move_in_flight`
  (sql_transactions 35, sql_transaction_participants 24, control_plane_publications 13, …),
  so `[2/4]` load times out.

Evidence LIMIT (flag): the current demo logs are sparse at the 2PC layer — there is **no
per-session/per-transaction log line** naming the orphaned `sessionId`/`transactionId`, and
**no coordinator-side log of the empty/partial-set or idempotent-miss commit** (that path is
silent by construction). The orphan's identity is therefore **not derivable read-only** from
run-6; only the leader-side durability-unfit fitness event (07:04:17, 82b7bf0d,
replica_operations-p1-r4) and the leadership-flap timestamps are observable. Confirming the
exact orphaned tx requires either 2PC-layer debug logging or a deterministic in-process repro
(recommended: the coordinator harness + a partition leadership-handoff between enlist and
commit — see "DT shape" below).

## 1. Participant-set assembly, commit decision, and the race

**Assembly.** For a transaction-scoped write the SQL engine enlists per statement:
`sql-query-engine-write-execution.js:61-65` (INSERT), `:258`, `:452` call
`transactionCoordinator.enlistParticipants(sessionId, writePartitions)` BEFORE
`executePlan`. `enlistParticipants` (`distributed-transaction-coordinator.js:242-281`) for
each not-yet-enlisted partition does, in order:
1. `await this.beginParticipant(sessionId, partitionId, tx.transactionEpoch)` (:258) —
   wired to `engine.deliverTransactionOperation(..., BEGIN, {transactionEpoch})`
   (`sql-query-engine-instance-initializer.js:169-175`) → routed to the partition's current
   leader → `handleTransactionMessage` → `beginTransaction` (`partition-service-entry-apply-base.js:177`)
   → `db.exec(BEGIN IMMEDIATE)` + `activeTransactions.set` (`partition-service-transaction-base.js:509,518`).
2. `await workflowCoordinator.upsertParticipant(...)` (:260) — records the participant in
   the live in-memory `tx.participants` Map and bumps the monotonic
   `enlistedParticipantCount` (`durable-workflow-coordinator.js:243-249`).

**Commit decision.** `commit` → `runCommitProtocol` (`distributed-transaction-protocol.js:187-298`):
PREPARING → PREPARED → COMMITTING, each stage calling `executeParticipantStage` over
`tx.participants`. Empty/partial handling (post-zombie-quest):
- If a workflow that ever enlisted (`enlistedParticipantCount>0`) runs a stage with an EMPTY
  participants Map → hard abort `ENLISTED_PARTICIPANTS_MISSING`
  (`durable-workflow-coordinator.js:420-430`).
- If a REQUESTED key is missing from the Map → per-participant abort (:432-443).

**The race (leadership change, NOT empty-set).** The participant p1 IS present in
`tx.participants` and the registry is NOT empty, so neither guard fires. The break is
purely at the transport/ownership layer:
- The BEGIN's open sqlite tx is bound to **the specific NODE** that was leader at :258.
- `deliverTransactionOperation` addresses the partition, not the node; on COMMIT it routes to
  **whatever node is leader now** (`sql-query-engine.js:499`, `clearSessionPartitionAffinityOnSuccess`
  at :529-531 shows the session→partition affinity is *cleared* on commit, not pinned to the
  BEGIN's node), and it sends **no `transactionEpoch`/term** (:516 gates the epoch field on
  BEGIN only).
- After a leadership move the new leader's `commitTransaction` finds no session:
  `resolveActiveTransactionState() || resolvePreparedTransactionState()` → null →
  `throw NO_ACTIVE_TRANSACTION_COMMIT` (`partition-service-transaction-base.js:618-623`).
- Coordinator masks it: `shouldTreatParticipantCommitMissAsSuccess` returns true for the
  COMMITTING stage on a `NO_TRANSACTION`-class error/message
  (`distributed-transaction-protocol.js:102-112`, set at coordinator-constants.js:55-59) →
  the participant is marked COMMITTED, the tx reaches COMMITTED (:290-297) GREEN.

So the coordinator commits "successfully" while the ex-leader still holds an open
`BEGIN IMMEDIATE`. (Secondary micro-race, lower value: the :258→:260 ordering means a crash
BETWEEN begin-delivery and `upsertParticipant` also strands a BEGIN with
`enlistedParticipantCount` still 0 — the zombie vet recorded this asymmetry explicitly and
deferred it: vet-zombie-lifecycle-design.md:182-185.)

## 2. Why a LEDGER SELF-MOVE specifically triggers it

`replica_operations-p1` is the operation ledger; the rebalancer writes operation-progress
rows there via 2PC-enlisted control-plane transactions continuously. A **self-move**
(REPLACE/REMOVE of a `replica_operations-p1` voter — 34 REPLACE + 11 REMOVE in run-6 per the
sibling diagnosis) moves/repoints leadership **on the ledger partition itself** and, coupled
with the leader-durability-fitness step-downs, drives the term from 2→21 (~19 elections). So
the self-move maximizes the probability that a ledger progress-write BEGIN lands on a leader
that then loses leadership before its COMMIT — exactly the orphan condition. The orphaned
BEGIN then freezes the ledger's durable progress (durability-unfit 07:04:17), which holds the
ledger non-idle (`waiting_for_idle_ledger`), which via the self-move interlock blocks every
sibling control-plane partition — the run-6 wedge. It is a self-reinforcing loop: the
self-move orphans the tx → frozen ledger can't terminalize the self-move → interlock holds →
more flap → more orphans.

## 3. Existing zombie-quest guards, and why run-6 still orphans

The companion quest (`ledger-participant-transaction-zombie-lifecycle`, landed; see
verify-zombie-lifecycle-implementation.md "SHIP") closed the run-23 CREATION path and added
a downstream heal:

| Guard | Where | What it prevents | Fires in run-6? |
|---|---|---|---|
| Recovery skip-live (clobber guard) | `durable-workflow-coordinator.js:640-662`, `recover` :501-524; recovery.js:498-540 | Recovery replacing a LIVE tx's participants Map with a CDC-lagging cache copy (the run-23 empty-Map source) | **No** — no recovery clobber on this path; the participant was enlisted normally and stays in the Map. |
| Empty-set / missing-key commit refusal | `durable-workflow-coordinator.js:415-443` (`enlistedParticipantCount>0` + empty Map, or requested-but-missing key) | Committing with zero iterations over an emptied registry | **No** — the registry is NOT empty and p1 IS present; the coordinator DOES contact p1's partition (just the wrong, fresh leader). |
| Sessionless foreign-adoption removed | resolveActive/PreparedTransactionSessionId | A stray sessionless write/commit absorbing into a foreign tx | Not on this path. |
| **60s role-gated ACTIVE-hold sweep** (the only relevant one) | `partition-service-transaction-base.js:301-344` (`state.startTime` hold bound), heal gated on FOLLOWER/LEARNER-or-solo | Bounds an orphaned ACTIVE BEGIN and heals it crash-equivalently on a follower / demoted leader | **Fires but loses the race** — see below. |

**Why run-6 still orphans (residual is a DIFFERENT path):** the zombie quest fixed the
*coordinator-side empty-set/clobber creation*. This residual is a *transport/ownership
leadership-change orphan*: the participant is correctly enlisted and correctly in the set,
but the hold is stranded on the EX-leader by a leadership move and the terminal op is
idempotently absorbed by the NEW leader. The zombie quest **explicitly deferred exactly this**
("begins the participant BEFORE recording it — the enlist/rollback asymmetry stands; the
ACTIVE-hold sweep is what bounds a delivered-but-unrecorded participant BEGIN. No change
needed here for THIS quest (record)", vet-zombie-lifecycle-design.md:182-185).

The one guard that touches it — the 60s ACTIVE-hold sweep — is a **downstream bound, not a
prevention**, and it fails under the ledger flap:
- The heal is role-gated: a LEADER must first demote (fitness) then a later FOLLOWER tick
  rolls back. On 82b7bf0d the durability-unfit demotion request fires at 07:04:17 but is
  conditional on "a viable successor exists"; during the flap the peers are equally
  wedged/unfit, and the node is **re-elected leader at 07:05:35** — so the demote→FOLLOWER→heal
  loop never closes on the leader path before re-election.
- Even when it does eventually heal, the 60s bound is the ~60-78s the task observed — long
  enough for the ledger to freeze the whole control plane and time out `[2/4]`.
- The masking (`shouldTreatParticipantCommitMissAsSuccess`) means the coordinator NEVER learns
  the hold was lost, so there is no coordinator-driven retry/abort to shorten the window.

## 4. run-6 orphan identity

Derivable: the frozen hold is on **82b7bf0d / replica_operations-p1-r4**, detected
**07:04:17.119Z** (durability-unfit, durableIndex=118), inside the leadership window opened
at term 2 (07:00:55) and closed by re-election at term 21 (07:05:35). The specific
`sessionId`/`transactionId` and the coordinator-side idempotent-miss commit are **NOT
present in the logs** (2PC layer is not logged at info; the miss path is silent) — see the
Evidence LIMIT above. This is the honest read-only ceiling; nail identity with a repro.

## 5. Residual source-gap and ranked fix candidates

**The single most likely residual gap:** *the 2PC participant BEGIN hold is leader-LOCAL,
non-raft-replicated sqlite state with no leadership-term fence and no rollback-on-step-down
edge; a leadership change on the ledger partition orphans the open BEGIN on the ex-leader
while the coordinator's COMMIT is idempotently absorbed by the new leader.* A source fix must
guarantee: **a participant BEGIN can never remain open on a node that has ceased to be the
partition leader, and the coordinator can never green a commit whose participant hold was
lost across a leadership change.**

Ranked candidates (map to the prompt's a/b/c/d):

1. **[TOP] Rollback-on-step-down, term-fenced (prompt c+b; the load-bearing prevention).**
   On the leadership-loss EDGE, immediately roll back any open ACTIVE participant BEGIN
   (crash-equivalent), instead of waiting for the 60s sweep. A stepped-down leader can NEVER
   legally commit its leader-local hold (COMMIT will route elsewhere), so an edge rollback is
   always correct and turns a 60-78s orphan into ~0s.
   REUSE: the zombie quest's **already-proven** role-gated follower heal
   (`isStuckTransactionHealPermitted`, Z1 cache-invalidation, committedIndex-guarded
   crash-equivalence) — this fix just *triggers it on the demotion event* (the synchronous
   `wireReplicaLifecycleEvents`/`applyReplicaDemotion` FOLLOWER edge, replica-leadership-state.js)
   rather than only on the timer. Add a term/epoch stamp to `transactionState` at BEGIN
   (`transactionEpoch` already stored :506,518; also stamp `this.raft.term`) so the edge
   handler rolls back only holds opened under a now-stale term.
   OWNER: PartitionService (`partition-service-transaction-base.js` + demotion wiring) — a
   partition-owner-boundary change, no coordinator contract change. RISK: LOW–MEDIUM (reuses
   the crash-equivalent follower path, which step-down puts you into by definition; must keep
   the committedIndex guard so an already-replicated COMMIT is never re-truncated).

2. **Stop masking the leadership-change miss (prompt a; makes the orphan LOUD).** Narrow
   `shouldTreatParticipantCommitMissAsSuccess` so a `NO_ACTIVE_TRANSACTION_COMMIT` from a
   participant that this coordinator BELIEVES it began (participant recorded ACTIVE, never
   observed COMMITTED here) is NOT silently treated as success — surface a typed
   "participant hold lost / fenced" so the coordinator aborts loudly (and could re-drive
   against the new leader). REUSE: existing typed-failure path (`buildParticipantFailureResult`).
   OWNER: `distributed-transaction-protocol.js` (coordinator). RISK: MEDIUM — the carve-out
   exists precisely to converge after *legitimate* duplicate-commit/ACK-loss replay; must
   distinguish "already committed here" (real idempotent success) from "never committed here"
   (lost hold). This is a detection/honesty fix, not a prevention — pair with #1.

3. **Fence the participant hold by leadership term end-to-end (prompt b, strongest
   invariant).** Thread the BEGIN's raft term into COMMIT/PREPARE/ROLLBACK delivery
   (`deliverTransactionOperation` currently sends `transactionEpoch` on BEGIN only, :516) and
   have `beginTransaction` reject a BEGIN whose delivery term ≠ current leadership term, and
   `commit/prepare` reject a terminal op whose fenced term no longer matches. This makes
   "land-and-orphan" structurally impossible (a BEGIN routed to a mid-move/leaderless
   partition fails fast). REUSE: `transactionEpoch` plumbing + `activeTransactions` state.
   OWNER: split across coordinator wiring (initializer) and PartitionService. RISK: MEDIUM–HIGH
   (touches the 2PC message contract; more surface than #1). Largely subsumes #1's fencing but
   is a bigger change; #1 alone closes the freeze.

4. **Enlist atomic with BEGIN delivery (prompt c, secondary micro-race only).** Reorder/guard
   `enlistParticipants` so `upsertParticipant` (and `enlistedParticipantCount`) is committed
   before/with `beginParticipant`, closing the :258→:260 crash gap. OWNER: coordinator. RISK:
   LOW. VALUE: LOW — does NOT address the leadership-change orphan (the dominant run-6 path);
   only the crash-between micro-race. Do opportunistically, not as the fix.

5. **Don't 2PC the ledger self-move progress write against its own partition (prompt d).** If
   the operation-ledger progress write used a single-partition leader-lease-fenced local
   commit rather than a multi-partition BEGIN-hold 2PC, there'd be no cross-leadership
   participant hold to orphan on `replica_operations-p1`. OWNER: rebalancer / operation-ledger
   write path (NEW machinery / architectural). RISK: HIGH (scope; may not be feasible if the
   progress write genuinely spans partitions). Record as the long-term structural direction,
   not this quest's fix.

**Recommendation:** ship **#1 (term-fenced rollback-on-step-down, reusing the zombie quest's
crash-equivalent follower heal on the demotion edge)** as the source fix, paired with **#2
(narrow the idempotent-commit-miss mask so a lost hold is loud)** so the coordinator can no
longer green a commit over a stranded participant. Both are EXTENSIONS of shipped machinery
(zombie-quest heal + existing typed-failure path), both stay on the PartitionService /
coordinator owner boundaries already touched by that quest, and together they close the
freeze at its source without the HIGH-scope #3/#5. Prove FIRST with a deterministic
in-process repro (see below), then the live affinity demo.

### DT shape to confirm the mechanism (currently unconfirmed read-only)
Coordinator harness `test/query/distributed-transaction-coordinator.test.js` +
a PartitionService leadership-handoff: begin(s1) → enlistParticipants(s1,[p1]) [BEGIN lands
on leader A] → force p1 leadership handoff A→B (raft.change) → commit(s1) [routes to B].
Assert on HEAD: coordinator returns COMMITTED (masked success) while A's `db.inTransaction`
stays true (orphan). Assert post-fix: A rolls back on the step-down edge (db.inTransaction
false, crash-equivalent, committedIndex preserved) AND/OR the coordinator surfaces a typed
lost-hold failure. Red-on-revert per `dt:prove`.
