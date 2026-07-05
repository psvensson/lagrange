# Design — ledger spread-completion wedge fix (legs a + c)

Inputs: `research-rung0-verification.md` (deterministic probes) + `research-lingering-row-pin.md`
(run-28 log mining) + base forensics `../formation-ledger-post-spread-voter-visibility-latency/research-planner-spread-completion-defect.md`.

## What actually wedges (verified)

Two DISTINCT defects, both in the sealed class:

**Leg A — the binding deadlock (self-move blocked by a STALE GHOST).** In run-28 the
`replica_operations-p1` rebalancer leader moved to node-3 at 16:24:50.685 — 5 ms AFTER the
seed committed op-1's source removal (16:24:50.567) and logged op-1 COMPLETED (16:24:50.680).
node-3 inherited a cache last showing op-1 at STOPPING. The interlock's incomplete-operation
observation (`queryIncompleteOperations`) is CACHE-FIRST, so node-3 short-circuits on the
stale STOPPING row and never issues the authoritative read that would show COMPLETED. Result:
`ensureOperationLedgerSelfMoveSerialized` (rebalance-coordinator-ledger-interlock-admission.js
:160-171) sees op-1 in `liveOperations` and rejects every one of the 17 count-neutral spread
REPLACEs `operation_ledger_self_move_waiting_for_idle_ledger`. CL-043 staleness DOES eventually
release it (STOPPING removingTimeoutMs = 60 s) but node-3 got SIGTERM at 16:25:52, ~2 s before
the 60 s self-heal — and 60 s already exceeds the CREATE-TABLE 30 s budget. So the demo tears
down first.

Confirmed distinguishers (probe + logs):
- A same-partition lingering REPLACE trips an EARLIER entity-conflict gate
  (`conflicting_operation_in_flight`, rebalance-coordinator-priority-budget-admission.js:389)
  under a shared-fresh view; in run-28 that gate did NOT fire (its entity-scoped observation
  saw op-1 terminal) — only the interlock's cache-first node-scoped read saw the ghost. So
  the interlock is the sole blocker, and an authoritative re-verify there unblocks the REPLACE
  WITHOUT the entity-conflict gate re-blocking (it already passes).
- The op-2 ADD is NOT the blocker (its target = node-4, out of node-3's owner scope
  `source_node_id = node-3 OR target_node_id = node-3`; and it completed at 16:24:52).

**Leg C — the over-target root (spurious count-increasing ADD = op-2).** Confirmed at the
planner level (probe-planner): once op-1's REPLACE enters source-removal phase (ACTIVE/STOPPING)
it is EXCLUDED from `getEntityTopologyBlockingInFlightOperations()` (the drain-exclusive set,
unified-rebalancer-replica-state.js:613-624), so `inFlightReplaceInCreationCount = 0`; and its
replacement is still a LEARNER (not ACTIVE-committed) so it is NOT in `activeCount`. The
replacement is in a BLIND SPOT → `deficitEffectiveCount = 2 < target 3` → both count-increasing
ADD deferral guards (move-planner-move-calculation-methods.js:560-563 and :625-628) fail to
suppress → spurious ADD (op-2) → +1 voter → permanent over-target when the learner promotes.

Coupling: leg A breaks the deadlock (the hold releases on DE-CONCENTRATION, so even the
4-voter ledger clears once it spreads to ≤1/node). Leg C prevents the permanent over-target
state the sealed statement forbids. Leg A is necessary + sufficient for the admission hold to
release; leg C is required for "not over targetReplicaCount".

## The fix

### Leg A — authoritative re-verify of a same-ledger-partition self-move blocker
File: `src/rebalancer/rebalance-coordinator-ledger-interlock-admission.js`,
`ensureOperationLedgerSelfMoveSerialized` disruptive-self-move branch (:160-171).

When the disruptive self-move is blocked by `conflictingOperation`, and that conflicting op is
itself a DISRUPTIVE LEDGER SELF-MOVE of the SAME ledger partition (a prior spread REPLACE/REMOVE
of `replica_operations-*`), re-verify it AUTHORITATIVELY via a point read (reuse the existing
`queryOperationById` + `isOperationTerminal` / `isLiveOperationLedgerInterlockOperation` used by
`tryClearHeldOperationLedgerSelfMove` :510-534). If the authoritative read shows it TERMINAL
(or unreadable→keep blocking), it is a stale ghost → drop it from the live set and continue to
the next candidate; if it authoritatively remains non-terminal, KEEP BLOCKING (a genuine
in-flight reconfiguration must still serialize — run-20).

REUSE: `tryClearHeldOperationLedgerSelfMove`'s authoritative-point-read pattern; extend it to a
blocker inherited from a PRIOR leader (the current method only clears `state.heldSelfMoveOperationId`,
which node-3 never held). Narrow: applies ONLY to same-ledger-partition self-move blockers,
never to dependents (a dependent of another partition still blocks — it genuinely writes
progress into the ledger).

Why this is raft-safe (c-vet attack 1): a genuine in-progress source-removal config change
reads NON-TERMINAL on an authoritative point read → still blocks → no two concurrent config
changes. Only a bookkeeping-lag ghost (authoritatively terminal) is excluded. This does NOT
narrow the gate for dependents, so the run-20 storm (dependents co-admitting with a live
self-move) cannot recur.

### Leg C — count drain-inclusive in-flight REPLACEs in the deficit guards
File: `src/rebalancer/move-planner-move-calculation-methods.js`, the two count-increasing-ADD
deferral guards (:560-563, :625-628).

Hoist the drain-inclusive in-flight REPLACE count (the same
`getEntityInFlightOperations().filter(type === REPLACE).length` the serialization cap already
computes at :524-534) to a single value, and change BOTH deferral guards' condition from
`inFlightAccounting.deficitEffectiveCount >= targetReplicaCount`
to `inFlightAccounting.deficitEffectiveCount + inFlightReplaceCount >= targetReplicaCount`.

Rationale: each in-flight REPLACE guarantees a replacement that keeps the settled count; a
REPLACE whose source already left `activeCount` (drain phase, learner replacement) is exactly
the +1 the blind spot dropped. SAFE against genuine-deficit starvation (c-vet attack 2): the
estimate can only OVER-count (a creation-phase REPLACE whose source is still ACTIVE is counted
twice) → errs toward SUPPRESSING a redundant ADD, never toward starving a real deficit; a
replacement that never promotes leaves the in-flight set (session-3 voter-ready timeout →
failOperation) → count drops → deficit re-opens next tick (self-correcting). Distinguishes
"learner that WILL promote" (its REPLACE op is live) from "no replica" (no in-flight REPLACE).

## Explicitly NOT doing (c-class / c-vet)
- NO client timeout/budget raises (TEST-0021); NO lowering of removingTimeoutMs.
- NO weakening of run-20 disruptive-self-move serialization for dependents, NO run-22
  spread-first change. Leg A only re-verifies a SAME-partition self-move ghost authoritatively.
- NO fallback (b) over-target drain REMOVE unless legs a+c prove insufficient (leg C prevents
  reaching over-target; leg A + the existing over-target normal drain would clear a pre-existing
  surplus). Record as a lead if evidence points there.
- NO bootstrap placement redesign (spread at join time) — out of scope, record as lead.

## DT plan (rung 1)
1. Leg A DT (extend test/convergence/dt6-formation-ledger-quorum-spread-first.test.js): a
   lingering same-ledger-partition self-move row that is CACHE-non-terminal but AUTHORITATIVELY
   terminal; assert the next spread REPLACE is `waiting_for_idle_ledger` on head (RED) and
   ADMITS after the fix, ledger de-concentrates, holdEngaged clears. Cross-check
   dt6-rebalancer-formation-self-move-interlock.test.js: a genuine (authoritatively non-terminal)
   self-move still blocks (run-20 preserved).
2. Leg C DT (extend test/rebalancer for calculateMoves, or dt6): 2 ACTIVE seed voters + learner
   replacement + drain-phase REPLACE → planner emits a count-increasing ADD on head (RED),
   NONE after the fix. Also a genuine-deficit control (active < target, no in-flight REPLACE)
   still emits the ADD (no starvation).
3. dt:prove red-on-revert on both src files; scenario-harness x3.

---

## AMENDED DESIGN (post-vet REDESIGN — vet-design.md verdict)

The vet REFUTED the original leg-A premise: `queryOperationById` is CACHE-FIRST
(`replica-operation-repository-read-methods.js:257-261`), reading the SAME stale cache
`queryIncompleteOperations` short-circuits on — so re-verifying with it is INERT under the
run-28 frozen-cache pathology. Amended:

### Leg A (amended) — cache-BYPASSING authoritative re-verify
In `ensureOperationLedgerSelfMoveSerialized`'s disruptive-self-move branch, when blocked by a
`conflictingOperation` that is itself a disruptive ledger self-move of the SAME ledger
PARTITION ID (vet amendment 6: same raft group, not just any `replica_operations-*`),
re-verify via `queryAuthoritativeOperationVisibilityObservation(opId, {requireOwnerRpcRead:true})`
— confirmed cache-bypassing (STRICT visibility, `:307-310`) and robust to BOTH H1 (node-3
cache lag) AND H2 (unreplicated terminal), satisfying vet amendments 1+2 by construction.
It returns `{operation, deferredOutcome}`: if `operation` is TERMINAL → drop the ghost from
the live set and continue; if non-terminal → KEEP BLOCKING (genuine in-flight reconfiguration,
run-20 preserved); if `deferredOutcome`/unreadable → KEEP BLOCKING (defer, as the branch
already does for unresolved visibility). Vet A1–A5 SOUND; scope to same-partition self-moves
only keeps dependents blocking.
DT fidelity (vet amendment 3): the DT injects the stale ghost into the cache-first read seam
AND a distinct authoritative-terminal answer, so the fix's cache-bypass is genuinely exercised.

### Leg C (amended) — count OCCUPIED replicas, not just committed voters
The vet's original leg-C form (add drain-inclusive `inFlightReplaceCount` to the deficit
guard) was MUST-AMEND twice: (C1) unbounded by liveness → a ghost/failed REPLACE credited +1
starves a genuine deficit; (C3) `inFlightReplaceCount` is priority-gated but guard 2 (:625)
is not, so hoisting the bare count changes non-priority partitions fleet-wide. The
move-planner has NO staleness predicate access and `getInFlightOperations` applies no CL-043
filter, so the liveness bound would need new plumbing.

REPLACED with a cleaner, actuals-aligned form: the blind-spot replacement is a SYNCING
**learner**, which the accounting ALREADY counts in `occupiedCount`
(`in-flight-aware-replica-count.js:22-27,149-152`: PENDING/CREATING/SYNCING/ACTIVE). Change
both count-increasing-ADD deferral guards (:560-563, :625-628) to suppress when
`Math.max(deficitEffectiveCount, occupiedCount) >= targetReplicaCount`. This:
- closes the blind spot (the learner is counted via `occupiedCount`),
- ONLY ADDS suppression (never removes existing suppression) → no new under-suppression,
- reads ACTUAL placement rows (ARCH-0080/0084 actuals-only), not in-flight op cache → sidesteps
  vet C1 (no in-flight-REPLACE trust) AND C3 (occupiedCount is not priority-gated; identical
  meaning for all partitions),
- self-corrects: a learner that fails leaves `occupiedCount` (its placement row → failed/removed).
Empirically verified (probes): suppresses the run-28 spurious ADD; a genuine deficit
(active=1, no occupied) still emits 2 ADDs (no starvation).

### Scope note
Leg A is the BINDING deadlock-breaker (de-concentration releases the hold). Leg C prevents the
over-target state the sealed statement forbids. Both shipped; the DT asserts the run-28 shape
reaches ≤1 voter/node AND not over target.

---

## LEG C — FINAL FORM (post-implementation, after two existing tests refuted earlier framings)

Implementation testing refuted BOTH the `occupiedCount`-only form (broke
`unified-rebalancer-move-calculation-state-evaluation.test.js` "stale syncing replicas
without in-flight operations" — stale occupied rows wrongly counted) AND the pure
`deficitEffectiveCount + inFlightReplaceCredit` form (broke
`move-planner-critical-replace-serialization.test.js` "genuine deficit filled while a REPLACE
drains" — a net-neutral REPLACE whose source still counts active wrongly credited). The
three-way constraint (both existing tests + the run-28 DT) forces this combined condition:

    meetsReplicaCountTarget =
      deficitEffectiveCount >= targetReplicaCount            // committed voters + in-flight ADDs
      OR (occupiedCount >= targetReplicaCount                // occupied incl. a promoting learner
          AND inFlightReplaceCredit > 0)                     // ...driven by a live drain-inclusive REPLACE

used in BOTH count-increasing-ADD deferral guards. Case table (active / occupied / drain-incl
in-flight REPLACE → outcome):
  - stale-syncing test  (1 / 3 / 0) → deficit 1<3, occupied 3>=3 but credit 0 → NOT met → ADD ✓
  - serialization test  (2 / 2 / 1) → deficit 2<3, occupied 2<3 → NOT met → ADD ✓
  - run-28 blind spot   (2 / 3 / 1) → occupied 3>=3 AND credit 1>0 → MET → suppress spurious ADD ✓
  - genuine deficit     (1 / 1 / 0) → NOT met → ADD ✓
Priority-scoped: inFlightReplaceCredit is 0 for non-critical partitions, so the second clause
never fires there — non-priority deficit behavior is byte-identical (vet amendment 5). Self-
correcting on failure via BOTH surfaces: a failed replacement's placement row drops from
occupiedCount, and its REPLACE op leaves inFlightReplaceCredit (vet amendment 4 / C1). Reads
actuals (placement rows + drain-inclusive in-flight REPLACE), sidesteps vet C3 (occupiedCount
not priority-gated but the clause is gated by the credit). Verified: dt:prove red-on-revert;
full test/rebalancer suite green (0 fail); the two formerly-conflicting tests + accounting green.

---

## LEG C — CORRECTED (after re-verify found the boolean-condition starvation)

The focused re-verify (verify-legc-final.md) refuted the boolean combined condition:
`occupiedCount >= target AND inFlightReplaceCredit > 0` links two INDEPENDENT facts —
`inFlightReplaceCredit` counts ANY same-partition REPLACE, and during the run-28 spread there
are ~17 concurrent REPLACEs, so the clause degenerates to `occupiedCount >= target` (the exact
form the stale-syncing test refutes; that test only stayed green because it runs on a
NON-priority partition where the credit is forced 0). Concrete starvation:
(active=1 / occupied=3 stuck SYNCING / target=3 / one live REPLACE) → both genuine spread ADDs dropped.

FINAL measure — credit ONLY drain-phase REPLACE replacements that materialized as occupied rows:

    drainPhaseReplaceCount   = in-flight REPLACEs in source-removal (ACTIVE/STOPPING) phase
                               (isReplaceRemoveDispatchPhase), drain-inclusive, priority-scoped
    drainPhaseReplacementCredit =
        min( max(0, occupiedCount - activeCount - inFlightAddCount), drainPhaseReplaceCount )
    meetsReplicaCountTarget = deficitEffectiveCount + drainPhaseReplacementCredit >= target

Why this is correct: a drain-phase REPLACE's SOURCE has left activeCount while its REPLACEMENT
is a promoting occupied (non-active) row — the exact undercount. `occupiedCount - activeCount -
inFlightAddCount` is the occupied surplus not already counted (ADD rows are in
deficitEffectiveCount); capping by drainPhaseReplaceCount attributes that surplus ONLY to live
drain-phase REPLACEs, so stale SYNCING rows with no driving REPLACE are NOT credited (cap→0),
a creation-phase REPLACE (source still active) is NOT credited (not drain-phase), and the
verifier's (active=1/occupied=3/1 REPLACE) case credits min(2,1)=1 → deficit 1+1=2<3 → ADD
still fires. Case table (active/occupied/inFlightAdd/drain-REPLACE → credit → deficit+credit):
  stale-syncing        1/3/0/0 → min(2,0)=0 → 1 → ADD ✓
  serialization deficit 2/2/0/1 → min(0,1)=0 → 2 → ADD ✓
  run-28 blind spot    2/3/0/1 → min(1,1)=1 → 3 → suppress ✓
  verifier starvation  1/3/0/1 → min(2,1)=1 → 2 → ADD ✓
Self-corrects on failure via BOTH surfaces (row drops from occupiedCount; op leaves the
drain-phase set). Non-critical partitions: entityInFlightOperations=[] → both counts 0 →
byte-identical deficit behavior. Verified: dt:prove red-on-revert; 6100 rebalancer+convergence
tests green; the two formerly-conflicting tests + the verifier's starvation case are DT guards.
