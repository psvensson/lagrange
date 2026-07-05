# Research: PLANNER spread-completion defect (operation-ledger over-target + concentrated deadlock)

Scope: forensics for a successor quest. READ-ONLY. Evidence = run-28 node logs
(`solve/changes/formation-ledger-post-spread-voter-visibility-latency/run28-node-logs/node-{0..4}.log.gz`,
gzipped NDJSON) + `src/`. Node id map (from logs):

| node | id (prefix) | role in run-28 |
| --- | --- | --- |
| node-0 | `36f4e509` | seed; bootstrapped 3 op-ledger replicas; rebalancer leader ONLY during formation (to 16:24:50) |
| node-1 | `59ee7466` | op-2 ADD target (r5); a spread target |
| node-2 | `a0d0c2e6` | EMPTY of ledger replicas; a spread target |
| node-3 | `d57be316` | op-1 REPLACE target (r4/r1); **holds the replica_operations-p1 rebalancer in steady state** |
| node-4 | `cdbd94e7` | appears in strict node set; EMPTY of ledger replicas |

> NOTE (correction to the established framing): the established brief attributes the
> steady-state stall to node-0's planner "repeatedly logging Deferring spread-driven
> count-increasing ADD … ~62 times" for the operation ledger. The logs show that DEFER
> message fires for `replica_operations-p1` **exactly ONCE**, at 16:24:34 on node-0 during
> FORMATION, before node-0 lost the ledger-rebalancer role. The ~62 repeats are for OTHER
> critical partitions (`control_plane_publications-p1`, etc.). In the STEADY-STATE window
> (16:24:51–16:25:49) the `replica_operations-p1` rebalancer runs on **node-3**, and it does
> **NOT** defer an ADD — it repeatedly plans the CORRECT count-neutral REPLACE of a seed
> replica onto an empty node, and that REPLACE is **blocked at admission**. The real
> steady-state defect is therefore an ADMISSION INTERLOCK DEADLOCK, not a move-selection
> defect. Both layers are documented below.

---

## 1. THE MOVE-SELECTION behaviour (and why it is NOT the steady-state defect)

**Emitting code for the DEFER message.** Constant `DEFER_ADD_OVER_TARGET` =
`src/rebalancer/rebalancer-constants.js:167-168`. Emitted from the move planner
`calculateMoves` body in `src/rebalancer/move-planner-move-calculation-methods.js`
at two sites: `:570` (replace-serialization-cap branch) and `:635` (spread-vs-count
reconcile branch).

**(a) How the spread-relief move is chosen.** In `move-planner-move-calculation-methods.js`:
- ADD moves are generated first for under-represented target nodes (`:297-303`, reason
  `INCREASE_REPLICA_COUNT`).
- REMOVE candidates are generated per node with `excess = currentCount - targetCount`
  (`:357-466`); a seed node holding 2 replicas at spread-target 1 yields ONE candidate
  REMOVE with reason `SPREAD_REPLICAS` (`:378-381`).
- ADD+REMOVE are then fused into a count-neutral REPLACE in the block at `:483-553`:
  `naturalReplaceCount = min(addMoves.length, replaceCandidates.length)` (`:503-506`),
  each pairing shifts one ADD target onto one drained source (`:542-552`).

**(b) Why the FORMATION tick logged a deferred ADD instead of a REPLACE.** The
one-time 16:24:34 DEFER on node-0 is the REPLACE-SERIALIZATION CAP at `:507-540`:
```
serializeCriticalReplace = isControlPlanePriorityPartition()            // true
inFlightReplaceCount = <all-phase in-flight REPLACEs on this partition>  // :524-534
replaceCount = min(naturalReplaceCount, max(0, 1 - inFlightReplaceCount))// :535-540
```
Observed field values (node-0, 16:24:34.704, `replica_operations-p1`):
`inFlightReplaceCount:0, naturalReplaceCount:3, replaceCount:1, deferredAddCount:2`.
So the cap let ONE REPLACE through (op-1: r1 seed→node-3) and deferred the remaining
2 spread ADDs (`:560-582`: only when `deficitEffectiveCount >= targetReplicaCount`,
so genuine deficit fill is never blocked). This is correct run-20/run-22 behaviour,
NOT the bug.

**(c) The "no count-neutral REPLACE pairing" condition.** It is the residual after the
cap: `replaceCount < naturalReplaceCount` (`:562`) leaves ADD moves that could not be
fused into a REPLACE this tick, and they are dropped rather than emitted as
count-increasing ADDs (`:565-580`). The pairing it "cannot form" is simply the SECOND+
REPLACE this tick — deliberately serialized to next tick.

**(d) Steady-state move-selection is CORRECT — the REPLACE IS chosen.** On node-3, the
ledger rebalancer plans the count-neutral REPLACE of a seed replica onto an empty node
**17 times** across 16:24:51–16:25:49 (`Executing rebalancing move`,
`entityId:replica_operations-p1`):
```
moveType:replace  moveReplicaId:replica_operations-p1-r3
moveSourceNodeId:36f4e509 (SEED)  moveTargetNodeId:59ee7466 (node-1) ×9
                                  moveTargetNodeId:a0d0c2e6 (node-2, EMPTY) ×8
reason:replace_replica
```
There are ZERO `Deferring spread-driven` logs for `replica_operations-p1` on node-3.
So question 1's premise ("selects a count-increasing ADD instead of a REPLACE") does
NOT hold at steady state: the planner selects exactly the right count-neutral REPLACE.

**Drain/REMOVE path for over-target concentrated ledger.** A standalone REMOVE of a
seed replica exists in principle (`candidateRemoves` → `toExecutableRemove`, pushed at
`:583-593`/`:610`), but here the drained candidate is CONSUMED into the REPLACE
(`consumedRemoveReplicaIds`, `:541-552`, `:588`), so no standalone REMOVE is emitted —
the planner prefers the count-neutral REPLACE (which also spreads). That is the correct
choice; the problem is that the REPLACE never ADMITS (section 3).

---

## 2. HOW THE LEDGER REACHED OVER-TARGET (op-2 = ADD, not a 2nd REPLACE)

Timeline (node-0 unless noted):
- 16:24:34.858 op-1 REPLACE minted: r1 seed(36f4e509)→node-3(d57be316), `reason:replace_replica`.
- 16:24:50.560–50.680 op-1 source removal + `Operation completed` (opId `084ad886`).
- 16:24:50.835 concentration snapshot: `totalVoters:2, maxVotersOnOneNode:2,
  hottestNodeId:seed, overTarget:false, spreadActionable:true`.
  **Only 2 voters visible** — the op-1 replacement replica on node-3 has NOT yet promoted
  from learner to voter (the voter-visibility latency). So committed-voter accounting shows
  the ledger UNDER target (2 < 3).
- ~16:24:51 op-2 ADD minted: r5 → node-1 (`59ee7466`), count-increasing.
- 16:25:20.839 concentration snapshot: `totalVoters:4, maxVotersOnOneNode:2, overTarget:true`.

**Why op-2 was an ADD, not a 2nd REPLACE.** The count-increasing-ADD deferral guards all
gate on `inFlightAccounting.deficitEffectiveCount >= targetReplicaCount`
(`move-planner-move-calculation-methods.js:563`, `:628`) and the over-creation cap gates on
`inFlightAccounting.activeCount > targetReplicaCount` (`:333`). At the op-2 planning moment
the replacement voter was still a learner, so the committed/effective voter count read as 2
(< target 3) → **deficit-fill path is exempt from the deferral** (by design: "genuine
under-target ADDs are unaffected", `:558-559`, `:621`). The planner filled the apparent
deficit with a count-increasing ADD (r5). When the lagging replacement then promoted to
voter, the ledger jumped to 4 voters → permanently over target AND still 2-on-seed
concentrated. This is a voter-visibility/accounting race feeding the count planner a stale
under-target reading — the same lineage as the "read committed voters, not learners" gap.
(The replace-serialization cap at `:535-540` also contributes: with op-1's REPLACE counted
in-flight, `replaceCount` capped to 0 for a concurrent 2nd REPLACE, so the still-needed
second spread move could only surface later — and by then it surfaces as the admission-
blocked self-move REPLACE of section 3, never as a 2nd REPLACE at op-2 time.)

---

## 3. THE ACTUAL STEADY-STATE DEFECT: self-move admission-interlock DEADLOCK

The 17 correct spread REPLACEs on node-3 are ALL skipped at admission (`Rebalancing move
skipped`, `entityId:replica_operations-p1`, `moveReplicaId:replica_operations-p1-r3`):
```
reason:"budget_exceeded"  admissionDecisionType:"deferred"
admissionReason:"operation_ledger_self_move_waiting_for_idle_ledger"   (×17)
```
Interlock source: `src/rebalancer/rebalance-coordinator-ledger-interlock-admission.js`.

- `isDisruptiveOperationLedgerSelfMove` (`:64-69`): a REPLACE/REMOVE of a
  `replica_operations` partition is a "disruptive self-move".
- `ensureOperationLedgerSelfMoveSerialized` (`:129-220`): for a disruptive self-move it
  admits ONLY when `liveOperations` is empty (`:160-171`); any single live incomplete
  operation → throw `OPERATION_LEDGER_SELF_MOVE_WAITING_REASON_CODE`
  (`operation_ledger_self_move_waiting_for_idle_ledger`, constant `:35-36`).
- `liveOperations` = observed incomplete operation rows minus the current op, filtered by
  `isLiveOperationLedgerInterlockOperation` (non-terminal AND not stale-past-step-timeout,
  `:83-97`, `:154-158`).
- ADD is exempt as spread/quorum-restore recovery (`:114-116`, `:136-141`) — this is the
  CL-013 exemption the prompt flagged: spread recovery is exempt only in its ADD form.

**The circular dependency (steady-state variant of the formation interlock):**
1. The ledger is over-target + concentrated (2 voters on seed).
2. Dependent operations (the CREATE TABLE partition provisioning for
   `tbl-b4df092c-…-p1`, and the `control_plane_publications-p1` self-move) are DEFERRED at
   admission with `operation_ledger_quorum_concentrated` — they are waiting for the ledger
   to spread (`ensureOperationLedgerQuorumSpreadFirst`, `:233-256`; admission-probe rejections
   in the run-28 sql-query-engine logs at 16:25:29 / 16:25:49).
3. The CURE — the ledger's own spread REPLACE self-move — is blocked because those very
   dependent/other operations register as live incomplete operations → `liveOperations`
   non-empty → `waiting_for_idle_ledger` (`:160-171`).
4. Neither side clears: spread-self-move waits for an idle ledger; the ledger cannot idle
   because the dependent op is parked waiting for the spread. → CREATE TABLE exhausts its
   30 s provisioning budget (`Insufficient admissible provisioning targets`, level 50,
   16:25:49.530) and the demo tears down (mass rebalancer shutdown 16:25:49–50).

**Run-20/22 interaction (question 3).** The serialization cap
(`move-planner-move-calculation-methods.js:535-540`) only DEFERS the second REPLACE per
tick — it re-offers it next tick (proven by the 17 re-plans on node-3). The permanent
suppression is NOT the cap; it is the admission interlock (`:160-171`). And the ADD-exempt
carve-out (`:114-116`) is exactly the crux the prompt predicted: spread recovery is exempt
only AS AN ADD, but an ADD is count-increasing and over-target it is then deferred by the
move planner (`:333`, `:563`), while the count-NEUTRAL REPLACE that would actually cure
concentration is NOT exempt and is blocked by `waiting_for_idle_ledger`. Net: the exempt
form can't help (over-target) and the helpful form isn't exempt → deadlock.

**Identity of the blocking "live operation" (refinement).** Cluster-wide only TWO
operations are ever created in the window — op-1 REPLACE (`084ad886`) and op-2 ADD
(`8e47ecf6`) — and BOTH reach `Operation completed` (op-2 at 16:24:52.150). So the
self-move is NOT blocked by a genuinely open dependent operation. The `liveOperations`
set is built from `queryIncompleteOperations()`
(`rebalance-coordinator-operation-read-methods.js:41`,
`replica-operation-repository-incomplete-read-methods.js:275`), whose SQL
(`SELECT_INCOMPLETE_OPERATIONS`, bound at `:299-311`) returns EVERY replica_operations
row still in a non-terminal workflow step (`PENDING/SENDING/CREATING/SYNCING/STOPPING/
ACTIVE`, plus in-flight `REPLACE`). Node-3 became the ledger rebalancer leader only at
16:24:50.685, immediately after op-1's source-drain (a second `Handling REMOVE_REPLICA
request` for the seed r1 fires at 16:24:50.885) and op-2's dispatch churn (op-2 shows
`Cache/authoritative divergence`, `Deferred replica operation dispatch`, reservation
create/release 16:24:51–52). The blocker is therefore a LINGERING NON-TERMINAL
replica_operations ROW (drain/reconfiguration/reservation bookkeeping) that node-3's
owner-scoped incomplete read still sees as live — never `isConcurrentOperationStalePast
StepTimeout` (so the CL-043 staleness exclusion at `:87-95` does not release it). That
lagging row keeps the ledger perpetually "non-idle," so the disruptive self-move REPLACE
is rejected `waiting_for_idle_ledger` every one of its 17 attempts. (This exact row was
not isolable from the logs — an open item for the quest to pin via the DT substrate.)

---

## 4. FIX SHAPE (REUSED / EXTENDED / NEW — no implementation)

The steady-state defect is the **self-move admission interlock**, not move selection.
Options, honest trade-offs:

**(a) [EXTENDED — smallest] Relax the disruptive-self-move "idle ledger" gate to ignore
its OWN lagging bookkeeping rows / count live operations by DISTINCT dependent work, not
raw non-terminal rows.** REUSES `ensureOperationLedgerSelfMoveSerialized`
(`rebalance-coordinator-ledger-interlock-admission.js:160-171`) and the CL-043 staleness
predicate (`:83-97`). The gate must exclude (i) rows belonging to the ledger partition's
own just-completed self-move drain, and (ii) rows that are themselves parked ONLY because
the ledger is concentrated (dependents deferred at `:233-256`) — those are not real
contenders, they are the thing the spread will unblock.
RISK: run-20 storm if the exclusion is too broad and a genuinely disruptive dependent
co-admits into a mid-move ledger. Must keep the exclusion narrow (own-partition drain +
concentration-parked dependents only). Base guard proof:
`test/convergence/dt6-rebalancer-formation-self-move-interlock.test.js`.

**(b) [EXTENDED] Give an OVER-TARGET concentrated ledger a count-DECREASING drain REMOVE
that is exempt like the quorum-restore ADD.** The concentration evaluator already computes
`overTarget` and `feasibleTargetNodeId`
(`operation-ledger-quorum-concentration.js:145-154`) but nothing consumes `overTarget` to
plan a REMOVE. A standalone REMOVE of a seed replica (down to target 3, spreading in one
move) is the semantically-correct move when over target. REUSES the candidate-REMOVE path
(`move-planner-move-calculation-methods.js:357-466`) + the ADD-exempt carve-out pattern
(`ledger-interlock-admission.js:114-116,136-141`) extended to a count-reducing REMOVE.
RISK: a REMOVE is also a disruptive self-move (run-20) — it must serialize; and exempting
a REMOVE from the idle-ledger gate is a stronger carve-out than the ADD exemption, so it
must be tightly scoped to `overTarget && concentrated && spreadActionable` to avoid
draining below quorum. This is the cleaner fix because it removes the over-target state
(the count planner's stale-under-target ADD in §2 is the root of over-target).

**(c) [EXTENDED — root-cause of §2] Fix the count planner to read committed VOTERS not
learners, so op-2 never fires the spurious count-increasing ADD.** REUSES
`computeInFlightAwareReplicaAccounting` (`move-planner-move-calculation-methods.js:312-316`)
— have `deficitEffectiveCount`/`activeCount` count the in-flight REPLACE's replacement
replica so the ledger is not seen as under-target while its replacement is a learner. If
op-2 stays a REPLACE (or is withheld), the ledger never goes over target and options (a)/(b)
are unnecessary. RISK: the run-22 voter-visibility latency is real — undercounting the
replacement risks a genuine deficit going unfilled; must distinguish "learner that WILL
promote" from "no replica." Overlaps the sibling voter-visibility quest.

**(d) [NEW — largest, discouraged] Plan the full 2-move serialized-REPLACE spread as a
single committed plan at op-1 time.** Would need a durable multi-move plan the serialization
cap draws from. RISK: new machinery, formation-circularity surface, run-20 regression;
avoid unless (a)+(c) prove insufficient.

Recommended pairing: **(c) to stop reaching over-target** + **(a) to break the residual
idle-ledger deadlock for the count-neutral REPLACE**. (b) is the fallback if the ledger can
still reach over-target by other races.

---

## 5. SEALED-STATEMENT INGREDIENTS

**Binding observable (proposed):**
> After operation-ledger bootstrap concentrates all replicas on the seed, the rebalancer
> drives `replica_operations-p1` to **≤1 voter per node at steady state within N s of
> formation** (no node holds a majority; not over `targetReplicaCount`), such that the
> quorum-concentration admission hold releases and a post-formation CREATE TABLE completes
> within its 30 s provisioning budget. Concretely: `evaluateOperationLedgerQuorumConcentration`
> reports `holdEngaged:false` (neither concentrated nor overTarget) and zero
> `operation_ledger_self_move_waiting_for_idle_ledger` / `operation_ledger_quorum_concentrated`
> admission rejections persist past N s.

Measured head-state to beat (run-28): ledger wedges at 4 voters / 2-on-seed
(overTarget+concentrated); 17 correct spread REPLACEs rejected `waiting_for_idle_ledger`;
CREATE TABLE fails `Insufficient admissible provisioning targets` at 16:25:49.530 after its
budget. RED on head.

**DT-substrate repro seam.** Base: `test/convergence/dt6-formation-ledger-quorum-spread-first.test.js`
(already models bootstrap-3-on-seed → run-22 spread → dependent hold; case at `:571` asserts
"both spreads run alone"; fault model at `:275-419`). The base test lets the spread REPLACEs
"run alone"; run-28 shows the SECOND spread cannot, because the ledger is OVER TARGET and a
lingering non-terminal ledger row keeps it non-idle so the disruptive self-move REPLACE is
`waiting_for_idle_ledger`. Extend the fixture to the run-28 shape:
- start `initialLedgerRows` at **4 voters, 2 on seed** (over target 3), i.e. after op-1
  REPLACE + op-2's spurious count-increasing ADD;
- hold ONE lingering non-terminal replica_operations row (or a concentration-parked
  dependent) present so `queryIncompleteOperations()` is non-empty;
- drive the planner and ASSERT it completes the spread — emits AND ADMITS a count-neutral
  seed→empty REPLACE (or a count-reducing drain REMOVE) so the ledger reaches ≤1 voter/node
  and `holdEngaged` clears — instead of parking every self-move on `waiting_for_idle_ledger`.
- Cross-check against the interlock's own DT
  (`test/convergence/dt6-rebalancer-formation-self-move-interlock.test.js`) so the fix does
  not let a genuinely disruptive co-scheduled operation slip the run-20 serialization.

Assert RED on head (self-move never admits; ledger stays overTarget+concentrated), GREEN
after the fix.
