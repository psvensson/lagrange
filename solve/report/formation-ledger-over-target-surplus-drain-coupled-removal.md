# Solve report: formation-ledger-over-target-surplus-drain-coupled-removal

**Goal:** SEALED RESULT (what the DT oracle measures): the durable over-target voter SURPLUS on a cold-formation control-plane ledger partition (canonically replica_operations-p1: totalVoters=4 > target=3, voters spread ~2/1/1 so flagged concentrated purely by overTarget with feasibleTarget=null, ZERO corrective REMOVE) DRAINS to target (4->3) during cold formation AND the dependent-op operation_ledger_quorum_concentrated deferrals collapse, reproduced deterministically. This is the necessary-not-sufficient gap left by the Part-1 raft_role over-creation cap (bf535665) and the s14 orphan-census (1ff668b8): those STOP new stacking / break the stuck-at-2 formation deadlock, but NEITHER drains an already-established surplus, whose 4th voter is minted by the uncapped REPLACE add-leg (the over-creation cap zeroes only addMoves, move-planner-move-calculation-methods.js:370). RUNG 1 (mandatory, DT-first, discovery never on live demo) must reproduce the durable surplus deterministically AND confirm WHICH drain-blocking layer is live for THIS gate under the post-Part-1/post-orphan-census state. LEADING HYPOTHESIS (plan-doc disk-confirmed for replica_operations-p1 across 3 runs): (i) dispatch-level CL-043 concurrent-op serialization (operation-workflow-remove-safety-evaluator.js:378-412 'concurrent partition operation is active'; its persist-failed staleness escape does NOT cover the over-target surplus-drain case) = the s14 phase2-synthesis Alt-3a lever. Retained as FALSIFIERS to re-confirm (each was the blocker on a DIFFERENT partition/run, not replica_operations-p1 — Trap-6): (ii) admission-level remove-lane rejection (rebalance-coordinator-priority-budget-admission.js ensureNoConflictingInFlightReplaceForRemove:461 / ensurePriorityControlPlaneRemoveLaneAvailable:572) = the SOLVED formation-voter-surplus quest's 'REMOVE never reaches dispatch' path on sql_write_operations-p1; (iii) no corrective REMOVE ever planned (move-planner skips surplus REMOVE for a replica with a pending move, move-planner-move-calculation-methods.js:392). The fix drains the surplus by COUPLING removal to the existing over-count REPLACE at whichever layer is confirmed live (app-tier approximation of joint-consensus atomic replace; liferaft has NO log-replicated membership so real ConfChangeV2 is out of scope), preserving the quorum floor (projectQuorumAfterRemoval >= minReplicaCount, SATISFIED at 4->3/min3 so the drain is SAFE) and NOT weakening run-20/22 serialization safety, NOT raising any timeout/budget (TEST-0021), NOT re-permitting two concurrent membership changes on the partition, NOT a standalone-drain pass (vetted-dead + industry-wrong), NOT Alt-3b learner-until-drained (structurally blocked by min-replica floor + source-leader handoff), NOT joint consensus in raft (long-horizon epic). doneWhen (machine oracle) = a deterministic in-process reproduction red-on-reverts the drain fix AND the surplus drains 4->3 with operation_ledger_quorum_concentrated deferrals collapsing, reproduced by scenario-harness 3x consecutive. LIVE-VALIDATION SIGNAL (necessary-not-sufficient, NOT part of the seal): a 2-pre/2-post affinity-demo A/B shows the control plane settles and [2/4] ratings load completes with NO interlock/progress-write amplification. [2/4] can still fail on a SEPARATE axis after a perfect drain — the loader's OWN 30s admin client (examples/movielens-access-affinity/lagrange-loader.js:23, NOT the demo's 15s main client at run-affinity-demo.js:142) timing out on a ~90s provisioning re-wait; that client-deadline-vs-provisioning-budget mismatch is a distinct follow-on quest — so [2/4] completion is a validation signal, never a closure condition.

**Class:** product · **Closure:** MEASURED

**Outcome:** EXHAUSTED — 1 frontier(s) parked; human decision needed

**Attempts:** 0

## Links
- parent quest: formation-ledger-self-move-blocks-cluster-ops
- plan: solve/changes/voter-ready-60s-promotion-timeout/phase2-path-research-synthesis.md

## Current Blocker
- Frontier: formation-ledger-over-target-surplus-drain-coupled-removal-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for formation-ledger-over-target-surplus-drain-coupled-removal-main
- No longer current: Alt-3a CL-043 concurrent-op serialization relaxation (== reverted CL-045); standalone-drain; app-tier coupled removal at the serialization layer

## Continuation
- Status: allowed
- Next action: No open frontier remains; inspect solve report.
- Blocker: none

## Scope Pressure
- Changed files: 0
- Owner areas: none
- Categories: none
- Signals: none

## Frontiers
- **formation-ledger-over-target-surplus-drain-coupled-removal-main** [parked {exhausted}] rung 0, attempts 0, metric ? -> ? — Operator EXHAUST-AND-PIVOT (2026-07-09 decision, recorded in the altitude reflection): RUNG-1 (43c9c9-era finding, evidence solve/changes/formation-ledger-over-target-surplus-drain-coupled-removal/rung1-lever-exonerated-cl045-retread.md) refuted the quest frame — the CL-043 serialization lever is the already-reverted CL-045 (20 of ~345 blocks, non-binding), and the sealed premise 'floor satisfied at 4->3/min3 so drain is safe' is false live (floor counts voter-READY 3->2<min3, not raft-voters). No honest coupled-removal move exists within this app-tier-serialization class; the readiness/concentration root is a different owner boundary, pursued by the successor lineage (formation-ledger-quorum-concentrated-replace-churn-60s).

## Findings
- **formation-ledger-over-target-surplus-drain-coupled-removal-main**: RUNG-1 EXONERATES the framed lever: relaxing the CL-043 concurrent-op serialization so the REPLACE remove-leg drains the surplus (Alt-3a) is functionally identical to the already-shipped-and-REVERTED CL-045. Re-derived independently, red-on-revert-proven on the REAL evaluateRemoveSafety, then discarded. Live A/B refuted CL-045 (fired 0/0/1; concurrent-op gate is 20 of ~345 blocks). The binding blockers are the promotion guard would_exceed_target (345) and the drain floor would-drop-voter-ready-below-minimum 2/3 (318), BOTH correctly waiting on a 4th raft-voter that never reaches voter-ready-routable within 60s. The quest premise 'floor satisfied at 4->3/min3 so drain is safe' is false live: the floor uses voter-READY count (3->2<min3), not raft-voter count (4->3) = the s13 read-disagreement. Adversarial vet also found the naive lever unsafe (re-permits two concurrent membership changes, trips quorum-conditioned-remove-safety:243, violates c-vet). REAL root = replica voter-ready-routability (isVoterReadyRoutableReplica / cluster-member-health / lease / catch-up; readiness/hysteresis domain), OUT of this quest's app-tier-coupled-removal class. (rules out: Alt-3a CL-043 concurrent-op serialization relaxation (== reverted CL-045); standalone-drain; app-tier coupled removal at the serialization layer) [solve/changes/formation-ledger-over-target-surplus-drain-coupled-removal/rung1-lever-exonerated-cl045-retread.md]
- **formation-ledger-over-target-surplus-drain-coupled-removal-main**: Citation correction to the operator park reason: the RUNG-1 exoneration commit is 43f2596c (the park reason garbled it as '43c9c9-era'); the evidence path solve/changes/formation-ledger-over-target-surplus-drain-coupled-removal/rung1-lever-exonerated-cl045-retread.md is correct and unchanged.

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
