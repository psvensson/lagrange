# LEG C — CORRECTED form, third adversarial verification

Target: the drain-phase-bounded numeric credit in
`src/rebalancer/move-planner-move-calculation-methods.js` (working-tree diff, uncommitted):

```
criticalControlPlanePartition = isControlPlanePriorityPartition()
entityInFlightOperations     = criticalControlPlanePartition ? getEntityInFlightOperations() : []   // drain-INCLUSIVE, cache-first
drainPhaseReplaceCount       = entityInFlightOperations.filter(isReplaceRemoveDispatchPhase).length
drainPhaseReplacementCredit  = min( max(0, occupiedCount - activeCount - inFlightAddCount), drainPhaseReplaceCount )
meetsReplicaCountTarget      = deficitEffectiveCount + drainPhaseReplacementCredit >= targetReplicaCount
```
Used in BOTH count-increasing-ADD deferral guards (:606 serialization-cap defer, :671 reconcile).

Facts established by reading source (not the design doc):

- `getEntityInFlightOperations()` → `moveStateProvider.getInFlightOperations()`
  (move-planner-state-methods.js:255-263) reads `systemTableCache`
  (unified-rebalancer-replica-state.js:544-554, `@readModel …SYSTEM_TABLE_CACHE`) and filters ONLY
  with `isTrackedInFlightOperation` — which rejects **terminal** ops but does **NOT** call
  `isReplicaOperationStale` (that filter lives only in the unused-here `isTopologySettlingInFlightOperation`,
  :522-535). **A lingering STOPPING/ACTIVE ghost still counts.** This is the cache-first read that Leg A
  re-verifies for the *admission* gate; Leg A does not write the cache back, so the *planner's* view still
  sees the ghost.
- `isReplaceRemoveDispatchPhase` (replica-operation-progress.js:693-698) matches
  type∈{REPLACE} AND workflow_step∈{ACTIVE,STOPPING}, both read via
  `readReplicaOperationRecordType` / `readReplicaOperationRecordWorkflowStep` which `.toUpperCase()`
  and read `type|operation_type|operationType` and `workflowStep|workflow_step`. **Case- and
  field-form-robust** — attack-2 "string form/case" concern is closed.
- `occupiedCount` (in-flight-aware-replica-count.js:22-27,115-118) = distinct rows with status
  ∈{PENDING,CREATING,SYNCING,ACTIVE}. **Pure row status — no staleness, no node-distribution, no
  driving-op link.**
- `deficitEffectiveCount = activeCount + inFlightAddCount`; `inFlightAddCount` counts add-transitional
  ADD ops **from the drain-EXCLUSIVE set** whose replica_id is NOT already an occupied row
  (:135-139) — so a *materialized* ADD learner is in `occupiedCount` but NOT in `inFlightAddCount`.
- **Arithmetic bound:** since `credit ≤ surplus = occupiedCount - activeCount - inFlightAddCount`,
  `meets_value = deficitEffectiveCount + credit ≤ occupiedCount`. So suppression can only fire when
  `occupiedCount ≥ target`. Good floor — but occupiedCount includes stale/mis-spread rows.

---

## Attack 1 — STARVATION.  Verdict: **MUST-FIX**

**Root cause: the credit attributes surplus occupied rows to drain-phase REPLACEs by COUNT, without
verifying the surplus row IS that REPLACE's replacement (no replica_id / target-node link).** The cap
`min(surplus, drainPhaseReplaceCount)` only tightens the single-REPLACE case the prior pass found; it
does NOT close the defect when `drainPhaseReplaceCount ≥ surplus`. And that condition is satisfied in
the exact target workload two ways, neither exotic:

1. **The 17-REPLACE ledger spread.** Multiple drain-phase REPLACEs accumulate concurrently (the design's
   own serialization comment cites "4 concurrent REPLACEs on one critical partition"). When
   `drainPhaseReplaceCount ≥ surplus`, `credit = surplus`, so
   `meets_value = occupiedCount` — i.e. the measure **degenerates to `occupiedCount ≥ target`**, the
   precise `occupiedCount`-only form the stale-syncing test refuted. The prior pass's core refutation
   ("degenerates to occupiedCount ≥ target during the multi-REPLACE spread") is NOT escaped; the cap
   merely raised the bar from `credit>0` to `drainPhaseReplaceCount ≥ surplus`, which the spread meets.

2. **A drain-phase REPLACE whose replacement has already promoted to ACTIVE — the NORMAL drain phase.**
   A REPLACE dispatches source-removal (workflow_step ACTIVE/STOPPING) only AFTER its replacement is
   voter-ready, i.e. the replacement is ALREADY an ACTIVE row in `activeCount`. During the STOPPING
   reconciliation window (up to `removingTimeoutMs`=60 s, the very window this quest is about), the op
   still counts in `drainPhaseReplaceCount` while its contribution is ALREADY in `activeCount` →
   **the op is double-counted**, and its count-slot credits an unrelated stale/mis-spread surplus row.
   No frozen cache required; the run-28 frozen-cache ghost merely widens the window to ~60 s.

**Concrete tuple — (active=2 / occupied=3 / inFlightAdd=0 / drainPhaseReplaceCount=1 / target=3).**
Priority ledger partition `replica_operations-*`, targetNodes=[n1,n2,n3]:
- n1: r1 ACTIVE (genuine voter).
- n2: r_x ACTIVE — the replacement of drain-phase REPLACE op-X, already PROMOTED to voter; op-X's source
  was removed (row gone). op-X is net-neutral and already reflected in activeCount.
- n1: r_stale SYNCING — a stuck learner with no driving op (the exact shape the existing
  "stale syncing replicas without in-flight operations" test codifies as real and persistent).
- n3: EMPTY — a genuine 3rd-voter deficit (count/spread).
- op-X lingers STOPPING in the cache (reconciliation window / run-28 ghost) → `drainPhaseReplaceCount=1`.

Trace of `calculateMoves`:
1. addMoves: n3 currentCount 0 < target 1 → **1 INCREASE_REPLICA_COUNT ADD on n3**.
2. over-creation cap (:385): activeCount 2 > 3? no → silent.
3. candidateRemoves: `replicasByNode` is ACTIVE-only → n1=[r1] excess 0, n2=[r_x] excess 0, n3 none →
   **no removes** (r_stale is SYNCING, never a remove candidate). replaceMoves stays empty.
4. `activeCount`=2, `occupiedCount`=3, `inFlightAddCount`=0 → surplus = 3−2−0 = 1;
   `drainPhaseReplaceCount`=1 → `credit = min(1,1) = 1`;
   `deficitEffectiveCount`=2 → `meets = 2+1 = 3 ≥ 3` → **TRUE**.
5. reconcile guard (:671): addMoves 1>0, replaceMoves empty, meets true → **n3 ADD dropped**.
6. Result: **no moves.** n3 never gets a voter. The critical ledger sits at **2 voters, target 3**, for
   the whole reconciliation/ghost window — an UNDER-replicated control-plane partition (reduced fault
   tolerance), the opposite of run-28's over-target but the same "moved no live observable" trap.

The credit wrongly attributed `r_stale` to op-X even though op-X's real replacement `r_x` is already an
ACTIVE voter counted in `deficitEffectiveCount`. This defeats the design's stated safety
("never toward starving a real deficit"): it over-counts occupancy using a row that will never become a
voter, backed by a REPLACE whose contribution is already booked elsewhere.

**Scaled version (spread workload) — (active=2 / occupied=4 / inFlightAdd=0 / drainPhaseReplaceCount=2 /
target=3):** n1 r1 ACTIVE, n2 r_x ACTIVE, n1 rs1 + rs2 SYNCING (two stuck learners), n3 empty, two
drain-phase REPLACEs (ghosts or already-promoted-replacement). surplus=2, credit=min(2,2)=2,
meets=2+2=4≥3 → suppress the n3 deficit ADD. Same starvation, satisfied by the ordinary multi-REPLACE
spread.

**Required fix (blocks ship):** row-link the credit. Count only occupied (non-active) rows whose
`replica_id` matches an in-flight drain-phase REPLACE's **target/replacement** replica_id (never the
source), instead of crediting an unattributed surplus by count. Equivalently, subtract from the surplus
any drain-phase REPLACE whose replacement is already ACTIVE (its contribution is in `activeCount`) before
capping. This is the same "row-link the liveness gate" fix the prior pass demanded — still not implemented;
the numeric cap is a count-only proxy for a row-identity fact.

---

## Attack 2 — UNDER-SUPPRESSION.  Verdict: RISK (unchanged from prior pass)

- **String form/case: CLOSED.** `isReplaceRemoveDispatchPhase` normalizes type and workflow_step to
  uppercase and reads both snake/camel fields; ACTIVE/STOPPING reliably matched. A drain-phase REPLACE is
  not missed on form grounds.
- **SYNCING learner in occupiedCount: CLOSED.** `OCCUPIED_STATUSES` includes SYNCING; the materialized
  replacement is counted, so the headline run-28 state (2/3/0/1) → surplus 1, credit 1, meets 3 →
  suppress ✓.
- **Underflow: not harmful.** `max(0, occupied - active - inFlightAdd)` clamps to 0 when in-flight ADDs
  dominate; that only *reduces* the credit → ADD fires → errs toward the (safe) deficit-fill direction,
  never toward over-suppression. In the run-28 blind-spot state inFlightAddCount=0, so no clamp.
- **Pre-materialization window (RISK, still open).** Tuple (active=2 / occupied=2 / inFlightAdd=0 /
  drainPhaseReplaceCount=1 / target=3): surplus 0, credit 0, meets 2<3 → ADD NOT suppressed. This is the
  SAME tuple the serialization test pins to "must ADD" (genuine deficit fill while a REPLACE drains), yet
  it is also the sub-tick pre-materialization of the run-28 over-target state (replacement row not yet
  written). If the ADD fires here and then the REPLACE replacement materializes+promotes, the partition
  transiently reaches 4 voters (the over-target defect, shifted one tick earlier). Counts alone cannot
  distinguish the two; the over-creation cap (activeCount>target) recovers it next tick. Inherent tension —
  RISK, not a clean MUST-FIX, and consistent with the design's accepted case table.

---

## Attack 3 — DOUBLE-COUNT.  Verdict: CORRECT

Mixed state, target=3: n1 r1 ACTIVE; ADD op creating a learner r_add SYNCING (materialized, n2);
drain-phase REPLACE op-X replacement r_x SYNCING (n3, source removed).
- occupiedCount=3 (r1,r_add,r_x); activeCount=1.
- inFlightAddCount: r_add's ADD op — its replica_id row is materialized/occupied → **excluded** (:136-138)
  → inFlightAddCount=0. So a materialized ADD learner is counted once (via occupiedCount), never twice.
- op-X is drain-phase → EXCLUDED from `getEntityTopologyBlockingInFlightOperations()` → contributes 0 to
  `inFlightReplaceInCreationCount`; it appears only in the drain-INCLUSIVE `entityInFlightOperations`
  used for `drainPhaseReplaceCount`. No REPLACE row is counted in both accountings.
- surplus = 3−1−0 = 2; credit = min(2,1) = 1; deficit 1 → meets = 2 < 3 → ADD fires.

No single row is counted in both `deficitEffectiveCount` and the credit: `deficitEffectiveCount` counts
ACTIVE rows + un-materialized ADD ops; the credit counts (occupied − active − un-materialized-ADD) capped
by drain-phase REPLACE count. The two terms partition the rows. A materialized ADD learner can be
absorbed into the drain-phase credit's cap slot, but that only *increases* suppression of a genuine future
voter (a real ADD learner IS a future voter), so it is not a harmful over-count. No double-count defect.
(The harmful over-count is the STALE-row case — attack 1, not this.)

---

## Attack 4 — NON-PRIORITY partitions.  Verdict: CORRECT

`entityInFlightOperations = criticalControlPlanePartition ? getEntityInFlightOperations() : []` (:331-333).
For a non-critical partition it is `[]` ⇒ `inFlightReplaceCredit=0`, `drainPhaseReplaceCount=0` ⇒
`drainPhaseReplacementCredit = min(surplus, 0) = 0` ⇒ `meetsReplicaCountTarget` reduces to
`deficitEffectiveCount >= targetReplicaCount` — **byte-identical** to the pre-change guard for every user
partition. `isControlPlanePriorityPartition()` resolves purely by table_id against the fixed 5-table set;
no user partition flips priority. Confirmed. (Minor, non-behavioral: for critical partitions the
`getEntityInFlightOperations()` cache read is now hoisted to run every tick rather than only inside the
replace-pairing block — one extra cache filter per tick, no semantic change.)

---

## Attack 5 — serialization cap unchanged.  Verdict: CORRECT

Working-tree diff confirms: the cap's `inFlightReplaceCount` was inlined
`serializeCriticalReplace ? getEntityInFlightOperations().filter(type===REPLACE).length : 0` and is now
`const inFlightReplaceCount = inFlightReplaceCredit`, where
`inFlightReplaceCredit = criticalControlPlanePartition ? getEntityInFlightOperations().filter(type===REPLACE).length : 0`.
Because `criticalControlPlanePartition === serializeCriticalReplace === isControlPlanePriorityPartition()`
and the type filter (`String(type|operation_type|operationType).toLowerCase() === 'replace'`) is
byte-identical, **the all-phase REPLACE count feeding the serialization cap is unchanged.** Only the guard
CONDITION that consumes it changed (`deficitEffectiveCount >= target` → `meetsReplicaCountTarget`), which
is the attack-1 surface, not the cap value.

---

## Overall: **FIX-THEN-SHIP**

The corrected form closes the prior pass's *single-REPLACE* starvation and keeps attacks 2(headline),3,4,5
sound. But it does **not** close the prior pass's core refutation: whenever `drainPhaseReplaceCount ≥
surplus` — satisfied by the ordinary multi-REPLACE ledger spread AND by any drain-phase REPLACE in its
(normal, up-to-60 s) STOPPING reconciliation window whose replacement already promoted to ACTIVE — the
measure degenerates to `occupiedCount ≥ target` and credits STALE / already-booked rows, starving a
genuine under-target/mis-spread deficit on the critical control-plane partition. The credit is a count-only
proxy for a row-identity fact it never checks. This is the third real bug; the prior two passes' prediction
holds.

### Required fixes
1. **(Blocks ship) Row-link the drain-phase credit.** Credit only occupied non-active rows whose
   `replica_id` equals an in-flight drain-phase REPLACE's **target/replacement** replica_id. Do not credit
   an unattributed surplus by count. Equivalently: exclude from the credit any drain-phase REPLACE whose
   replacement is already ACTIVE (already in `activeCount`) — its contribution must not be counted twice.
2. **(Blocks ship) DT for the priority-partition starvation.** Priority partition, target=3: r1 ACTIVE +
   the already-promoted replacement r_x ACTIVE + one stuck SYNCING stale row + n3 empty + one drain-phase
   REPLACE lingering STOPPING → assert the n3 deficit ADD STILL fires (RED on current code, GREEN after
   fix 1). Add the scaled 2-stale / 2-REPLACE variant. This is the priority analogue the existing
   non-priority stale-syncing test omits — the same DT the prior pass asked for, still missing.
3. **(Lower priority) Pre-materialization / serialization-test tension (attack 2).** Document or DT the
   (2/2/1) tuple so the "must-ADD deficit fill" vs "must-suppress run-28 pre-materialization"
   interpretations are pinned deliberately, not by accident of which test ran last.
4. **(Lower priority) Provider-fallback note.** If a provider lacks `getInFlightOperations`,
   `getEntityInFlightOperations` falls back to the drain-EXCLUSIVE set → `drainPhaseReplaceCount`=0 → the
   credit silently no-ops. Production implements it; flag so the drain-inclusive credit cannot silently
   read a drain-exclusive count in a mock.
