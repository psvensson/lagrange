# LEG C — FINAL FORM adversarial verification

Target: `meetsReplicaCountTarget` and its two count-increasing-ADD deferral guards in
`src/rebalancer/move-planner-move-calculation-methods.js`.

```
meetsReplicaCountTarget =
  deficitEffectiveCount >= targetReplicaCount                     (clause 1)
  OR (occupiedCount >= targetReplicaCount AND inFlightReplaceCredit > 0)   (clause 2)
```

Tuple notation below: (activeCount / occupiedCount / drain-inclusive in-flight REPLACE
credit / targetReplicaCount).

Facts established by reading source (not from the design doc):

- `inFlightReplaceCredit` (move-planner-move-calculation-methods.js:331-341): `0` for a
  non-priority partition; otherwise `getEntityInFlightOperations().filter(type==='replace').length`.
  Type constant `REBALANCER_MOVE_TYPE.REPLACE === 'replace'` (rebalancer-constants.js:35) and the
  filter lowercases the op field → **type-string match is correct**. Entity-scoped via
  `getInFlightOperations` → `isOperationForEntity`. **Counts stale (non-terminal) ops**:
  `isTrackedInFlightOperation` (unified-rebalancer-replica-state.js:314-341) rejects only
  TERMINAL ops; it does NOT call `isReplicaOperationStale` (that filter lives only in
  `isTopologySettlingInFlightOperation`, an unused-here path). So a lingering STOPPING ghost
  still credits.
- `occupiedCount` (in-flight-aware-replica-count.js:22-27,115-118) = count of distinct replica
  rows whose status ∈ {PENDING,CREATING,SYNCING,ACTIVE}. **Pure row status — no staleness / no
  liveness / no node-distribution.** A stuck SYNCING row that will never promote counts the same
  as a promoting learner.
- `activePlacementReplicas` (move-planner:134-137) and thus `replicasByNode`/removal candidates
  are **ACTIVE-only**. A SYNCING row is never a REMOVE/REPLACE candidate.
- `isControlPlanePriorityPartition()` is true only for the 5 system tables in
  `PRIORITY_CONTROL_PLANE_TABLE_IDS` (system-partition-classification.js:17-23,128-131), resolved
  deterministically from table_id. User partitions are always non-priority.

---

## Attack 1 — STARVATION.  Verdict: MUST-FIX

**The two conjuncts of clause 2 are independent facts that the code never links.**
`occupiedCount >= target` can be satisfied entirely by STALE / undriven SYNCING rows, and
`inFlightReplaceCredit > 0` can be satisfied by an *unrelated* same-partition REPLACE. Clause 2
was introduced (per the FINAL-FORM note) specifically to stop the `occupiedCount`-only form from
counting stale rows — but the `credit > 0` gate is not a per-row liveness proof, so it fails to do
that whenever any REPLACE is in flight.

Concrete state — priority ledger partition (`replica_operations-*`), target=3,
targetNodes=[node-1,node-2,node-3]:

- node-1: r1 ACTIVE; r2 SYNCING (stuck learner from a prior failed op, no driving op); r3 SYNCING (stuck).
- node-2: empty.  node-3: empty.
- one live same-partition REPLACE draining/wedged (target ≠ node-2/node-3).

Tuple **(active=1 / occupied=3 / credit=1 / target=3)**. Trace of `calculateMoves`:

1. addMoves: node-2 needs 1, node-3 needs 1 → 2 count-increasing ADDs (neither node is
   add-transitional; the REPLACE targets elsewhere).
2. over-creation cap (line 371): activeCount 1 > 3? no → does not fire.
3. candidateRemoves: `replicasByNode` is built from ACTIVE rows only → node-1 has 1 ACTIVE, excess
   1−1=0 → **no removes**. So no REPLACE pairing; `replaceMoves` stays empty.
4. reconcile guard (line 658): addMoves 2 > 0, replaceMoves.length === 0,
   `meetsReplicaCountTarget` = (deficit 1≥3? no) OR (occupied 3≥3 AND credit 1>0 → **yes**) = TRUE
   → both INCREASE_REPLICA_COUNT ADDs dropped.
5. Result: **no moves**. node-2 and node-3 stay empty; the partition holds at 1 real voter with
   target 3.

Why the "self-correcting" claim fails here: r2/r3 are *stuck*, not *failed*. Nothing promotes them
and nothing fails them, so their rows never leave `occupiedCount` (this is exactly the state the
existing test *"does not block rebalance on stale syncing replicas without in-flight operations"*
codifies as real and persistent). The deficit therefore persists as long as any same-partition
REPLACE keeps `credit > 0`.

**Why this is realizable on the exact target workload (killer point):** during the run-28 ledger
spread there are many concurrent same-partition REPLACEs (the ~17 spread REPLACEs). So
`inFlightReplaceCredit` is persistently ≫ 0 for the whole spread window. Under that condition
clause 2 **degenerates to `occupiedCount >= target`** — i.e. precisely the `occupiedCount`-only
form the FINAL-FORM note says was refuted by the stale-syncing test. The refutation still applies;
it has merely been hidden behind a predicate that is ~always true in the workload where the guard
actually runs. The only reason the existing stale-syncing test stays green is that it runs on a
NON-priority `partition-1` (credit forced to 0). Promote that same shape to a priority partition
with one REPLACE in flight and it starves.

This defeats the design's stated safety ("SAFE against genuine-deficit starvation… the estimate
can only OVER-count… errs toward suppressing a redundant ADD, never toward starving a real
deficit"). It over-counts *occupancy* using rows that will never become voters.

---

## Attack 2 — UNDER-SUPPRESSION (blind spot).  Verdict: RISK

The headline run-28 tuple (2/3/1) IS closed: the drain-phase REPLACE is counted (credit=1 — not
filtered by staleness), and the promoting learner is a SYNCING row so occupied=3. clause 2 fires →
spurious ADD suppressed. Correct.

Two residual holes:

- **Pre-materialization window.** Between REPLACE dispatch and the target replica ROW being
  written, the learner is not yet in `occupiedCount`. State (active=2 / occupied=2 / credit=1 /
  target=3): clause 1 2≥3 no; clause 2 occupied 2≥3 no → NOT met. A count-increasing ADD aimed at
  a node the REPLACE is *not* targeting would slip through here. This is narrower than the
  materialized case and partly mitigated by the add-transitional skip on the REPLACE's own target,
  but it is not covered by any test. Needs a DT to confirm/deny; flagged RISK, not confirmed.
- **Provider fallback.** `getEntityInFlightOperations` (move-planner-state-methods.js:255-263)
  falls back to `getEntityTopologyBlockingInFlightOperations` (drain-EXCLUSIVE) when the provider
  lacks `getInFlightOperations`. In that path a drain-phase REPLACE is not counted → credit=0 →
  blind spot re-opens. The production rebalancer implements `getInFlightOperations`, so this is a
  test/mock fragility, not a prod bug — but it means the fix silently no-ops on any provider
  missing that method.

---

## Attack 3 — INTERACTION with over-creation cap / serialization cap.  Verdict: CORRECT

- The over-creation cap (line 371) runs BEFORE `meetsReplicaCountTarget` is consumed and keys on
  the STRICTER `activeCount > target`. When it fires it zeroes addMoves, so the later guards are
  moot. When active ≤ target it stays silent by design and the occupancy-based clause 2 is allowed
  to fire — this active-vs-occupied divergence is the intended blind-spot fix, not an
  inconsistency.
- The two ADD-deferral guards are mutually exclusive: guard 1 (line 593) requires
  `replaceCount < naturalReplaceCount` inside the replace-pairing block; guard 2 (line 658)
  requires `replaceMoves.length === 0`. When a REPLACE is emitted (replaceMoves non-empty) guard 2
  is skipped and guard 1 handles any leftover count-increasing adds; when none is emitted guard 2
  handles them. I could not construct a state where one fires and the other should have but did
  not, for the same tick. No harmful inconsistency found.

---

## Attack 4 — NON-PRIORITY partitions.  Verdict: CORRECT

`inFlightReplaceCredit` is a literal `0` for non-priority partitions, so clause 2 is dead and
`meetsReplicaCountTarget` reduces to the pre-existing `deficitEffectiveCount >= target`. Behavior
is byte-identical to before this change for every user partition. `isControlPlanePriorityPartition`
is decided purely by resolved table_id against a fixed 5-table set; there is no path by which a
user data partition is classified priority. Confirmed.

---

## Attack 5 — SPREAD vs COUNT.  Verdict: RISK (same root as attack 1)

All addMoves are created with reason `INCREASE_REPLICA_COUNT` (line 301 is the only ADD producer);
both guards retain non-INCREASE_REPLICA_COUNT moves, i.e. they drop *all* addMoves when they fire.
SPREAD is served by REPLACE (paired ADD+REMOVE), which lives in `replaceMoves`/`candidateRemoves`
and is never touched by these guards. So suppressing a count-increasing ADD cannot directly cancel
a REPLACE-served spread. That part is fine.

The residual risk is the same decoupling as attack 1 seen from the spread angle: `occupiedCount`
ignores node distribution, so a set of rows fully concentrated on one node (or made of stale
SYNCING rows) still satisfies `occupied >= target`. When those rows are non-ACTIVE they generate no
REMOVE candidate, so the spread-completing move can only be a fresh ADD on an empty node — which
clause 2 then suppresses. A partition that is "at occupancy but mis-spread with stuck learners"
therefore never completes its spread. This is precisely the wedge the quest is trying to clear, so
the guard can re-introduce it under the attack-1 state. Fixing attack 1 fixes this.

---

## Overall: FIX-THEN-SHIP

The combined condition closes the materialized run-28 blind spot (attack 2 headline, attack 3,
attack 4 all sound), but clause 2 replaces the refuted `occupiedCount`-only form with an
`occupiedCount`-only form **gated by a predicate that is ~always true in the very workload where
the guard runs** (concurrent same-partition REPLACEs during ledger spread). It therefore re-opens a
genuine, persistent starvation on the target partition class and can re-wedge spread completion.

### Required fixes

1. **Row-link the liveness gate (blocks ship).** Clause 2 must credit only occupancy that a live
   operation is actually driving, not global `occupiedCount` conjoined with a global REPLACE count.
   Concretely: count the SYNCING learner(s) belonging to the in-flight REPLACE op(s) (match on the
   REPLACE's target replica_id / target node) rather than all occupied rows; or subtract SYNCING
   rows that have no corresponding non-terminal driving operation before comparing to target.

2. **Exclude undriven / stale SYNCING rows from the occupancy used by clause 2.** The move-planner
   currently has no staleness predicate over replica rows (the AMENDED-DESIGN note explicitly
   deferred that plumbing); that deferred work is the actual fix. Until a row-age or
   driving-op check exists, `occupiedCount` cannot be trusted as a target proxy on a priority
   partition mid-churn.

3. **Add the missing DT quadrant.** Priority partition, target=3, one seed ACTIVE + two stuck
   SYNCING rows on node-1, node-2/node-3 empty, one unrelated same-partition live REPLACE in flight
   → assert the deficit ADD(s) for the empty nodes STILL fire (RED on current code, GREEN after fix
   1). This is the priority-partition analogue of the existing non-priority stale-syncing test and
   is exactly the case current coverage omits.

4. **(Lower priority) Guard the provider fallback.** Either require `getInFlightOperations` on the
   provider or document that clause 2 no-ops without it, so the drain-inclusive credit cannot
   silently read a drain-exclusive count.
