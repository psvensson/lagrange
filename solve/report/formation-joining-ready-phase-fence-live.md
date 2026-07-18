# Solve report: formation-joining-ready-phase-fence-live

**Goal:** One unchanged fresh movielens-lagrange-service-affinity-live run reports priority metric 0; every JOINING node, including READY with fresh liveness, remains absent from generic serving, locally eligible, published-active, required-ack, and remove-safety membership, while an explicitly recovery-eligible reachable JOINING node can receive only priority control-plane formation placement until activation.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 1

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: formation-joining-ready-phase-fence
- plan: solve/epics/topology-convergence-hardening.md

## Current Blocker
- Frontier: formation-joining-ready-phase-fence-live-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: transition_gap
- Movement: narrowed: FAIL -> FAIL
- Latest evidence: test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T11-19-30-426Z.report.json
- Selected theory: none
- Next move: continue supervised step for formation-joining-ready-phase-fence-live-main
- No longer current: FAIL

## Continuation
- Status: allowed
- Next action: continue supervised step for formation-joining-ready-phase-fence-live-main
- Blocker: none

## Scope Pressure
- Changed files: 11
- Change bytes: 35497
- Owner areas: src/bootstrap, src/control-plane, test/bootstrap, test/control-plane, test/rebalancer
- Categories: runtime, test
- Action: split by owner area before the next attempt (11 files)
- Action: land or separate 5 owner areas: src/bootstrap, src/control-plane, test/bootstrap, test/control-plane, test/rebalancer
- Split plan:
  - src/control-plane: 7 file(s)
  - src/bootstrap: 1 file(s)
  - test/bootstrap: 1 file(s)
  - test/control-plane: 1 file(s)
  - test/rebalancer: 1 file(s)
- Signal: broad-source-scope severity=medium
- Signal: large-diff-stack severity=medium

## Frontiers
- **formation-joining-ready-phase-fence-live-main** [open] rung 1, attempts 1, metric 1 -> 1

## Findings
- **formation-joining-ready-phase-fence-live-main**: inherited from formation-joining-ready-phase-fence: inherited from formation-schema-operation-collision-leader-read-closure: The cold-formation barrier withholds only the final ready lease: node registration publishes nodes.status=active earlier, and the unchanged MovieLens scenario starts schema admission after counting those active rows. In the failed run the ledger barrier and priority operations continued after that clock began, so eventual zero spread at T+164 left only about 16 seconds for an unchanged 60-second stability condition. Planner-only reordering and timeout increases are ruled out; the missing contract is a canonical placement-ready or available phase between recovery-eligible registration and schema admission. (rules out: planner-only reordering; timeout increases; treating nodes.status=active as placement-ready) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T07-27-39-737Z.report.json]
- **formation-joining-ready-phase-fence-live-main**: DT red-on-revert proven for test/rebalancer/startup-authority-available-node-contract.test.js [dt:solve/changes/dt-prove/startup-authority-available-node-contract.test.js-2026-07-18T08-45-20-355Z.json]
- **formation-joining-ready-phase-fence-live-main**: Independent verification passed [subagent:formation_barrier_verifier]
- **formation-joining-ready-phase-fence-live-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-18T09-04-17-360Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T09-04-17-360Z.report.json]
- **formation-joining-ready-phase-fence-live-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-18T09-04-17-360Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T09-04-17-360Z.report.json]
- **formation-joining-ready-phase-fence-live-main**: Fresh unchanged live run confirms the JOINING formation repair engages and cluster formation completes, then fails downstream because the background release clock matures from priority-spread clear while four schema-provisioning operations remain in flight; ordinary work releases after only 11.481s of full operation drain, before the unchanged 60s schema-admission window. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T09-04-17-360Z.report.json]
- **formation-joining-ready-phase-fence-live-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-18T11-19-30-426Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T11-19-30-426Z.report.json]
- **formation-joining-ready-phase-fence-live-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-18T11-19-30-426Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T11-19-30-426Z.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-18T08:49:36.209Z | formation-joining-ready-phase-fence-live-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/formation-joining-ready-phase-fence-live/attempt-1.diff |
