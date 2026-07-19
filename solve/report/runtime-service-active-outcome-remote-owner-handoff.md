# Solve report: runtime-service-active-outcome-remote-owner-handoff

**Goal:** When a remote RuntimeServiceHandler completes a coordinator-created runtime-service ADD, its target-node RebalanceCoordinator routes RUNTIME_SERVICE_CREATE_ACTIVE through the existing bounded target-executor-outcome handoff to the canonical source owner, so the target observer never mutates remote-owned workflow state, the source operation re-enters canonical dispatch and terminalization instead of remaining CREATING, and the unchanged fresh MovieLens live gate reports priority metric 0.

**Class:** product · **Closure:** MEASURED

**Outcome:** EXHAUSTED — 1 frontier(s) parked; human decision needed

**Attempts:** 1

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: formation-background-release-quiescence-anchor-live
- plan: solve/epics/topology-convergence-hardening.md

## Scope Pressure
- Changed files: 2
- Change bytes: 4776
- Owner areas: src/rebalancer, test/rebalancer
- Categories: runtime
- Split plan:
  - src/rebalancer: 1 file(s)
  - test/rebalancer: 1 file(s)
- Signals: none

## Frontiers
- **runtime-service-active-outcome-remote-owner-handoff-main** [parked {exhausted}] rung 0, attempts 1, metric 1 -> 1 — The sealed remote-outcome classification is fixed and verified; fresh live failure moved before remote operation creation to expired-lease candidate selection, which is outside this Quest's bounded-active-create scope and requires a successor Quest.

## Findings
- **runtime-service-active-outcome-remote-owner-handoff-main**: DT red-on-revert proven for test/rebalancer/coordinator-created-user-partition-remote-outcome.test.js [dt:solve/changes/dt-prove/coordinator-created-user-partition-remote-outcome.test.js-2026-07-19T15-32-41-673Z.json]
- **runtime-service-active-outcome-remote-owner-handoff-main**: Archived live operations were source-owned on node f7328137 while remote RuntimeServiceHandlers on ae945240 and 6c015c61 completed ACTIVE; the target-node coordinator's existing target-executor-outcome handoff forwards partition CREATE_ACTIVE but excludes runtime-service CREATE_ACTIVE, so the source owner receives no wake and both rows remain CREATING. (rules out: runtime handler emitter identity, missing runtime replicas, and local coordinator terminalization) [file:solve/changes/formation-background-release-quiescence-anchor-live/post-attempt-5-live-runtime-outcome-handoff-2026-07-19.md]
- **runtime-service-active-outcome-remote-owner-handoff-main**: DT red-on-revert proven for test/rebalancer/coordinator-created-user-partition-remote-outcome.test.js [dt:solve/changes/dt-prove/coordinator-created-user-partition-remote-outcome.test.js-2026-07-19T15-33-51-313Z.json]
- **runtime-service-active-outcome-remote-owner-handoff-main**: Independent verification passed: exact patch fixes the archived remote-owner runtime ACTIVE outcome drop, preserves target non-writing and bounded transport/retry controls, and passes 220 focused assertions plus red-on-revert. [subagent:verify_runtime_remote_outcome]
- **runtime-service-active-outcome-remote-owner-handoff-main**: Fresh ordered Demo 2 created and terminalized only local operation 6e1d8115-6b7f-4e79-8155-1041a7ecd93f; no remote second operation existed. Later cycles repeatedly selected expired-lease node 19eb1497-4db7-4fbc-a04f-455d57845d6f through repairEligible candidate discovery and rejected it at pre-execution while healthy alternatives existed. [file:solve/changes/runtime-service-active-outcome-remote-owner-handoff/post-attempt-1-live-candidate-readiness-boundary-2026-07-19.md]
- **runtime-service-active-outcome-remote-owner-handoff-main**: Aggregate independent verification approved the narrow remote runtime ACTIVE classifier and EXHAUSTED disposition, not SOLVED: Demo 2 contained only local operation 6e1d8115, while Demo 1 remote operation 3ef199ca engaged bounded handoff but still ended CREATING. [subagent:verify_runtime_remote_outcome_aggregate]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-19T15:34:02.068Z | runtime-service-active-outcome-remote-owner-handoff-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/runtime-service-active-outcome-remote-owner-handoff/attempt-1.diff |
