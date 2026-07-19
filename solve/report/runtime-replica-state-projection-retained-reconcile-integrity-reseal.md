# Solve report: runtime-replica-state-projection-retained-reconcile-integrity-reseal

**Goal:** Runtime replica lifecycle completion hands desired state to one production-wired retained projection owner without waiting on services-table writes; that owner composes ServicesOwner and the existing owner-key reconcile queue to serialize and coalesce the latest state per replica and retry typed failures, and three consecutive fresh MovieLens runs report priority metric 0.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 1

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: runtime-replica-state-projection-retained-reconcile
- plan: solve/epics/topology-convergence-hardening.md

## Current Blocker
- Frontier: runtime-replica-state-projection-retained-reconcile-integrity-reseal-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for runtime-replica-state-projection-retained-reconcile-integrity-reseal-main

## Continuation
- Status: allowed
- Next action: continue supervised step for runtime-replica-state-projection-retained-reconcile-integrity-reseal-main
- Blocker: none

## Scope Pressure
- Changed files: 10
- Change bytes: 52046
- Owner areas: src/query, src/runtime, src/workflow, test/runtime, test/workflow
- Categories: runtime, test
- Action: land or separate 5 owner areas: src/query, src/runtime, src/workflow, test/runtime, test/workflow
- Split plan:
  - src/query: 4 file(s)
  - src/runtime: 2 file(s)
  - test/runtime: 2 file(s)
  - src/workflow: 1 file(s)
  - test/workflow: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **runtime-replica-state-projection-retained-reconcile-integrity-reseal-main** [open] rung 0, attempts 1, metric 1 -> 1

## Findings
_(none recorded)_

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-19T18:38:40.159Z | runtime-replica-state-projection-retained-reconcile-integrity-reseal-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/runtime-replica-state-projection-retained-reconcile-integrity-reseal/attempt-1.diff |
