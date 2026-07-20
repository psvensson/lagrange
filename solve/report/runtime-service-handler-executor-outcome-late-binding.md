# Solve report: runtime-service-handler-executor-outcome-late-binding

**Goal:** Seed and joining startup late-bind an already-created RuntimeServiceHandler to the canonical RebalanceCoordinator executor-outcome emitter when control-plane setup resolves it, so successful and failed runtime-service executor outcomes retain one owner, runtime ADD/REPLACE operations terminalize instead of remaining CREATING, the runtime-service rebalancer schedules its next affinity-policy evaluation, and the unchanged fresh MovieLens live gate reports priority metric 0.

**Class:** product · **Closure:** MEASURED

**Outcome:** EXHAUSTED — 1 frontier(s) parked; human decision needed

**Attempts:** 1

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: formation-background-release-quiescence-anchor-live
- plan: solve/epics/topology-convergence-hardening.md

## Scope Pressure
- Changed files: 6
- Change bytes: 11828
- Owner areas: src/bootstrap, test/bootstrap
- Categories: runtime
- Split plan:
  - src/bootstrap: 3 file(s)
  - test/bootstrap: 3 file(s)
- Signals: none

## Frontiers
- **runtime-service-handler-executor-outcome-late-binding-main** [parked {exhausted}] rung 0, attempts 1, metric 1 -> 1 — Archived live logs and actual-order seed/join composition prove the runtime handler is created after the coordinator and receives its exact emitter; the sealed late-binding frame is refuted, while the measured defect moved to the remote-owner outcome handoff classifier.

## Findings
- **runtime-service-handler-executor-outcome-late-binding-main**: DT red-on-revert proven for test/bootstrap/bootstrap-sequence.test.js [dt:solve/changes/dt-prove/bootstrap-sequence.test.js-2026-07-19T15-07-44-870Z.json]
- **runtime-service-handler-executor-outcome-late-binding-main**: DT red-on-revert proven for test/bootstrap/node-joining-service-join-lifecycle-resume.test.js [dt:solve/changes/dt-prove/node-joining-service-join-lifecycle-resume.test.js-2026-07-19T15-08-04-321Z.json]
- **runtime-service-handler-executor-outcome-late-binding-main**: DT red-on-revert proven for test/bootstrap/bootstrap-sequence.test.js [dt:solve/changes/dt-prove/bootstrap-sequence.test.js-2026-07-19T15-13-03-498Z.json]
- **runtime-service-handler-executor-outcome-late-binding-main**: DT red-on-revert proven for test/bootstrap/node-joining-service-join-lifecycle-resume.test.js [dt:solve/changes/dt-prove/node-joining-service-join-lifecycle-resume.test.js-2026-07-19T15-13-10-178Z.json]
- **runtime-service-handler-executor-outcome-late-binding-main**: Exact attempt 1 proves only the reverse startup ordering: archived live nodes created ControlPlaneSetup about 5ms before RuntimeServiceHandler, so the late-binding helper ran while the runtime handler was absent; the subsequent runtime-handler factory already receives the coordinator emitter. Replacement must reproduce the actual fresh-start order and identify where that emitter identity is lost. (rules out: runtime handler existing before control-plane setup in the fresh MovieLens failure) [subagent:verify_runtime_outcome_binding]
- **runtime-service-handler-executor-outcome-late-binding-main**: Fresh-run ordering and production-path regression refute the sealed late-binding premise: seed/join create the local RebalanceCoordinator first and the later RuntimeServiceHandler receives that exact emitter. The target coordinator consumes RUNTIME_SERVICE_CREATE_ACTIVE, observes the ADD is source-owned, then drops it because remote-owner handoff recognizes only REPLICA_CREATE_ACTIVE; adding runtime ACTIVE to that existing handoff decision wakes the canonical source owner without mutating target-observed workflow state. (rules out: missing or stale RuntimeServiceHandler executorOutcomeEmitter as the cause of the 2026-07-19 live stall) [file:solve/changes/formation-background-release-quiescence-anchor-live/post-attempt-5-live-runtime-outcome-handoff-2026-07-19.md]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-19T15:15:54.328Z | runtime-service-handler-executor-outcome-late-binding-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/runtime-service-handler-executor-outcome-late-binding/attempt-1.diff |
