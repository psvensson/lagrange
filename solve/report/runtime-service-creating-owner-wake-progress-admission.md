# Solve report: runtime-service-creating-owner-wake-progress-admission

**Goal:** A target-observed ACTIVE outcome for a source-owned remote runtime-service ADD re-enters the canonical source owner while its durable row is CREATING, reconciles the exact target services row to terminal ACTIVE without target-side workflow writes or broad non-system create replay, and three consecutive fresh MovieLens runs report priority metric 0.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 2

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: runtime-replica-state-projection-retained-reconcile-integrity-reseal
- plan: solve/epics/topology-convergence-hardening.md

## Current Blocker
- Frontier: runtime-service-creating-owner-wake-progress-admission-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for runtime-service-creating-owner-wake-progress-admission-main

## Continuation
- Status: allowed
- Next action: continue supervised step for runtime-service-creating-owner-wake-progress-admission-main
- Blocker: none

## Scope Pressure
- Changed files: 11
- Change bytes: 29989
- Owner areas: src/constants, src/control-plane, src/rebalancer, test/control-plane, test/rebalancer
- Categories: runtime, test
- Action: split by owner area before the next attempt (11 files)
- Action: land or separate 5 owner areas: src/constants, src/control-plane, src/rebalancer, test/control-plane, test/rebalancer
- Split plan:
  - src/control-plane: 4 file(s)
  - src/rebalancer: 4 file(s)
  - src/constants: 1 file(s)
  - test/control-plane: 1 file(s)
  - test/rebalancer: 1 file(s)
- Signal: broad-source-scope severity=medium
- Signal: large-diff-stack severity=medium

## Frontiers
- **runtime-service-creating-owner-wake-progress-admission-main** [open] rung 0, attempts 2, metric 1 -> 1

## Findings
- **runtime-service-creating-owner-wake-progress-admission-main**: DT red-on-revert proven for test/control-plane/replica-dispatch-runtime-target-progress-wake.test.js [dt:solve/changes/dt-prove/replica-dispatch-runtime-target-progress-wake.test.js-2026-07-19T19-39-35-247Z.json]
- **runtime-service-creating-owner-wake-progress-admission-main**: DT red-on-revert proven for test/control-plane/replica-dispatch-runtime-target-progress-wake.test.js [dt:solve/changes/dt-prove/replica-dispatch-runtime-target-progress-wake.test.js-2026-07-19T19-40-44-674Z.json]
- **runtime-service-creating-owner-wake-progress-admission-main**: DT red-on-revert proven for test/control-plane/replica-dispatch-runtime-target-progress-wake.test.js [dt:solve/changes/dt-prove/replica-dispatch-runtime-target-progress-wake.test.js-2026-07-19T19-44-34-019Z.json]
- **runtime-service-creating-owner-wake-progress-admission-main**: Live Demo 2 engaged the exact target-progress seam: target services row r2 was ACTIVE, remote ADD a737532b-b8ad-4e24-801c-135237dcc809 remained CREATING, and the source dispatch gate dropped the canonical wake before owner reconciliation. [file:solve/changes/runtime-replica-state-projection-retained-reconcile-integrity-reseal/post-live-ordered-gate-boundary-move-2026-07-19.md]
- **runtime-service-creating-owner-wake-progress-admission-main**: DT red-on-revert proven for test/control-plane/replica-dispatch-runtime-target-progress-wake.test.js [dt:solve/changes/dt-prove/replica-dispatch-runtime-target-progress-wake.test.js-2026-07-19T19-49-09-984Z.json]
- **runtime-service-creating-owner-wake-progress-admission-main**: Independent verification rejected this exact attempt: six new terminaliz* test strings violate STYLE-0012; functional mechanism review otherwise passed. [subagent:verify_runtime_wake_attempt]
- **runtime-service-creating-owner-wake-progress-admission-main**: DT red-on-revert proven for test/control-plane/replica-dispatch-runtime-target-progress-wake.test.js [dt:solve/changes/dt-prove/replica-dispatch-runtime-target-progress-wake.test.js-2026-07-19T19-56-04-324Z.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-19T19:49:55.334Z | runtime-service-creating-owner-wake-progress-admission-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/runtime-service-creating-owner-wake-progress-admission/attempt-1.diff |
| 2026-07-19T19:56:21.893Z | runtime-service-creating-owner-wake-progress-admission-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/runtime-service-creating-owner-wake-progress-admission/attempt-2.diff |
