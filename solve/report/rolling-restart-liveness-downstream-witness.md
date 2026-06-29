# Solve report: rolling-restart-liveness-downstream-witness

**Goal:** The rolling-restart liveness analyzer enriches stuck_downstream_workflow_progress verdicts with a structured downstream workflow witness from priority-recovery and quiescence evidence, so known run4-family drain/in-flight stalls name the operation owner, partition, operation id, current workflow step, actuation state, queue/pressure state, and canonical blocker without treating replica_operations_in_flight as success or masking it.

**Class:** process · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: solve/oracle/rolling-restart-liveness-downstream-witness.json

**Attempts:** 1

## Links
- roadmap row: RM-0.1-fs-rolling-restart
- spec: membership-lifecycle-placement-hard-cutover
- parent quest: rolling-restart-liveness-log-replay
- plan: solve/epics/rolling-restart-liveness-observatory.md

## Current Blocker
- Frontier: downstream-workflow-witness
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for downstream-workflow-witness

## Continuation
- Status: allowed
- Next action: No open frontier remains; inspect solve report.
- Blocker: none

## Scope Pressure
- Changed files: 2
- Owner areas: scripts/rolling-restart-liveness-classifier.js, test/scripts
- Categories: other, test
- Split plan:
  - scripts/rolling-restart-liveness-classifier.js: 1 file(s)
  - test/scripts: 1 file(s)
- Signals: none

## Frontiers
- **downstream-workflow-witness** [solved] rung 0, attempts 1, metric 4 -> 0

## Findings
- **downstream-workflow-witness**: Subagent verifier found no correctness issues: run4/run7 produce structured downstreamWorkflow observed witnesses, run7 preserves replica_operations_in_flight as canonical blocker, and run1 remains stuck_executed_no_visibility with downstreamWorkflow absent. [subagent:019f1250-c916-70e1-bbcb-8947d14a2d90]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-06-29T07:38:04.185Z | downstream-workflow-witness | observe | 4 -> 0 | progress | no_evidence |  | diff:solve/changes/rolling-restart-liveness-downstream-witness/attempt-1.diff |
