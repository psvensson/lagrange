# Solve report: formation-ledger-spread-completion-self-move-interlock-deadlock

**Goal:** The operation-ledger (replica_operations-p1) COMPLETES its post-formation spread — reaching <=1 voter per node at steady state (no node holds a majority; not over targetReplicaCount) so the quorum-concentration admission hold releases and a post-formation CREATE TABLE succeeds within its existing 30s provisioning budget on the 5-node MovieLens demo. Two coupled defects keep it wedged (run-28 forensics, logs archived solve/changes/formation-ledger-post-spread-voter-visibility-latency/run28-node-logs/, report research-planner-spread-completion-defect.md): (1) OVER-TARGET ROOT — bootstrap concentrates 3 ledger replicas on the seed; op-1 (REPLACE seed->node) fires correctly, but the SECOND spread move is minted as a count-INCREASING ADD (op-2) instead of a count-neutral REPLACE because at op-2 planning time op-1's replacement is still a LEARNER, so committed-voter accounting (computeInFlightAwareReplicaAccounting deficitEffectiveCount, move-planner-move-calculation-methods.js:312-316/:563) reads the ledger UNDER target (2<3) and exempts a deficit-fill ADD from the over-target guards; when the replacement promotes the ledger jumps to 4 voters -> permanently over-target AND 2-on-seed concentrated. (2) DEADLOCK — the planner then repeatedly (run-28: 17x on node-3) plans the CORRECT count-neutral spread REPLACE (seed replica -> empty node), but EVERY attempt is admission-rejected operation_ledger_self_move_waiting_for_idle_ledger (rebalance-coordinator-ledger-interlock-admission.js:160-171): a disruptive ledger self-move admits ONLY into a fully-idle ledger, but a LINGERING NON-TERMINAL replica_operations row (op-1/op-2 drain/reservation bookkeeping) keeps queryIncompleteOperations() non-empty and never trips the CL-043 stale-past-step-timeout exclusion, so the ledger never idles; meanwhile the dependent CREATE TABLE provisioning and control_plane_publications self-move are parked waiting for the ledger to spread (ensureOperationLedgerQuorumSpreadFirst) — a circular wait the ADD-exempt carve-out (:114-116) cannot break because the exempt form is count-increasing (over-target-deferred) while the curing count-neutral REPLACE is not exempt. Proven by a deterministic DT reproduction of the wedge RED on head (scenario-harness, consecutive 3) and the demo's ratings load progressing past CREATE TABLE in a live run. NO client timeout/budget raises; NO weakening of run-20 disruptive-self-move serialization (a genuinely disruptive co-scheduled operation must still not co-admit into a mid-move ledger) or run-22 spread-first; actuals-only inputs preserved (ARCH-0080/0084).

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/formation-ledger-spread-completion-self-move-interlock-deadlock-2026-07-05T18-20-22-665Z.report.json

**Attempts:** 1

## Links
- parent quest: movielens-affinity-placement-demo

## Current Blocker
- Frontier: formation-ledger-spread-completion-self-move-interlock-deadlock-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for formation-ledger-spread-completion-self-move-interlock-deadlock-main

## Continuation
- Status: allowed
- Next action: No open frontier remains; inspect solve report.
- Blocker: none

## Scope Pressure
- Changed files: 2
- Owner areas: src/rebalancer
- Categories: runtime
- Split plan:
  - src/rebalancer: 2 file(s)
- Signals: none

## Frontiers
- **formation-ledger-spread-completion-self-move-interlock-deadlock-main** [solved] rung 1, attempts 1, metric ? -> 0

## Findings
- **formation-ledger-spread-completion-self-move-interlock-deadlock-main**: Leg A (SOLVED): the run-28 spread deadlock is a CACHE-FIRST stale-ghost read in the disruptive-self-move interlock. After a mid-drain ledger-leadership handoff the new leader's queryIncompleteOperations returns a prior spread self-move (op-1) frozen at STOPPING though it terminalized on the old leader 5ms earlier; the interlock rejects every count-neutral spread REPLACE waiting_for_idle_ledger and the ledger never de-concentrates (CREATE TABLE starves; CL-043's 60s self-heal exceeds the 30s budget). Fix: ensureOperationLedgerSelfMoveSerialized re-verifies a SAME-ledger-partition self-move blocker via a new cache-bypassing owner-RPC read (queryAuthoritativeOperationVisibilityObservation requireOwnerRpcRead) — a bookkeeping-lag ghost (authoritatively terminal) is dropped so the spread admits; a genuine in-flight reconfiguration (authoritatively non-terminal) still blocks (run-20 serialization preserved); dependents/other-partition ops always block. dt:prove red-on-revert; DT proves a cache-first re-verify would be INERT; scenario 3x PASS; rebalancer+convergence green.
- **formation-ledger-spread-completion-self-move-interlock-deadlock-main**: Leg C (over-target accounting) SPLIT to successor formation-ledger-over-target-accounting-drain-phase-replace-blind-spot (P2). THREE adversarial verifications refuted every count-based move-planner approximation of the spurious count-increasing ADD: (a) occupiedCount-only counts stale learners (broke unified-rebalancer-move-calculation-state-evaluation stale-syncing test); (b) deficitEffectiveCount+all-phase-inFlightReplaceCount double-credits a net-neutral REPLACE (broke move-planner-critical-replace-serialization genuine-deficit test); (c) min(occupiedSurplus, drainPhaseReplaceCount) degenerates to occupiedCount>=target across the ~17-REPLACE spread window AND double-counts a drain-phase REPLACE whose replacement already promoted (source-removal dispatches AFTER promotion). Root: the planner's committed-voter read undercounts a promoting-but-not-yet-visible voter — the SAME voter-visibility read-path class the sibling quest 136aebbc addressed on services.raft_role, NOT this count read. Correct fix must be ROW-OP-LINKED or fix the visibility read directly. NOTE the over-target 4th voter is a formation TRANSIENT cleared by the existing over-creation cap (activeCount>target)+surplus drain once voters settle, so it is NOT the demo's binding blocker (leg A is).

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-05T18:21:46.356Z | formation-ledger-spread-completion-self-move-interlock-deadlock-main | observe | ? -> 0 | flat | no_evidence |  | diff:solve/changes/formation-ledger-spread-completion-self-move-interlock-deadlock/fix-leg-a-interlock-ghost-reverify.diff |
