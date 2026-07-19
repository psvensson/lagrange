# Solve report: formation-liveness-dependency-serial-planner

**Goal:** nodes-p1 remains non-priority while one serial goal-state owner, given current owner-authored recovery-eligible quorum, transport, inventory, and source/leader evidence, emits at most one executable formation move per tick or progresses the existing transition; missing evidence emits none, ordinary placement remains fail-closed, only real heartbeat owners renew admission leases, and the unchanged MovieLens gate passes 5-of-5 formation probes followed by 3-of-3 full demos.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 1

## Links
- spec: solve/epics/formation-complexity-consolidation.md
- parent quest: effective-placement-serial-priority-planner
- plan: solve/epics/formation-complexity-consolidation.md

## Current Blocker
- Frontier: formation-liveness-dependency-serial-planner-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for formation-liveness-dependency-serial-planner-main

## Continuation
- Status: allowed
- Next action: continue supervised step for formation-liveness-dependency-serial-planner-main
- Blocker: none

## Scope Pressure
- Changed files: 16
- Change bytes: 46563
- Owner areas: scripts/run-formation-liveness-dependency-serial-planner-scenarios.js, src/bootstrap, src/rebalancer, test/bootstrap, test/rebalancer
- Categories: other, runtime
- Action: split by owner area before the next attempt (16 files)
- Action: land or separate 5 owner areas: scripts/run-formation-liveness-dependency-serial-planner-scenarios.js, src/bootstrap, src/rebalancer, test/bootstrap, test/rebalancer
- Split plan:
  - src/rebalancer: 7 file(s)
  - test/rebalancer: 4 file(s)
  - src/bootstrap: 2 file(s)
  - test/bootstrap: 2 file(s)
  - scripts/run-formation-liveness-dependency-serial-planner-scenarios.js: 1 file(s)
- Signal: broad-source-scope severity=medium
- Signal: large-diff-stack severity=medium

## Frontiers
- **formation-liveness-dependency-serial-planner-main** [open] rung 1, attempts 1, metric 1 -> 1

## Findings
- **formation-liveness-dependency-serial-planner-main**: Inherited from movielens-nodes-priority-recovery-escape: broad NODES membership in the priority-control-plane set changed nodes-p1 from delayed planning to advance-now recovery but did not improve the live outcome. (rules out: Do not add NODES to PRIORITY_CONTROL_PLANE_TABLE_IDS or otherwise grant nodes-p1 the broad priorityControlPlane identity.) [solve/changes/movielens-nodes-priority-recovery-escape/live-ab-summary.json]
- **formation-liveness-dependency-serial-planner-main**: Inherited from independent aggregate rejection: the broad priority classification produced 3 and 4 final in-flight operations versus 2 and 2 reverted, 5622 versus 1711 level-50 events, and 344 versus 29 nodes-linked warnings. (rules out: Do not approve a deterministic engagement-only result; require controlled live A/B with no aggregate load amplification and meaningful outcome or sealed-milestone improvement.) [solve/changes/movielens-nodes-priority-recovery-escape/live-ab-summary.json]
- **formation-liveness-dependency-serial-planner-main**: Inherited ownership boundary: an authoritative snapshot reread may reveal node leases but cannot renew them; expired leases must continue to block schema admission until heartbeat owners durably advance nodes-p1. (rules out: Do not synthesize ready leases or ACTIVE status, treat observation as readiness, weaken cache_stale_watermark, widen live budgets, or speed retries to hide the dependency cycle.) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-19T23-05-19-103Z.report.json]
- **formation-liveness-dependency-serial-planner-main**: Independent verifier AMEND verdict confirms a distinct formationLivenessDependency scoped to nodes-p1 is materially safer than broad priority classification, provided it is consumed only by the serial owner and matching topology/target admission seams and remains fail-closed on explicit owner-authored evidence. (rules out: Do not silently broaden the exhausted O3 seal; this structural successor owns the narrow non-priority cutover and its stronger deterministic and live A/B gates.) [subagent:verify_live_stale_watermark]
- **formation-liveness-dependency-serial-planner-main**: DT red-on-revert proven for test/rebalancer/formation-liveness-dependency-serial-planner.test.js [dt:solve/changes/dt-prove/formation-liveness-dependency-serial-planner.test.js-2026-07-19T23-27-57-766Z.json]
- **formation-liveness-dependency-serial-planner-main**: Deterministic aggregate is green except for the intentionally pending source-bound live gate; ordinary system and non-system controls, schema lease freshness, publication visibility, inventory, and model contracts pass. [report:test-output/reports/formation-liveness-dependency-serial-planner-2026-07-19T23-29-36-045Z.report.json]
- **formation-liveness-dependency-serial-planner-main**: DT red-on-revert proven for test/rebalancer/formation-liveness-dependency-serial-planner.test.js [dt:solve/changes/dt-prove/formation-liveness-dependency-serial-planner.test.js-2026-07-19T23-33-56-237Z.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-19T23:36:18.656Z | formation-liveness-dependency-serial-planner-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/formation-liveness-dependency-serial-planner/attempt-3.diff.json |
