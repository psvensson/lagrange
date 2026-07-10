# Solve report: solver-terminal-integrity-cutover

**Goal:** Solver terminal events are emitted only from accepted measured evidence; honest non-measurements use a dedicated bounded event and cannot progress or solve; unresolved version-2 integrity violations and unverifiable legacy accepted-after-violation histories fail audit; terminal report and next projections omit active blocker and continuation sections.

**Class:** process · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/solver-terminal-integrity-cutover-2026-07-10T13-09-38-915Z.report.json

**Attempts:** 1

## Links
- spec: solve/specs/owner-boundary-hardening-and-unification/implementation-plan.md#W1
- plan: solve/epics/owner-boundary-hardening-and-unification.md

## Scope Pressure
- Changed files: 13
- Owner areas: scripts/solve, solve, test/solve
- Categories: workflow
- Action: split by owner area before the next attempt (13 files)
- Action: land or separate 3 owner areas: scripts/solve, solve, test/solve
- Split plan:
  - scripts/solve: 9 file(s)
  - test/solve: 3 file(s)
  - solve: 1 file(s)
- Signal: broad-source-scope severity=medium
- Signal: large-diff-stack severity=medium

## Frontiers
- **solver-terminal-integrity-cutover-main** [solved] rung 0, attempts 1, metric 1 -> 0

## Findings
- **solver-terminal-integrity-cutover-main**: Independent final-diff verifier approved W1 terminal integrity after reproducing SOLVED and EXHAUSTED attacks for unresolved, malformed, missing-evidence, missing-changeRef, and tampered-artifact histories; focused regression 403 assertions passed [subagent:/root/w1_solver_integrity_verify]
- **solver-terminal-integrity-cutover-main**: Ingested evidence from solver-terminal-integrity-cutover-2026-07-10T13-36-43-379Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/solver-terminal-integrity-cutover-2026-07-10T13-36-43-379Z.report.json]
- **solver-terminal-integrity-cutover-main**: Ingested evidence from solver-terminal-integrity-cutover-2026-07-10T13-36-43-379Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/solver-terminal-integrity-cutover-2026-07-10T13-36-43-379Z.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-10T13:09:46.218Z | solver-terminal-integrity-cutover-main | observe | 1 -> 0 | progress | no_evidence |  | diff:solve/changes/solver-terminal-integrity-cutover/attempt-1.diff |
