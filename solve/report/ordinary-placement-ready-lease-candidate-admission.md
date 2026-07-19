# Solve report: ordinary-placement-ready-lease-candidate-admission

**Goal:** For ordinary non-system placement, a published node whose ready lease has expired is absent from available candidates while a repair-eligible node with a current lease remains eligible, and the unchanged fresh MovieLens live gate reports priority metric 0.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 1

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: runtime-service-active-outcome-remote-owner-handoff
- plan: solve/epics/topology-convergence-hardening.md

## Current Blocker
- Frontier: ordinary-placement-ready-lease-candidate-admission-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for ordinary-placement-ready-lease-candidate-admission-main
- No longer current: runtime handler emitter identity, missing runtime replicas, and local coordinator terminalization

## Continuation
- Status: allowed
- Next action: continue supervised step for ordinary-placement-ready-lease-candidate-admission-main
- Blocker: none

## Scope Pressure
- Changed files: 2
- Change bytes: 6833
- Owner areas: src/rebalancer, test/rebalancer
- Categories: runtime
- Split plan:
  - src/rebalancer: 1 file(s)
  - test/rebalancer: 1 file(s)
- Signals: none

## Frontiers
- **ordinary-placement-ready-lease-candidate-admission-main** [open] rung 0, attempts 1, metric 1 -> 1

## Findings
- **ordinary-placement-ready-lease-candidate-admission-main**: inherited from runtime-service-active-outcome-remote-owner-handoff: Archived live operations were source-owned on node f7328137 while remote RuntimeServiceHandlers on ae945240 and 6c015c61 completed ACTIVE; the target-node coordinator's existing target-executor-outcome handoff forwards partition CREATE_ACTIVE but excludes runtime-service CREATE_ACTIVE, so the source owner receives no wake and both rows remain CREATING. (rules out: runtime handler emitter identity, missing runtime replicas, and local coordinator terminalization) [file:solve/changes/formation-background-release-quiescence-anchor-live/post-attempt-5-live-runtime-outcome-handoff-2026-07-19.md]
- **ordinary-placement-ready-lease-candidate-admission-main**: On committed source fingerprint ff15a6dbebbca7bd, fresh ordered Demo 2 completed only local runtime-service ADD 6e1d8115-6b7f-4e79-8155-1041a7ecd93f, then repeatedly planned published expired-lease target 19eb1497-4db7-4fbc-a04f-455d57845d6f and rejected it before execution while current-lease alternatives remained. [file:solve/changes/runtime-service-active-outcome-remote-owner-handoff/post-attempt-1-live-candidate-readiness-boundary-2026-07-19.md]
- **ordinary-placement-ready-lease-candidate-admission-main**: DT red-on-revert proven for test/rebalancer/runtime-service-expired-lease-candidate-admission.test.js [dt:solve/changes/dt-prove/runtime-service-expired-lease-candidate-admission.test.js-2026-07-19T16-27-30-846Z.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-19T16:29:40.782Z | ordinary-placement-ready-lease-candidate-admission-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/ordinary-placement-ready-lease-candidate-admission/attempt-1.diff |
