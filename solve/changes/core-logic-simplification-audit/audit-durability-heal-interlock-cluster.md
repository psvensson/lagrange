# Simplification audit — durability-fitness + transaction-heal + ledger-admission-interlock

Scope: consolidation / merge / reuse opportunities across the three accreted
control-plane subsystems, behavior-preserving only. Anything touching
raft-durability/rollback is flagged DESIGN-ONLY. No source edited.

Files audited:
- `src/partition/partition-service-durability-fitness.js` (detect + demote, 421 L)
- `src/partition/partition-service-transaction-base.js` (heal, 894 L; heal locus 280–401, 749–779)
- `src/rebalancer/rebalance-coordinator-ledger-interlock-admission.js` (interlock, 635 L)
- `src/rebalancer/operation-ledger-quorum-concentration.js` (shared concentration predicate, 231 L)
- `src/raft/sqlite-log-adapter.js` (`removeEntriesAfter` guard `3717c518`, 564–610; `setCommittedIndex` 648–665)

---

## Q1 — Detector/heal coupling: does `3717c518` subsume the "demote before rollback" prerequisite?

**Verdict: NO. The prerequisite (`isStuckTransactionHealPermitted`, transaction-base.js:396-401)
remains fully necessary. The guard is a defense-in-depth backstop for ONE of the two harms,
not a replacement. DESIGN-ONLY; do not weaken.**

The heal comment (transaction-base.js:326-331) names **two distinct harms** of a leader-side
bare `ROLLBACK`:
1. it **re-mints already-acked raft indices** (leader loses log suffix, then reuses those
   indices for different entries), and
2. it **makes followers truncate committed entries**.

The `3717c518` guard (`removeEntriesAfter`, sqlite-log-adapter.js:564-610) clamps the deletion
floor to the LOCAL persisted `committedIndex`, so a follower asked to truncate into its
committed prefix now refuses. That addresses harm **#2's worst outcome** (silent committed-entry
deletion → log hole) — but only partially, and not harm #1 at all:

- **Harm #1 (re-mint / divergence) is untouched.** After a leader bare-rollback, the guard does
  not stop the leader from re-appending *different* entries at indices that were already
  quorum-acked. What changes is the failure mode: instead of followers silently deleting
  committed history, they now *refuse* the conflicting truncation (loud) and **diverge** from the
  leader. That is strictly better than data loss but is still a broken state — the demotion
  prerequisite prevents the re-mint from ever happening.
- **The guard's floor is the LOCAL `committedIndex`, which lags the true raft commit point.**
  An entry can be majority-acked (committed in raft terms) while this node's persisted
  `committedIndex` watermark has not yet advanced (`setCommittedIndex` runs on ack processing,
  sqlite-log-adapter.js:648-665). A rollback that discards such acked-but-not-yet-watermarked
  entries sits ABOVE the guard's clamp floor, so the guard does NOT protect them — exactly the
  "re-mints already-acked indices" harm the comment calls out.

So the two mechanisms are **orthogonal and complementary**, confirmed by the post-fix run
(`postfix-binding-root-durability-fitness-flap.md` Task 4): the guard fires 143/6/9/219/42× per
node AND the durability detector still correctly demotes on a genuine 60s open transaction; the
guard "neither causes nor cures" the residual. **Keep the prerequisite. No simplification here.**

---

## Q2 — Two durability signals, one root: can they collapse to one?

**Verdict: NO — keep both. They are the SAME open transaction in the observed run, but signal
(b) covers a failure FAMILY that signal (a) structurally cannot see. Verified.**

- Signal (a) `transaction_hold` (durability-fitness.js:266-286) requires
  `Boolean(this.db?.open && this.db.inTransaction)`. It fires only when a transaction is *open*.
- Signal (b) `commit_durability_divergence` (durability-fitness.js:294-319) compares the
  in-memory `getLastDeclaredCommitIndex()` against a separate READONLY witness read of durable
  `_raft_state.committedIndex`. It requires no open transaction.

The diagnosis (`postfix-binding-root-durability-fitness-flap.md`, Tasks 2-3) confirms that in the
run-23 zombie / orphaned-participant case the two are "one root, two windows" — declared races
ahead while a `BEGIN IMMEDIATE` blocks the durable watermark write. BUT the code comment
(durability-fitness.js:26-30) documents (b)'s independent purpose: the **silently-closed-adapter
family that holds no transaction at all**. If `this.db.open` is false (silent close / frozen
adapter), signal (a) evaluates false and never fires, while signal (b) still detects the frozen
durable watermark via the separate readonly connection. Collapsing to (a) would re-open the
silent-freeze class that this whole mixin exists to close (run-23). **Genuinely two failure
families; keep both signals.** (`:memory:` partitions correctly degrade to (a) only, per the
same comment and the null-return in `readDurableCommittedIndexWitness`:160-161.)

---

## Q3 — Interlock gate overlap: how many "defer, ledger busy/concentrated" gates, any duplicates?

**The concentration LOGIC is already single-sourced** in
`operation-ledger-quorum-concentration.js` (the module "deliberately owns NO policy", :17-19).
No gate re-implements the concentration check. The distinct deferral gates are:

| # | Gate | Method / file:line | Reason code(s) | Concern |
|---|------|--------------------|----------------|---------|
| 1 | Async self-move serialization | `ensureOperationLedgerSelfMoveSerialized` interlock-admission.js:129-223 | `self_move_waiting_for_idle_ledger`, `self_move_in_flight` | cross-node/cross-source backstop over committed rows |
| 2 | Sync same-coordinator accounting | `runOperationLedgerInterlockAccountedCreate` :437-535 | SAME two codes | TOCTOU window where rows not yet cache-visible |
| 3 | Quorum-concentration hold (admission) | `ensureOperationLedgerQuorumSpreadFirst` :315-338 | `quorum_concentrated` | run-22 release-too-early gap |
| 4 | Quorum-concentration gate (planner) | `isOperationLedgerQuorumConcentratedForPartition` :351-356 | (boolean, no throw) | ensures the CURE move gets planned |
| — | over-target | NOT a separate gate — the `overTarget` sub-flag inside concentration (`evaluateLedgerPartitionConcentration` quorum-concentration.js:145-154, feeds `spreadActionable`) | — | (the move-planner "over-target accounting" is a SEPARATE subsystem, not an admission gate) |
| — | priority-budget admission | `rebalance-coordinator-priority-budget-admission.js` | — | orthogonal (concurrent-op budget); grep confirms it does NOT reference concentration or self-move checks |

Findings:
- **#1 and #2 are complementary by design, not duplicates** (async vs sync/TOCTOU, documented at
  :423-435). Not a merge target — merging would drop either the cross-node backstop or the
  TOCTOU close.
- **#3 and #4 both call `evaluateOperationLedgerQuorumConcentration(this.systemTableCache)` fresh**
  (interlock-admission.js:316 and :353) — the only two call sites in the repo. Same pure function,
  same input, **computed twice per cycle** at different phases (planning then admission). The
  concentration *check* is not duplicated (single module), but its *evaluation is recomputed*.
  A per-cycle memo is possible but the two run at different phases with a potentially-mutated
  cache between them, so memoizing across phases would introduce staleness = behavior change.
  **Low value, NOT a safe mechanical merge** unless scoped to a single explicit cycle token.
- **Real duplication = interlock error-construction boilerplate.** The same three error shapes
  (`_WAITING_MESSAGE_SUFFIX`+`_WAITING_REASON_CODE`; `_BLOCKING_MESSAGE_SUFFIX`+
  `_BLOCKING_REASON_CODE` with/without opId) are hand-assembled ~7 times via
  `createOperationLedgerInterlockError(...)` with identical prefix/suffix/code triples:
  async :166-173, :215-222; sync :455-462, :490-497, :504-511, :517-524, :553-560. This is a
  SAFE behavior-preserving consolidation (see proposal #1).

---

## Q4 — Dead / vestigial paths

(Dead-code sweep subagent results folded in below.)

- `isStuckTransactionHealPermitted` has **two live callers** (sweep :331; explicit-rollback
  error path :764) — NOT dead; both gate a bare `db.exec(ROLLBACK)` on the same predicate.
- Post-rollback cache-clear sequence `recentlyAppliedEntryKeys?.clear?.()` +
  `logAdapter?.refreshCommittedIndexCacheFromStore?.()` is duplicated verbatim at :356-357 and
  :767-768 — a small dedup candidate (proposal #4).

**Dead-code sweep (verified against src/ AND test/):**

- Interlock + concentration: **no dead exports.** Sole interlock export
  `applyRebalanceCoordinatorLedgerInterlockAdmissionMethods` is wired at
  `rebalance-coordinator.js:227`; both concentration exports are called from interlock-admission.js
  (:316/:352/:353). All other concentration functions are module-internal helpers reachable from
  those two exports.
- Transaction-heal: **no dead code.** Every method has a live caller; `isSoloReplicaGroup` is also
  consumed by durability-fitness.js:138,355.
- Durability-fitness: **no truly dead code, but two TEST-ONLY injection seams** (initial sweep
  mislabeled these "DEAD" — corrected here after grepping test/):
  - `setLeaderDurabilityUnfitHook` (:90) — called ONLY by
    `test/convergence/dt6-ledger-leader-durability-fitness.test.js:88,182`. No `src/` caller wires
    it, so the consumer branch `this.leaderDurabilityUnfitHook?.(evidence)` (:399) is a **no-op in
    production** (demotion itself happens via `performTrackedLeaderDemotion(this)` at :398). The
    doc comment (:84-89) "The replica handler wires this to requestTrackedPartitionLeaderHandoff"
    is **STALE** — no such wiring exists in `src/`. This is doc-drift on a live test seam, NOT
    removable code.
  - `setLeaderDurabilitySuccessorProbe` (:102) — called ONLY by the same dt6 test
    (:193,488,544). Production always takes the default follower-ack path in
    `hasViableLeaderDurabilitySuccessor` (:111-120). A legitimate deterministic-test injection
    seam, NOT dead.
  - Neither is removable (removing breaks dt6 + the per-directive "NEVER flag/remove test
    seams"). The only actionable item is the STALE comment at :84-89 (proposal #6, doc-only).

---

## Ranked consolidation proposals

Ordered SAFE (behavior-preserving, mechanical) first; DESIGN-ONLY (raft-safety) last.

### 1. [SAFE] Extract interlock error-builders (kill ~7× boilerplate)
- **Files/lines:** interlock-admission.js:166-173, :215-222, :455-462, :490-497, :504-511,
  :517-524, :553-560.
- **Merge target:** two private helpers on the same class, e.g.
  `throwSelfMoveWaiting(moveType, partitionId, opId)` and
  `throwSelfMoveBlocking(moveType, partitionId, opId)`, each wrapping the existing
  `createOperationLedgerInterlockError` with the fixed prefix/suffix/code triple.
- **Invariant preserved:** identical Error object (same message string, `admissionResult`,
  `rebalanceSkipReason`) — pure string/shape factoring.
- **Blast radius:** one file; no call graph change; existing interlock tests exercise every
  branch.
- **Risk:** very low. The only care point is preserving each site's partitionId argument
  (`partitionId` vs `state.heldSelfMovePartitionId || partitionId` vs
  `liveLedgerSelfMove.partitionId`) — pass it in, don't hardcode.

### 2. [SAFE] Dedup the post-rollback cache-clear in the heal
- **Files/lines:** transaction-base.js:356-357 and :767-768 (identical
  `recentlyAppliedEntryKeys?.clear?.()` + `logAdapter?.refreshCommittedIndexCacheFromStore?.()`).
- **Merge target:** one private `clearHealSurvivingCaches()` called from both post-rollback sites.
- **Invariant preserved:** the Z1 finding (apply-dedup set + monotonic committed-index cache must
  be cleared after a swept rollback) — same two calls, same order.
- **Blast radius:** one file.
- **Risk:** very low; behavior identical.

### 3. [SAFE, LOW VALUE] Single per-cycle concentration evaluation
- **Files/lines:** interlock-admission.js:316 (`ensureOperationLedgerQuorumSpreadFirst`) and :353
  (`isOperationLedgerQuorumConcentratedForPartition`) both recompute
  `evaluateOperationLedgerQuorumConcentration`.
- **Merge target:** memoize per rebalance cycle keyed by a cycle token, NOT unconditionally.
- **Invariant preserved:** each consumer must still see the concentration as-of ITS phase — so
  the memo must be invalidated between the planning gate (#4) and the admission hold (#3).
- **Blast radius:** interlock-admission.js + a cycle-token source.
- **Risk:** MEDIUM (staleness). Only worth it if profiling shows the double cache-scan matters;
  otherwise leave as-is. Recommend **defer** — the logic is already single-sourced, this is only
  a compute micro-dedup.

### 4. [DESIGN-ONLY] Do NOT collapse the two durability signals — documented for completeness
- Q2: signal (b) covers the silent-closed-adapter family (a) cannot see. Keep both. No change.

### 5. [DESIGN-ONLY] Do NOT weaken the "demote before rollback" prerequisite
- Q1: `3717c518` backstops follower committed-prefix deletion (harm #2) but does NOT subsume the
  prerequisite — harm #1 (leader re-mint/divergence) and acked-but-not-yet-watermarked entries
  remain unprotected by the guard. Keep `isStuckTransactionHealPermitted` exactly as is. Any
  change here is raft-safety-critical and design-gated, never mechanical.

### 6. [SAFE, DOC-ONLY] Fix the stale unfit-hook comment
- **Files/lines:** durability-fitness.js:84-89 claims "The replica handler wires this to
  requestTrackedPartitionLeaderHandoff" — no such `src/` wiring exists; the hook is test-only and
  the consumer branch at :399 is a production no-op.
- **Merge target:** correct the comment to state the hook is a test/observability injection seam
  (production demotion runs via `performTrackedLeaderDemotion` at :398). Do NOT remove the setter
  or hook — dt6 uses it.
- **Invariant preserved:** none touched (comment only).
- **Blast radius / risk:** none.

---

## Bottom line

Two clean SAFE wins (#1 error-builder extraction, #2 cache-clear dedup), both pure factoring
within a single file with existing test coverage. One deferred micro-dedup (#3). The two
headline "could these collapse?" questions (Q1 prerequisite, Q2 second signal) both resolve to
**NO — keep them**: each guards a distinct failure family that the other mechanism does not
cover. The concentration check is ALREADY consolidated into one shared module; there is no
duplicate concentration logic to merge.
