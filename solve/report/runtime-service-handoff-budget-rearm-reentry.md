# Solve report: runtime-service-handoff-budget-rearm-reentry

**Goal:** A coordinator-created remote handoff for a non-system runtime-service ADD that stops at its operation budget — with the target replica creation already completed and the source durable operation row still CREATING after a deferred source dispatch — is not stranded: the planner rearm or ready-node replay path re-enters the exact parked operation through the canonical source owner and drives the exact target services row to terminal ACTIVE, proven by a deterministic production-seam discriminator modeling the exact 2026-07-21T08:13 live ordering (dispatch deferred while control-plane path recovers, target CREATE_REPLICA completed, coordinator-created handoff retry stopped at budget with workflowStep CREATING, retry state cleared) with red-on-revert for any fix, no timeout or budget widening, no broad non-system create replay, byte-identical behavior for system operations, and the unchanged five-node MovieLens live scenario completing initial service placement.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 1

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: movielens-three-way-affinity-demo
- plan: solve/epics/topology-convergence-hardening.md

## Current Blocker
- Frontier: runtime-service-handoff-budget-rearm-reentry-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: observation_gap
- Movement: narrowed: FAIL -> FAIL
- Latest evidence: test-output/reports/movielens-lagrange-service-affinity-live-2026-07-21T09-17-47-855Z.report.json
- Selected theory: none
- Next move: continue supervised step for runtime-service-handoff-budget-rearm-reentry-main
- No longer current: FAIL

## Continuation
- Status: allowed
- Next action: continue supervised step for runtime-service-handoff-budget-rearm-reentry-main
- Blocker: none

## Scope Pressure
- Changed files: 3
- Change bytes: 4455
- Owner areas: src/control-plane
- Categories: runtime
- Split plan:
  - src/control-plane: 3 file(s)
- Signals: none

## Frontiers
- **runtime-service-handoff-budget-rearm-reentry-main** [open] rung 1, attempts 1, metric 1 -> 1

## Findings
- **runtime-service-handoff-budget-rearm-reentry-main**: DT red-on-revert proven for test/control-plane/replica-dispatch-runtime-target-progress-retained-verification.test.js [dt:solve/changes/dt-prove/replica-dispatch-runtime-target-progress-retained-verification.test.js-2026-07-21T08-59-41-385Z.json]
- **runtime-service-handoff-budget-rearm-reentry-main**: Two post-fix live samples fail before or beside the sealed seam, not at it: the 09:04 run timed out at schema admission on cache_stale_watermark (authoritative-observation watermark lineage, pre-dispatch), and the 09:17 run never planned any non-system move because the rebalancer logged 'Deferring non-system rebalancing until priority control-plane partitions spread' every ~72s for the whole window (priority-spread lineage) — zero runtime-service dispatches occurred, so the sealed handoff-strand ordering was never exercised live. The sealed seam itself is deterministically proven: the discriminator reproduces the 08:21 strand red on unfixed source and the retained-verification fix is red-on-revert-proven (dt-prove artifact solve/changes/dt-prove/replica-dispatch-runtime-target-progress-retained-verification.test.js-2026-07-21T08-59-41-385Z.json), with 531/531 replica-dispatch family assertions green. Live doneWhen closure waits on those adjacent owner lineages; do not spend further live runs for this quest until they move. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-21T09-17-47-855Z.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-21T09:18:58.279Z | runtime-service-handoff-budget-rearm-reentry-main | observe | 1 -> 1 | flat | narrowed |  | diff:solve/changes/runtime-service-handoff-budget-rearm-reentry/attempt-1.diff |
