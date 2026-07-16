# Solve report: movielens-nodes-priority-recovery-escape

**Goal:** The unchanged MovieLens service-affinity live scenario reaches PASS while ready-lease admission remains owner-authored, quorum-bounded, and fail-closed.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 1

## Links
- parent quest: movielens-authoritative-observation-watermark

## Current Blocker
- Frontier: movielens-nodes-priority-recovery-escape-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: theory-20260716-nodes-p1-priority-recovery-escape-child (stale: selected theory status is falsified)
- Next move: record or select a fresh frontier theory for movielens-nodes-priority-recovery-escape-main
- No longer current: Do not change heartbeat priority, lease validity, admission, or live budgets; test only canonical recovery classification.

## Continuation
- Status: blocked-theory
- Next action: record or select a fresh frontier theory for movielens-nodes-priority-recovery-escape-main
- Blocker: selected theory stale: selected theory status is falsified

## Scope Pressure
- Changed files: 6
- Change bytes: 10850
- Owner areas: src/bootstrap, test/bootstrap, test/control-plane, test/rebalancer
- Categories: runtime, test
- Action: land or separate 4 owner areas: src/bootstrap, test/bootstrap, test/control-plane, test/rebalancer
- Split plan:
  - test/bootstrap: 2 file(s)
  - test/rebalancer: 2 file(s)
  - src/bootstrap: 1 file(s)
  - test/control-plane: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **movielens-nodes-priority-recovery-escape-main** [open] rung 1, attempts 1, metric 1 -> 1

## Findings
- **movielens-nodes-priority-recovery-escape-main**: On the current pinned source, the five-node real checkRebalance discriminator reproduced the predicted cycle: nodes-p1 performed zero evaluations and scheduled a 75000ms settling retry with three recovery-eligible nodes, while the established priority partition proceeded; the new expectations were the only failures. (rules out: Do not change heartbeat priority, lease validity, admission, or live budgets; test only canonical recovery classification.) [test/rebalancer/unified-rebalancer-triggers-critical-deferral.test.js]

## Theories
- **theory-20260716-nodes-placement-readiness-circularity-child** [active] system, mechanism nodes-p1 placement depends on ready leases whose durable publication depends on spreading nodes-p1, owner system-partition classification and UnifiedRebalancer priority recovery owner, modelGate npm run model:contracts
- **theory-20260716-nodes-p1-priority-recovery-escape-child** [falsified] frontier, frontier movielens-nodes-priority-recovery-escape-main, layer ownership, mechanism nodes_p1_excluded_from_priority_recovery_class, owner system-partition classification owner, boundary nodes-p1 classification to UnifiedRebalancer quorum recovery gate, modelGate npm run model:contracts

## Selected Theories
- **movielens-nodes-priority-recovery-escape-main**: theory-20260716-nodes-p1-priority-recovery-escape-child

## Theory Results
- **theory-20260716-nodes-p1-priority-recovery-escape-child**: falsified (scenario=failed, theory=falsified, movement=no_evidence) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-16T12-23-19-124Z.report.json]

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-16T15:58:21.426Z | movielens-nodes-priority-recovery-escape-main | observe | 1 -> 1 | flat | no_evidence | theory-20260716-nodes-p1-priority-recovery-escape-child | diff:solve/changes/movielens-nodes-priority-recovery-escape/attempt-1.diff |
