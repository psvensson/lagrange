# Solve report: effective-placement-serial-priority-planner

**Goal:** Every priority control-plane partition is planned from one immutable EffectivePlacement built from the canonical replica inventory and target topology. One serial goal-state owner emits at most one new move per partition tick, or none while an existing transition needs progress, using the precedence failed-replica REMOVE, true-deficit ADD, spread-restoring ADD, monotonic-safe surplus REMOVE, then count-neutral REPLACE. Existing classifiers and admission valves consume that decision until the fixed live gate passes; superseded priority-only parallel candidate and classifier branches are then deleted.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 1

## Links
- spec: solve/epics/formation-complexity-consolidation.md
- plan: solve/epics/convergence-loop-and-workflow-overhead.md

## Current Blocker
- Frontier: effective-placement-serial-priority-planner-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for effective-placement-serial-priority-planner-main

## Continuation
- Status: allowed
- Next action: continue supervised step for effective-placement-serial-priority-planner-main
- Blocker: none

## Scope Pressure
- Changed files: 9
- Change bytes: 46109
- Owner areas: architecture, scripts/run-effective-placement-serial-priority-planner-scenarios.js, scripts/run-live-repetitions.js, src/rebalancer, test/rebalancer, test/scripts
- Categories: docs, other, runtime, test
- Action: land or separate 6 owner areas: architecture, scripts/run-effective-placement-serial-priority-planner-scenarios.js, scripts/run-live-repetitions.js, src/rebalancer, test/rebalancer, test/scripts
- Split plan:
  - src/rebalancer: 2 file(s)
  - test/rebalancer: 2 file(s)
  - test/scripts: 2 file(s)
  - architecture: 1 file(s)
  - scripts/run-effective-placement-serial-priority-planner-scenarios.js: 1 file(s)
  - scripts/run-live-repetitions.js: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **effective-placement-serial-priority-planner-main** [open] rung 1, attempts 1, metric 1 -> 1

## Findings
- **effective-placement-serial-priority-planner-main**: DT red-on-revert proven for test/rebalancer/effective-placement-serial-priority-planner.test.js [dt:solve/changes/dt-prove/effective-placement-serial-priority-planner.test.js-2026-07-19T12-37-34-425Z.json]
- **effective-placement-serial-priority-planner-main**: DT red-on-revert proven for test/rebalancer/effective-placement-serial-priority-planner.test.js [dt:solve/changes/dt-prove/effective-placement-serial-priority-planner.test.js-2026-07-19T12-50-59-896Z.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-19T12:58:00.257Z | effective-placement-serial-priority-planner-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/effective-placement-serial-priority-planner/attempt-1.diff |
